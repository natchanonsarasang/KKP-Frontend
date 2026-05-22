import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PhoneCall, CheckCircle, XCircle, Clock, AlertCircle,
  PhoneOff, RefreshCw, Copy, Search, Download, FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalyticsStats } from "./analytics/AnalyticsStats";
import {
  HourlyPickupChart,
  DayOfWeekChart,
  OutcomeDistributionChart,
  TemplatePerformanceChart,
  TrendChart,
  MainStatusOverview,
  SubStatusOverview,
} from "./analytics/CallAnalyticsCharts";
import { BestTimeInsights } from "./analytics/BestTimeInsights";
import { useAdmin } from "@/contexts/AdminContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import * as XLSX from "xlsx";
import { format, subDays, subMonths, subYears, startOfDay, endOfDay } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange as DayPickerRange } from "react-day-picker";
import { th } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface CallRecord {
  id: string;
  phone_number: string;
  due_date: string | null;
  amount: string | null;
  status: string | null;
  botnoi_call_id: string | null;
  created_at: string;
  updated_at: string;
  template_id: string | null;
  call_duration: number | null;
  result_data: Record<string, unknown> | null;
  appointment_date: string | null;
  appointment_time: string | null;
  user_id: string | null;
  workspace_id: string | null;
}

interface CallListItem {
  id: string;
  status: string;
  picked_up: boolean | null;
  call_outcome: string | null;
  scheduled_at: string | null;
  called_at: string | null;
  created_at: string;
  template_id: string | null;
  ai_category?: string | null;
  debtor_id: string;
}

interface Debtor {
  id: string;
  name: string | null;
  last_name: string | null;
  phone_number: string;
  total_debt: number | null;
  due_date: string | null;
  variables: Record<string, string> | null;
}

interface Template {
  id: string;
  message: string;
  org_name: string;
}

type DateRangeType = "today" | "week" | "month" | "year" | "all" | "custom";

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  pending: { label: "Pending", color: "bg-muted text-muted-foreground", icon: Clock },
  calling: { label: "Calling", color: "bg-primary/10 text-primary", icon: PhoneCall },
  confirmed: { label: "Confirmed", color: "bg-success/10 text-success", icon: CheckCircle },
  declined: { label: "Declined", color: "bg-destructive/10 text-destructive", icon: XCircle },
  completed: { label: "Completed", color: "bg-muted text-muted-foreground", icon: PhoneCall },
  no_response: { label: "No Response", color: "bg-warning/10 text-warning", icon: Clock },
  failed: { label: "Failed", color: "bg-destructive/10 text-destructive", icon: AlertCircle },
  no_answer: { label: "No Answer", color: "bg-muted text-muted-foreground", icon: PhoneOff },
};

const CallDashboard = () => {
  const queryClient = useQueryClient();
  const { effectiveUserId } = useAdmin();
  const { currentWorkspace } = useWorkspace();

  const [dateRange, setDateRange] = useState<DateRangeType>("today");
  const [customRange, setCustomRange] = useState<DayPickerRange | undefined>({
    from: new Date(),
    to: new Date(),
  });
  const [searchQuery, setSearchQuery] = useState("");
  const exportRef = useRef<HTMLDivElement>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const dateRangeLabel = useMemo(() => {
    if (dateRange === "all") return "ทั้งหมด";
    if (customRange?.from) {
      const from = format(customRange.from, "d MMM yyyy", { locale: th });
      const to = customRange.to ? format(customRange.to, "d MMM yyyy", { locale: th }) : from;
      return from === to ? from : `${from} - ${to}`;
    }
    return "";
  }, [dateRange, customRange]);

  const handleExportPdf = async () => {
    if (!exportRef.current) return;
    setIsExportingPdf(true);
    try {
      // Allow charts to layout
      await new Promise((r) => setTimeout(r, 400));
      const container = exportRef.current;
      const canvas = await html2canvas(container, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        windowWidth: container.scrollWidth,
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      // px-per-mm ratio of the rendered canvas
      const pxPerMm = canvas.width / pageW;
      const pageHeightPx = Math.floor(pageH * pxPerMm);

      // Collect section boundaries (in canvas pixels) so we can avoid
      // breaking pages through the middle of a card/chart.
      const containerRect = container.getBoundingClientRect();
      const domToCanvas = canvas.height / container.scrollHeight;
      const sections = Array.from(
        container.querySelectorAll<HTMLElement>("[data-pdf-section]")
      ).map((el) => {
        const r = el.getBoundingClientRect();
        const top = Math.floor((r.top - containerRect.top) * domToCanvas);
        const bottom = Math.ceil((r.bottom - containerRect.top) * domToCanvas);
        return { top, bottom };
      });

      const totalH = canvas.height;
      let pageStart = 0;
      let safetyPages = 0;
      while (pageStart < totalH && safetyPages < 50) {
        safetyPages += 1;
        let pageEnd = Math.min(pageStart + pageHeightPx, totalH);

        if (pageEnd < totalH) {
          // Find a section that straddles the proposed page break and snap
          // the break to that section's top (i.e. the whitespace above it).
          const straddling = sections
            .filter((s) => s.top > pageStart + 50 && s.top < pageEnd && s.bottom > pageEnd)
            .sort((a, b) => a.top - b.top)[0];
          if (straddling) {
            pageEnd = straddling.top;
          }
        }

        const sliceHeight = pageEnd - pageStart;
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;
        const ctx = pageCanvas.getContext("2d");
        if (!ctx) break;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(
          canvas,
          0,
          pageStart,
          canvas.width,
          sliceHeight,
          0,
          0,
          canvas.width,
          sliceHeight,
        );
        const imgData = pageCanvas.toDataURL("image/png");
        const renderedH = sliceHeight / pxPerMm;

        if (pageStart > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, 0, pageW, renderedH);

        pageStart = pageEnd;
      }

      const stamp = format(new Date(), "yyyy-MM-dd");
      pdf.save(`analytics-${stamp}.pdf`);
      toast.success("ส่งออก PDF เรียบร้อย");
    } catch (err) {
      console.error("PDF export failed", err);
      toast.error("ส่งออก PDF ไม่สำเร็จ");
    } finally {
      setIsExportingPdf(false);
    }
  };


  const handleDateRangeChange = (v: string) => {
    const range = v as DateRangeType;
    setDateRange(range);
    
    const now = new Date();
    if (range === "today") {
      setCustomRange({ from: now, to: now });
    } else if (range === "week") {
      setCustomRange({ from: subDays(now, 7), to: now });
    } else if (range === "month") {
      setCustomRange({ from: subMonths(now, 1), to: now });
    } else if (range === "year") {
      setCustomRange({ from: subYears(now, 1), to: now });
    } else if (range === "all") {
      setCustomRange(undefined);
    }
  };

  const getDateFilter = useCallback(() => {
    const now = new Date();
    switch (dateRange) {
      case "today": {
        return { 
          start: startOfDay(now).toISOString(),
          end: endOfDay(now).toISOString()
        };
      }
      case "week": {
        return { 
          start: subDays(now, 7).toISOString(),
          end: now.toISOString()
        };
      }
      case "month": {
        return { 
          start: subMonths(now, 1).toISOString(),
          end: now.toISOString()
        };
      }
      case "year": {
        return { 
          start: subYears(now, 1).toISOString(),
          end: now.toISOString()
        };
      }
      case "custom": {
        if (customRange?.from) {
          return {
            start: startOfDay(customRange.from).toISOString(),
            end: customRange.to ? endOfDay(customRange.to).toISOString() : endOfDay(customRange.from).toISOString()
          };
        }
        return { start: undefined, end: undefined };
      }
      default:
        return { start: undefined, end: undefined };
    }
  }, [dateRange, customRange]);

  const { data: callRecords, isLoading: loadingRecords, refetch: refetchRecords } = useQuery({
    queryKey: ["call-records", effectiveUserId, currentWorkspace?.id, dateRange, customRange],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];
      let query = supabase
        .from("call_records")
        .select("*")
        .eq("workspace_id", currentWorkspace.id)
        .order("created_at", { ascending: false });

      if (effectiveUserId) query = query.eq("user_id", effectiveUserId);
      const { start, end } = getDateFilter();
      if (start) query = query.gte("created_at", start);
      if (end) query = query.lte("created_at", end);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as CallRecord[];
    },
    refetchInterval: 10000,
    enabled: !!effectiveUserId && !!currentWorkspace?.id,
  });

  const { data: callListItems, isLoading: loadingItems, refetch: refetchItems } = useQuery({
    queryKey: ["call-list-items-analytics", effectiveUserId, currentWorkspace?.id, dateRange, customRange],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];
      let query = supabase
        .from("call_list_items")
        .select("*")
        .eq("workspace_id", currentWorkspace.id)
        .order("created_at", { ascending: false });

      if (effectiveUserId) query = query.eq("user_id", effectiveUserId);
      const { start, end } = getDateFilter();
      if (start) query = query.gte("created_at", start);
      if (end) query = query.lte("created_at", end);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as CallListItem[];
    },
    refetchInterval: 10000,
    enabled: !!effectiveUserId && !!currentWorkspace?.id,
  });

  const { data: debtors } = useQuery({
    queryKey: ["analytics-debtors", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];
      const { data, error } = await supabase
        .from("debtors")
        .select("id, name, last_name, phone_number, total_debt, due_date, variables")
        .eq("workspace_id", currentWorkspace.id);
      if (error) throw error;
      return data as Debtor[];
    },
    enabled: !!currentWorkspace?.id,
  });

  const { data: templates } = useQuery({
    queryKey: ["templates-analytics", effectiveUserId],
    queryFn: async () => {
      let query = supabase.from("call_templates").select("id, message, org_name");
      if (effectiveUserId) query = query.or(`user_id.eq.${effectiveUserId},is_system_default.eq.true`);
      const { data, error } = await query;
      if (error) throw error;
      return data as Template[];
    },
    enabled: !!effectiveUserId,
  });

  // Debtor lookup maps
  const debtorMap = useMemo(() => new Map((debtors || []).map((d) => [d.id, d])), [debtors]);
  const debtorByPhone = useMemo(() => {
    const map = new Map<string, Debtor>();
    (debtors || []).forEach((d) => map.set(d.phone_number, d));
    return map;
  }, [debtors]);

  // Enriched call history: join call_records with debtor info + call_list_items
  const enrichedRecords = useMemo(() => {
    if (!callRecords) return [];
    // Build a map from call_record_id -> call_list_item for outcome/pickup
    const cliByRecordId = new Map<string, CallListItem>();
    (callListItems || []).forEach((item) => {
      const recordId = (item as unknown as Record<string, unknown>).call_record_id as string | null;
      if (recordId) cliByRecordId.set(recordId, item);
    });

    return callRecords.map((record) => {
      const debtor = debtorByPhone.get(record.phone_number);
      const cli = cliByRecordId.get(record.id);
      const vars = debtor?.variables || {};
      const debtorName =
        vars.name ||
        (debtor ? `${debtor.name || ""} ${debtor.last_name || ""}`.trim() : "");
      const amountVal =
        vars.amount ||
        vars.outstanding_amount ||
        (debtor?.total_debt != null ? String(debtor.total_debt) : "") ||
        record.amount ||
        "";
      const dueDateVal = vars.due_date || debtor?.due_date || record.due_date || "";
      return {
        ...record,
        debtor_name: debtorName,
        amount: amountVal,
        due_date: dueDateVal,
        picked_up: cli?.picked_up ?? null,
        call_outcome: cli?.call_outcome ?? null,
      };
    });
  }, [callRecords, callListItems, debtorByPhone]);

  // Filtered by search
  const filteredRecords = useMemo(() => {
    if (!searchQuery) return enrichedRecords;
    const q = searchQuery.toLowerCase();
    return enrichedRecords.filter(
      (r) =>
        r.phone_number.includes(q) ||
        r.debtor_name.toLowerCase().includes(q)
    );
  }, [enrichedRecords, searchQuery]);

  useEffect(() => {
    const channel = supabase
      .channel("analytics-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "call_records" },
        () => queryClient.invalidateQueries({ queryKey: ["call-records"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "call_list_items" },
        () => queryClient.invalidateQueries({ queryKey: ["call-list-items-analytics"] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const handleRefresh = () => {
    refetchRecords();
    refetchItems();
    toast.success("Data refreshed");
  };

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;
    return (
      <Badge variant="secondary" className={`${config.color} gap-1 font-normal`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const getOutcomeBadge = (outcome: string | null, pickedUp: boolean | null) => {
    if (outcome) {
      const o = outcome.toLowerCase();
      if (o.includes("hang")) {
        return <Badge variant="secondary" className="bg-warning/10 text-warning gap-1 font-normal">Hang up</Badge>;
      }
      return getStatusBadge(o);
    }
    if (pickedUp === false) return getStatusBadge("no_answer");
    return <span className="text-muted-foreground text-xs">-</span>;
  };

  const formatDueDate = (phone: string, fallback: string): string => {
    const debtor = debtorByPhone.get(phone);
    const vars = (debtor?.variables || {}) as Record<string, string>;
    const thaiMonths: Record<string, string> = {
      "มกราคม": "01", "กุมภาพันธ์": "02", "มีนาคม": "03", "เมษายน": "04",
      "พฤษภาคม": "05", "มิถุนายน": "06", "กรกฎาคม": "07", "สิงหาคม": "08",
      "กันยายน": "09", "ตุลาคม": "10", "พฤศจิกายน": "11", "ธันวาคม": "12",
    };
    const engMonths: Record<string, string> = {
      january: "01", february: "02", march: "03", april: "04", may: "05",
      june: "06", july: "07", august: "08", september: "09", october: "10",
      november: "11", december: "12",
      jan: "01", feb: "02", mar: "03", apr: "04", jun: "06", jul: "07",
      aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
    };
    const normalizeMonth = (m: string): string => {
      const s = String(m || "").trim();
      if (!s) return "";
      if (/^\d{1,2}$/.test(s)) return s.padStart(2, "0");
      if (thaiMonths[s]) return thaiMonths[s];
      const lower = s.toLowerCase();
      return engMonths[lower] || "";
    };

    const dayRaw = String(vars.due_date || "").trim();
    const monthRaw = String(vars.due_month || "").trim();
    const yearRaw = String(vars.due_year || "").trim();

    if (dayRaw && monthRaw && yearRaw) {
      const dd = /^\d{1,2}$/.test(dayRaw) ? dayRaw.padStart(2, "0") : dayRaw;
      const mm = normalizeMonth(monthRaw);
      if (mm) return `${dd}/${mm}/${yearRaw}`;
    }

    const iso = fallback || debtor?.due_date || "";
    if (iso && /^\d{4}-\d{2}-\d{2}/.test(iso)) {
      const [y, m, d] = iso.slice(0, 10).split("-");
      const buddhistYear = String(parseInt(y, 10) + 543);
      return `${d}/${m}/${buddhistYear}`;
    }
    return fallback || "-";
  };

  const exportToExcel = () => {
    const rows = filteredRecords.map((r) => ({
      "เบอร์โทร": r.phone_number,
      "ชื่อ": r.debtor_name || "-",
      "วันครบกำหนด": formatDueDate(r.phone_number, r.due_date || ""),
      "จำนวนเงิน": r.amount || "-",
      "สถานะ": r.status || "pending",
      "รับสาย": r.picked_up === true ? "ใช่" : r.picked_up === false ? "ไม่" : "-",
      "ผลการโทร": r.call_outcome || "-",
      "วันที่โทร": new Date(r.created_at).toLocaleString("th-TH"),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Call History");
    XLSX.writeFile(wb, `call-history-${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("ส่งออก Excel เรียบร้อย");
  };

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/botnoi-webhook`;
  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("Webhook URL copied");
  };

  const isLoading = loadingRecords || loadingItems;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold">Analytics</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor call performance, trends, and insights
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "justify-start text-left font-normal h-9 min-w-[240px]",
                  !customRange && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {customRange?.from ? (
                  customRange.to ? (
                    <>
                      {format(customRange.from, "d MMM yyyy", { locale: th })} -{" "}
                      {format(customRange.to, "d MMM yyyy", { locale: th })}
                    </>
                  ) : (
                    format(customRange.from, "d MMM yyyy", { locale: th })
                  )
                ) : (
                  <span>เลือกช่วงวันที่</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={customRange?.from || new Date()}
                selected={customRange}
                onSelect={(range) => {
                  setCustomRange(range);
                  if (range) setDateRange("custom");
                }}
                numberOfMonths={2}
                locale={th}
              />
            </PopoverContent>
          </Popover>

          <Select 
            value={dateRange === "custom" ? "" : dateRange} 
            onValueChange={handleDateRangeChange}
          >
            <SelectTrigger className="w-[140px] h-9 text-sm">
              <SelectValue placeholder="เลือกช่วงเวลา" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">วันนี้</SelectItem>
              <SelectItem value="week">7 วันที่ผ่านมา</SelectItem>
              <SelectItem value="month">30 วันที่ผ่านมา</SelectItem>
              <SelectItem value="year">1 ปีที่ผ่านมา</SelectItem>
              <SelectItem value="all">ทั้งหมด</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPdf}
            disabled={isExportingPdf || isLoading}
          >
            <FileDown className="w-4 h-4 mr-2" />
            {isExportingPdf ? "กำลังส่งออก..." : "Export PDF"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="time-analysis">Time Analysis</TabsTrigger>
            <TabsTrigger value="history">Call History</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <AnalyticsStats callListItems={callListItems || []} />

            <MainStatusOverview callListItems={callListItems || []} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SubStatusOverview callListItems={callListItems || []} />
              <OutcomeDistributionChart callListItems={callListItems || []} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TemplatePerformanceChart callListItems={callListItems || []} templates={templates || []} />
              <BestTimeInsights callListItems={callListItems || []} />
            </div>
            <div className="grid grid-cols-1 gap-4">
              <TrendChart callListItems={callListItems || []} />
            </div>
          </TabsContent>

          <TabsContent value="time-analysis" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <HourlyPickupChart callListItems={callListItems || []} />
              <DayOfWeekChart callListItems={callListItems || []} />
            </div>
            <BestTimeInsights callListItems={callListItems || []} />
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base">Recent Calls</CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="ค้นหาเบอร์หรือชื่อ..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 h-9 w-[200px] text-sm"
                      />
                    </div>
                    <Button variant="outline" size="sm" onClick={exportToExcel} disabled={filteredRecords.length === 0}>
                      <Download className="w-4 h-4 mr-1" />
                      Excel
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredRecords.length > 0 ? (
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">เบอร์โทร</TableHead>
                          <TableHead className="text-xs">ชื่อ</TableHead>
                          <TableHead className="text-xs">ยอด</TableHead>
                          <TableHead className="text-xs">รับสาย</TableHead>
                          <TableHead className="text-xs">ผลการโทร</TableHead>
                          <TableHead className="text-xs">สถานะ</TableHead>
                          <TableHead className="text-xs">เวลา</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRecords.slice(0, 100).map((record) => (
                          <TableRow key={record.id}>
                            <TableCell className="font-mono text-sm">{record.phone_number}</TableCell>
                            <TableCell className="text-sm">{record.debtor_name || "-"}</TableCell>
                            <TableCell className="text-sm">{(() => {
                              const n = Number(record.amount);
                              return record.amount
                                ? Number.isFinite(n)
                                  ? `฿${new Intl.NumberFormat("th-TH").format(n)}`
                                  : `฿${record.amount}`
                                : "-";
                            })()}</TableCell>
                            <TableCell>
                              {record.picked_up === true ? (
                                <Badge variant="secondary" className="bg-success/10 text-success text-xs">ใช่</Badge>
                              ) : record.picked_up === false ? (
                                <Badge variant="secondary" className="bg-muted text-muted-foreground text-xs">ไม่</Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">-</span>
                              )}
                            </TableCell>
                            <TableCell>{getOutcomeBadge(record.call_outcome, record.picked_up)}</TableCell>
                            <TableCell>{getStatusBadge(record.status || "pending")}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(record.created_at).toLocaleString("th-TH", {
                                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                              })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <PhoneCall className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p>{searchQuery ? "ไม่พบผลลัพธ์" : "ยังไม่มีประวัติการโทร"}</p>
                    <p className="text-sm">{searchQuery ? "ลองค้นหาด้วยคำอื่น" : "เริ่มแคมเปญเพื่อดูผลลัพธ์ที่นี่"}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Webhook URL</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 rounded-md bg-muted text-sm font-mono text-muted-foreground truncate">
                    {webhookUrl}
                  </code>
                  <Button variant="outline" size="icon" onClick={copyWebhook}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Configure this URL in Botnoi Voice dashboard to receive call results
                </p>
                <details className="mt-4">
                  <summary className="text-sm font-medium cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                    📋 Expected JSON Format
                  </summary>
                  <pre className="mt-2 p-3 rounded-md bg-muted text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre">
{`{
  "outbound_id": "8333484597",
  "phone_number": "0655238453",
  "appointment_time": "",
  "appointment_date": "",
  "status": "completed",
  "outbound_start": "0001-01-01T00:00:00Z",
  "action": "Unknown",
  "conversation_log": "2026-03-27 17:21:21 Bot: สวัสดีค่ะ...\\n2026-03-27 17:21:41 User: ...",
  "audio_url": "https://voicebot-audiologs.s3.../.wav"
}`}
                  </pre>
                </details>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Hidden container used only for PDF export. Always mounted so charts size correctly. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          left: "-100000px",
          top: 0,
          width: "1100px",
          background: "#ffffff",
          pointerEvents: "none",
        }}
      >
        <div ref={exportRef} className="bg-background text-foreground p-6 space-y-6" style={{ width: "1100px" }}>
          <div className="flex items-start justify-between border-b pb-4">
            <div>
              <h2 className="text-2xl font-bold">Analytics Report</h2>
              <p className="text-sm text-muted-foreground mt-1">
                ช่วงเวลา: {dateRangeLabel || "-"}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              สร้างเมื่อ {format(new Date(), "d MMM yyyy HH:mm", { locale: th })}
            </p>
          </div>

          <div className="page-break-avoid">
            <AnalyticsStats callListItems={callListItems || []} />
          </div>
          <div className="page-break-avoid">
            <MainStatusOverview callListItems={callListItems || []} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="page-break-avoid">
              <SubStatusOverview callListItems={callListItems || []} />
            </div>
            <div className="page-break-avoid">
              <OutcomeDistributionChart callListItems={callListItems || []} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="page-break-avoid">
              <TemplatePerformanceChart callListItems={callListItems || []} templates={templates || []} />
            </div>
            <div className="page-break-avoid">
              <BestTimeInsights callListItems={callListItems || []} />
            </div>
          </div>

          <div className="page-break-avoid">
            <TrendChart callListItems={callListItems || []} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="page-break-avoid">
              <HourlyPickupChart callListItems={callListItems || []} />
            </div>
            <div className="page-break-avoid">
              <DayOfWeekChart callListItems={callListItems || []} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CallDashboard;
