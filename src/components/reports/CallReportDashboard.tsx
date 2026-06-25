import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCallRecords } from "@/api/callRecords";
import { listCallListItemsByWorkspace } from "@/api/callListItems";
import { listDebtorsByWorkspace } from "@/api/debtors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  PhoneCall,
  CheckCircle,
  XCircle,
  PhoneOff,
  Clock,
  Search,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  FileText,
  BarChart3,
  Timer,
  TrendingUp,
  Filter,
  Settings,
  Volume2,
} from "lucide-react";
import { useAdmin } from "@/contexts/AdminContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import * as XLSX from "xlsx";
import { toast } from "sonner";

interface CallListItem {
  id: string;
  status: string;
  picked_up: boolean | null;
  call_outcome: string | null;
  scheduled_at: string | null;
  called_at: string | null;
  created_at: string;
  template_id: string | null;
  notes: string | null;
  debtor_id: string;
}

interface CallRecord {
  id: string;
  phone_number: string;
  status: string | null;
  created_at: string;
  call_duration: number | null;
  result_data: Record<string, unknown> | null;
  template_id: string | null;
  botnoi_call_id: string | null;
}

interface Debtor {
  id: string;
  name: string | null;
  last_name: string | null;
  phone_number: string;
}

interface Template {
  id: string;
  message: string;
  org_name: string;
}

const CHART_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

type DateRange = "today" | "week" | "month" | "year" | "all" | "custom";
type ReportPeriod = "daily" | "weekly" | "monthly" | "yearly";

// Customizable KPI options
const KPI_OPTIONS = [
  { id: "total_calls", label: "จำนวนการโทรทั้งหมด", icon: PhoneCall },
  { id: "pickup_rate", label: "อัตราการรับสาย", icon: PhoneCall },
  { id: "confirmed", label: "นัดชำระ", icon: CheckCircle },
  { id: "declined", label: "ปฏิเสธ", icon: XCircle },
  { id: "no_answer", label: "ไม่รับสาย", icon: PhoneOff },
  { id: "avg_duration", label: "เวลาโทรเฉลี่ย", icon: Timer },
  { id: "conversion_rate", label: "อัตราการนัดชำระ", icon: TrendingUp },
  { id: "no_response", label: "ไม่ตอบ", icon: Clock },
];

const CallReportDashboard = () => {
  const { effectiveUserId } = useAdmin();
  const { currentWorkspace } = useWorkspace();

  // State
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("daily");
  const [showTranscriptDialog, setShowTranscriptDialog] = useState(false);
  const [transcriptData, setTranscriptData] = useState<{ conversationLog: string | null; phoneNumber: string } | null>(null);
  const [showKpiSettings, setShowKpiSettings] = useState(false);
  const [selectedKpis, setSelectedKpis] = useState<string[]>(() => {
    const saved = localStorage.getItem("reportKpis");
    return saved ? JSON.parse(saved) : ["total_calls", "pickup_rate", "confirmed", "declined", "no_answer", "avg_duration"];
  });
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    overview: true,
    breakdown: true,
    trend: true,
    details: false,
  });

  // Save KPIs to localStorage
  const saveKpis = (kpis: string[]) => {
    setSelectedKpis(kpis);
    localStorage.setItem("reportKpis", JSON.stringify(kpis));
  };

  // Date range filter
  const getDateFilter = useCallback(() => {
    const now = new Date();
    switch (dateRange) {
      case "today": {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        return start.toISOString();
      }
      case "week": {
        const start = new Date(now);
        start.setDate(start.getDate() - 7);
        return start.toISOString();
      }
      case "month": {
        const start = new Date(now);
        start.setMonth(start.getMonth() - 1);
        return start.toISOString();
      }
      case "year": {
        const start = new Date(now);
        start.setFullYear(start.getFullYear() - 1);
        return start.toISOString();
      }
      case "custom":
        return customStart ? new Date(customStart).toISOString() : undefined;
      default:
        return undefined;
    }
  }, [dateRange, customStart]);

  // Fetch call list items
  const { data: callListItems = [], isLoading: loadingItems, refetch: refetchItems } = useQuery({
    queryKey: ["report-call-items", effectiveUserId, currentWorkspace?.id, dateRange, customStart, customEnd],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];
      let items = await listCallListItemsByWorkspace(currentWorkspace.id);

      if (effectiveUserId) items = items.filter((i) => i.user_id === effectiveUserId);

      // Date filtering happens client-side (the Go list endpoint has no created_at range).
      const dateFilter = getDateFilter();
      if (dateFilter) items = items.filter((i) => i.created_at >= dateFilter);
      if (dateRange === "custom" && customEnd) {
        const end = new Date(customEnd).toISOString();
        items = items.filter((i) => i.created_at <= end);
      }

      return [...items].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ) as unknown as CallListItem[];
    },
    enabled: !!effectiveUserId && !!currentWorkspace?.id,
  });

  // Fetch call records (with duration)
  const { data: callRecords = [], refetch: refetchRecords } = useQuery({
    queryKey: ["report-call-records", effectiveUserId, currentWorkspace?.id, dateRange, customStart, customEnd],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];
      let records = await listCallRecords({
        workspace_id: currentWorkspace.id,
        ...(effectiveUserId ? { user_id: effectiveUserId } : {}),
      });

      const dateFilter = getDateFilter();
      if (dateFilter) records = records.filter((r) => r.created_at >= dateFilter);
      if (dateRange === "custom" && customEnd) {
        const end = new Date(customEnd).toISOString();
        records = records.filter((r) => r.created_at <= end);
      }

      return [...records].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ) as unknown as CallRecord[];
    },
    enabled: !!effectiveUserId && !!currentWorkspace?.id,
  });

  // Fetch debtors for name lookup
  const { data: debtors = [] } = useQuery({
    queryKey: ["report-debtors", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];
      const data = await listDebtorsByWorkspace(currentWorkspace.id);
      return data as unknown as Debtor[];
    },
    enabled: !!currentWorkspace?.id,
  });

  // call_templates is not served by the Go API; template breakdowns are unavailable.
  const templates: Template[] = [];

  // Computed stats
  const stats = useMemo(() => {
    const completed = callListItems.filter((i) => i.called_at);
    const pickedUp = completed.filter((i) => i.picked_up);
    const confirmed = completed.filter((i) => i.call_outcome === "confirmed" || i.call_outcome === "Confirmed");
    const declined = completed.filter((i) => i.call_outcome === "declined" || i.call_outcome === "Declined");
    const noAnswer = completed.filter((i) => i.picked_up === false);
    const noResponse = completed.filter((i) => i.call_outcome === "No Response" || i.call_outcome === "no_response");

    const pickupRate = completed.length > 0 ? (pickedUp.length / completed.length) * 100 : 0;
    const conversionRate = pickedUp.length > 0 ? (confirmed.length / pickedUp.length) * 100 : 0;

    // Average duration from call_records
    const durations = callRecords.filter((r) => r.call_duration && r.call_duration > 0).map((r) => r.call_duration!);
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    return {
      total_calls: completed.length,
      pickup_rate: Math.round(pickupRate * 10) / 10,
      confirmed: confirmed.length,
      declined: declined.length,
      no_answer: noAnswer.length,
      no_response: noResponse.length,
      avg_duration: Math.round(avgDuration),
      conversion_rate: Math.round(conversionRate * 10) / 10,
      picked_up: pickedUp.length,
    };
  }, [callListItems, callRecords]);

  // Percentage breakdown
  const breakdownData = useMemo(() => {
    if (stats.total_calls === 0) return [];
    return [
      { name: "รับสาย / นัดชำระ", value: stats.confirmed, pct: ((stats.confirmed / stats.total_calls) * 100).toFixed(1), color: "#22c55e" },
      { name: "รับสาย / ปฏิเสธ", value: stats.declined, pct: ((stats.declined / stats.total_calls) * 100).toFixed(1), color: "#ef4444" },
      { name: "รับสาย / ไม่ตอบ", value: stats.no_response, pct: ((stats.no_response / stats.total_calls) * 100).toFixed(1), color: "#f59e0b" },
      { name: "ไม่รับสาย", value: stats.no_answer, pct: ((stats.no_answer / stats.total_calls) * 100).toFixed(1), color: "#94a3b8" },
    ].filter((d) => d.value > 0);
  }, [stats]);

  // Summary by period (daily/weekly/monthly/yearly)
  const summaryData = useMemo(() => {
    const buckets: Record<string, { label: string; total: number; pickedUp: number; confirmed: number; declined: number; noAnswer: number }> = {};

    callListItems.forEach((item) => {
      if (!item.called_at) return;
      const d = new Date(item.called_at);
      let key: string;
      let label: string;

      switch (reportPeriod) {
        case "daily":
          key = d.toISOString().split("T")[0];
          label = d.toLocaleDateString("th-TH", { month: "short", day: "numeric", year: "2-digit" });
          break;
        case "weekly": {
          const weekStart = new Date(d);
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          key = weekStart.toISOString().split("T")[0];
          label = `สัปดาห์ ${weekStart.toLocaleDateString("th-TH", { month: "short", day: "numeric" })}`;
          break;
        }
        case "monthly":
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          label = d.toLocaleDateString("th-TH", { month: "long", year: "2-digit" });
          break;
        case "yearly":
          key = `${d.getFullYear()}`;
          label = `ปี ${d.getFullYear() + 543}`;
          break;
      }

      if (!buckets[key]) buckets[key] = { label, total: 0, pickedUp: 0, confirmed: 0, declined: 0, noAnswer: 0 };
      buckets[key].total++;
      if (item.picked_up) buckets[key].pickedUp++;
      if (item.call_outcome === "confirmed" || item.call_outcome === "Confirmed") buckets[key].confirmed++;
      if (item.call_outcome === "declined" || item.call_outcome === "Declined") buckets[key].declined++;
      if (item.picked_up === false) buckets[key].noAnswer++;
    });

    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [callListItems, reportPeriod]);

  // Build debtor map for name lookup
  const debtorMap = useMemo(() => new Map(debtors.map((d) => [d.id, d])), [debtors]);

  // Parse notes
  const parseNotes = (notes: string | null) => {
    if (!notes) return { audioUrl: null, conversationLog: null };
    try {
      const parsed = JSON.parse(notes);
      return { audioUrl: parsed.audio_url || null, conversationLog: parsed.conversation_log || parsed.transcription || null };
    } catch {
      return notes.startsWith("http") ? { audioUrl: notes, conversationLog: null } : { audioUrl: null, conversationLog: null };
    }
  };

  // Search/filter call list items
  const filteredItems = useMemo(() => {
    const completed = callListItems.filter((i) => i.called_at);
    if (!searchQuery) return completed;
    const q = searchQuery.toLowerCase();
    return completed.filter((item) => {
      const debtor = debtorMap.get(item.debtor_id);
      const name = `${debtor?.name || ""} ${debtor?.last_name || ""}`.toLowerCase();
      const phone = debtor?.phone_number || "";
      return name.includes(q) || phone.includes(q);
    });
  }, [callListItems, searchQuery, debtorMap]);

  // Export functions
  const exportToExcel = () => {
    const rows = filteredItems.map((item) => {
      const debtor = debtorMap.get(item.debtor_id);
      const { conversationLog } = parseNotes(item.notes);
      return {
        "เบอร์โทร": debtor?.phone_number || "",
        "ชื่อ": `${debtor?.name || ""} ${debtor?.last_name || ""}`.trim(),
        "สถานะ": item.status,
        "ผลการโทร": item.call_outcome || "",
        "รับสาย": item.picked_up ? "ใช่" : "ไม่",
        "วันที่โทร": item.called_at ? new Date(item.called_at).toLocaleString("th-TH") : "",
        "บทสนทนา": conversationLog || "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Call Report");

    // Summary sheet
    const summaryRows = summaryData.map((s) => ({
      "ช่วงเวลา": s.label,
      "โทรทั้งหมด": s.total,
      "รับสาย": s.pickedUp,
      "นัดชำระ": s.confirmed,
      "ปฏิเสธ": s.declined,
      "ไม่รับสาย": s.noAnswer,
      "อัตราการรับสาย": s.total > 0 ? `${Math.round((s.pickedUp / s.total) * 100)}%` : "0%",
    }));
    const ws2 = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, ws2, "Summary");

    XLSX.writeFile(wb, `call-report-${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("ส่งออก Excel เรียบร้อย");
  };

  const exportToPDF = () => {
    // Generate a printable HTML and trigger print dialog
    const printContent = `
      <html><head><title>Call Report</title>
      <style>
        body { font-family: sans-serif; padding: 20px; }
        h1 { font-size: 18px; margin-bottom: 10px; }
        h2 { font-size: 14px; margin: 20px 0 10px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
        th { background: #f3f4f6; font-weight: 600; }
        .stats { display: flex; gap: 20px; margin: 15px 0; flex-wrap: wrap; }
        .stat { background: #f9fafb; padding: 10px 16px; border-radius: 8px; }
        .stat-value { font-size: 20px; font-weight: 700; }
        .stat-label { font-size: 11px; color: #6b7280; }
      </style></head><body>
      <h1>รายงานผลการโทร - ${currentWorkspace?.name || "Workspace"}</h1>
      <p>ช่วงเวลา: ${dateRange === "custom" ? `${customStart} ถึง ${customEnd}` : dateRange} | สร้างเมื่อ: ${new Date().toLocaleString("th-TH")}</p>
      
      <div class="stats">
        <div class="stat"><div class="stat-value">${stats.total_calls}</div><div class="stat-label">โทรทั้งหมด</div></div>
        <div class="stat"><div class="stat-value">${stats.pickup_rate}%</div><div class="stat-label">อัตราการรับสาย</div></div>
        <div class="stat"><div class="stat-value">${stats.confirmed}</div><div class="stat-label">นัดชำระ</div></div>
        <div class="stat"><div class="stat-value">${stats.declined}</div><div class="stat-label">ปฏิเสธ</div></div>
        <div class="stat"><div class="stat-value">${stats.no_answer}</div><div class="stat-label">ไม่รับสาย</div></div>
        <div class="stat"><div class="stat-value">${stats.avg_duration}s</div><div class="stat-label">เวลาเฉลี่ย</div></div>
      </div>

      <h2>สรุปตาม${reportPeriod === "daily" ? "วัน" : reportPeriod === "weekly" ? "สัปดาห์" : reportPeriod === "monthly" ? "เดือน" : "ปี"}</h2>
      <table>
        <tr><th>ช่วงเวลา</th><th>ทั้งหมด</th><th>รับสาย</th><th>นัดชำระ</th><th>ปฏิเสธ</th><th>ไม่รับสาย</th><th>อัตรารับสาย</th></tr>
        ${summaryData.map((s) => `<tr><td>${s.label}</td><td>${s.total}</td><td>${s.pickedUp}</td><td>${s.confirmed}</td><td>${s.declined}</td><td>${s.noAnswer}</td><td>${s.total > 0 ? Math.round((s.pickedUp / s.total) * 100) : 0}%</td></tr>`).join("")}
      </table>

      <h2>รายละเอียดการโทร</h2>
      <table>
        <tr><th>เบอร์โทร</th><th>ชื่อ</th><th>ผลการโทร</th><th>รับสาย</th><th>วันที่</th></tr>
        ${filteredItems.slice(0, 200).map((item) => {
          const debtor = debtorMap.get(item.debtor_id);
          return `<tr><td>${debtor?.phone_number || ""}</td><td>${(debtor?.name || "") + " " + (debtor?.last_name || "")}</td><td>${item.call_outcome || ""}</td><td>${item.picked_up ? "ใช่" : "ไม่"}</td><td>${item.called_at ? new Date(item.called_at).toLocaleString("th-TH") : ""}</td></tr>`;
        }).join("")}
      </table>
      </body></html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
    toast.success("เปิดหน้าต่างพิมพ์ PDF เรียบร้อย");
  };

  const handleRefresh = () => {
    refetchItems();
    refetchRecords();
    toast.success("รีเฟรชข้อมูลเรียบร้อย");
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds} วินาที`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m} นาที ${s} วินาที`;
  };

  const getKpiValue = (kpiId: string) => {
    switch (kpiId) {
      case "total_calls": return { value: stats.total_calls, suffix: "", icon: PhoneCall, color: "text-foreground" };
      case "pickup_rate": return { value: stats.pickup_rate, suffix: "%", icon: PhoneCall, color: "text-primary" };
      case "confirmed": return { value: stats.confirmed, suffix: "", icon: CheckCircle, color: "text-success" };
      case "declined": return { value: stats.declined, suffix: "", icon: XCircle, color: "text-destructive" };
      case "no_answer": return { value: stats.no_answer, suffix: "", icon: PhoneOff, color: "text-muted-foreground" };
      case "avg_duration": return { value: stats.avg_duration, suffix: "s", icon: Timer, color: "text-primary" };
      case "conversion_rate": return { value: stats.conversion_rate, suffix: "%", icon: TrendingUp, color: "text-success" };
      case "no_response": return { value: stats.no_response, suffix: "", icon: Clock, color: "text-warning" };
      default: return { value: 0, suffix: "", icon: PhoneCall, color: "text-foreground" };
    }
  };

  const isLoading = loadingItems;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header with filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">รายงานผลการโทร</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            ภาพรวมและรายละเอียดผลการโทรทั้งหมด
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">วันนี้</SelectItem>
              <SelectItem value="week">7 วัน</SelectItem>
              <SelectItem value="month">30 วัน</SelectItem>
              <SelectItem value="year">1 ปี</SelectItem>
              <SelectItem value="all">ทั้งหมด</SelectItem>
              <SelectItem value="custom">กำหนดเอง</SelectItem>
            </SelectContent>
          </Select>

          {dateRange === "custom" && (
            <div className="flex gap-2">
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-9 w-[140px]" />
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-9 w-[140px]" />
            </div>
          )}

          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4 mr-1" />
            รีเฟรช
          </Button>

          <Button variant="outline" size="sm" onClick={() => setShowKpiSettings(true)}>
            <Settings className="w-4 h-4 mr-1" />
            KPI
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
            <TabsTrigger value="details">รายละเอียด</TabsTrigger>
            <TabsTrigger value="summary">สรุปรายงาน</TabsTrigger>
            <TabsTrigger value="export">ส่งออก</TabsTrigger>
          </TabsList>

          {/* ===== OVERVIEW TAB ===== */}
          <TabsContent value="overview" className="space-y-6">
            {/* KPI Cards */}
            <Collapsible open={expandedSections.overview} onOpenChange={() => toggleSection("overview")}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between cursor-pointer group">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    ตัวชี้วัดหลัก (KPIs)
                  </h3>
                  {expandedSections.overview ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
                  {selectedKpis.map((kpiId) => {
                    const kpi = KPI_OPTIONS.find((k) => k.id === kpiId);
                    if (!kpi) return null;
                    const { value, suffix, icon: Icon, color } = getKpiValue(kpiId);
                    return (
                      <Card key={kpiId}>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 rounded-lg bg-muted">
                              <Icon className={`w-3.5 h-3.5 ${color}`} />
                            </div>
                          </div>
                          <div className={`text-2xl font-bold ${color}`}>
                            {value}{suffix}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">{kpi.label}</div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Percentage Breakdown */}
            <Collapsible open={expandedSections.breakdown} onOpenChange={() => toggleSection("breakdown")}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between cursor-pointer">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    สัดส่วนผลการโทร
                  </h3>
                  {expandedSections.breakdown ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
                  {/* Pie chart */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">การกระจายผลการโทร</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={breakdownData}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={80}
                              paddingAngle={2}
                              dataKey="value"
                              label={({ name, pct }) => `${name} ${pct}%`}
                              labelLine={false}
                            >
                              {breakdownData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                                fontSize: "12px",
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Percentage bars */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">สัดส่วน (%)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {breakdownData.map((item) => (
                        <div key={item.name}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm">{item.name}</span>
                            <span className="text-sm font-medium">{item.value} ({item.pct}%)</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${item.pct}%`, backgroundColor: item.color }}
                            />
                          </div>
                        </div>
                      ))}
                      {stats.avg_duration > 0 && (
                        <div className="pt-3 border-t border-border">
                          <div className="flex items-center gap-2">
                            <Timer className="w-4 h-4 text-primary" />
                            <span className="text-sm">เวลาโทรเฉลี่ย:</span>
                            <span className="text-sm font-bold text-primary">{formatDuration(stats.avg_duration)}</span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Trend Chart */}
            <Collapsible open={expandedSections.trend} onOpenChange={() => toggleSection("trend")}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between cursor-pointer">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    แนวโน้ม
                  </h3>
                  {expandedSections.trend ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Card className="mt-3">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">แนวโน้มการโทร</CardTitle>
                      <Select value={reportPeriod} onValueChange={(v) => setReportPeriod(v as ReportPeriod)}>
                        <SelectTrigger className="w-[120px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">รายวัน</SelectItem>
                          <SelectItem value="weekly">รายสัปดาห์</SelectItem>
                          <SelectItem value="monthly">รายเดือน</SelectItem>
                          <SelectItem value="yearly">รายปี</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72">
                      {summaryData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={summaryData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                            <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                                fontSize: "12px",
                              }}
                            />
                            <Legend wrapperStyle={{ fontSize: "11px" }} />
                            <Line type="monotone" dataKey="total" stroke="hsl(var(--muted-foreground))" strokeWidth={2} name="ทั้งหมด" dot={{ r: 3 }} />
                            <Line type="monotone" dataKey="pickedUp" stroke="hsl(var(--primary))" strokeWidth={2} name="รับสาย" dot={{ r: 3 }} />
                            <Line type="monotone" dataKey="confirmed" stroke="#22c55e" strokeWidth={2} name="นัดชำระ" dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                          ไม่มีข้อมูล
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>

          {/* ===== DETAILS TAB ===== */}
          <TabsContent value="details" className="space-y-4">
            {/* Search & filter */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="ค้นหาเบอร์โทรหรือชื่อลูกค้า..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Badge variant="secondary">{filteredItems.length} รายการ</Badge>
            </div>

            {/* Detail table */}
            <Card>
              <CardContent className="p-0">
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">เบอร์โทร</TableHead>
                        <TableHead className="text-xs">ชื่อ</TableHead>
                        <TableHead className="text-xs">ผลการโทร</TableHead>
                        <TableHead className="text-xs">รับสาย</TableHead>
                        <TableHead className="text-xs">วันที่โทร</TableHead>
                        <TableHead className="text-xs">บทสนทนา</TableHead>
                        <TableHead className="text-xs">เสียง</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.slice(0, 100).map((item) => {
                        const debtor = debtorMap.get(item.debtor_id);
                        const { audioUrl, conversationLog } = parseNotes(item.notes);
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono text-sm">{debtor?.phone_number || "-"}</TableCell>
                            <TableCell className="text-sm">
                              {debtor ? `${debtor.name || ""} ${debtor.last_name || ""}`.trim() || "-" : "-"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={
                                  item.call_outcome === "Confirmed" || item.call_outcome === "confirmed"
                                    ? "bg-success/10 text-success"
                                    : item.call_outcome === "Declined" || item.call_outcome === "declined"
                                    ? "bg-destructive/10 text-destructive"
                                    : "bg-muted text-muted-foreground"
                                }
                              >
                                {item.call_outcome || item.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {item.picked_up ? (
                                <CheckCircle className="w-4 h-4 text-success" />
                              ) : (
                                <XCircle className="w-4 h-4 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {item.called_at
                                ? new Date(item.called_at).toLocaleString("th-TH", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "-"}
                            </TableCell>
                            <TableCell>
                              {conversationLog ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => {
                                    setTranscriptData({ conversationLog, phoneNumber: debtor?.phone_number || "" });
                                    setShowTranscriptDialog(true);
                                  }}
                                >
                                  <FileText className="w-3 h-3 mr-1" />
                                  ดู
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {audioUrl ? (
                                <div className="flex gap-1">
                                  <a
                                    href={audioUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                                      <Volume2 className="w-3 h-3 mr-1" />
                                      ฟัง
                                    </Button>
                                  </a>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={async () => {
                                      try {
                                        const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audio-proxy?download=1&filename=call_audio.mp3&url=${encodeURIComponent(audioUrl)}`;
                                        const res = await fetch(proxyUrl);
                                        if (!res.ok) throw new Error("Download failed");
                                        const blob = await res.blob();
                                        const blobUrl = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = blobUrl;
                                        a.download = 'call_audio.mp3';
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                        URL.revokeObjectURL(blobUrl);
                                      } catch (err) {
                                        console.error("Audio download error:", err);
                                      }
                                    }}
                                  >
                                    <Download className="w-3 h-3" />
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filteredItems.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            ไม่พบข้อมูลการโทร
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                {filteredItems.length > 100 && (
                  <div className="text-xs text-muted-foreground text-center py-2">
                    แสดง 100 จาก {filteredItems.length} รายการ
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== SUMMARY TAB ===== */}
          <TabsContent value="summary" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">สรุปรายงาน</h3>
              <Select value={reportPeriod} onValueChange={(v) => setReportPeriod(v as ReportPeriod)}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">รายวัน</SelectItem>
                  <SelectItem value="weekly">รายสัปดาห์</SelectItem>
                  <SelectItem value="monthly">รายเดือน</SelectItem>
                  <SelectItem value="yearly">รายปี</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Summary chart */}
            <Card>
              <CardContent className="pt-6">
                <div className="h-64">
                  {summaryData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summaryData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                        <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "11px" }} />
                        <Bar dataKey="total" fill="hsl(var(--muted-foreground))" name="ทั้งหมด" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="pickedUp" fill="hsl(var(--primary))" name="รับสาย" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="confirmed" fill="#22c55e" name="นัดชำระ" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      ไม่มีข้อมูล
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Summary table */}
            <Card>
              <CardContent className="p-0">
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">ช่วงเวลา</TableHead>
                        <TableHead className="text-xs text-right">ทั้งหมด</TableHead>
                        <TableHead className="text-xs text-right">รับสาย</TableHead>
                        <TableHead className="text-xs text-right">นัดชำระ</TableHead>
                        <TableHead className="text-xs text-right">ปฏิเสธ</TableHead>
                        <TableHead className="text-xs text-right">ไม่รับสาย</TableHead>
                        <TableHead className="text-xs text-right">อัตรารับสาย</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaryData.map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm font-medium">{row.label}</TableCell>
                          <TableCell className="text-sm text-right">{row.total}</TableCell>
                          <TableCell className="text-sm text-right text-primary">{row.pickedUp}</TableCell>
                          <TableCell className="text-sm text-right text-success">{row.confirmed}</TableCell>
                          <TableCell className="text-sm text-right text-destructive">{row.declined}</TableCell>
                          <TableCell className="text-sm text-right text-muted-foreground">{row.noAnswer}</TableCell>
                          <TableCell className="text-sm text-right font-medium">
                            {row.total > 0 ? Math.round((row.pickedUp / row.total) * 100) : 0}%
                          </TableCell>
                        </TableRow>
                      ))}
                      {summaryData.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            ไม่มีข้อมูล
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== EXPORT TAB ===== */}
          <TabsContent value="export" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={exportToExcel}>
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-success/10">
                    <Download className="w-6 h-6 text-success" />
                  </div>
                  <div>
                    <h3 className="font-semibold">ส่งออก Excel</h3>
                    <p className="text-sm text-muted-foreground">ดาวน์โหลดรายงานในรูปแบบ .xlsx พร้อมข้อมูลครบทุกรายการ</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={exportToPDF}>
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-destructive/10">
                    <FileText className="w-6 h-6 text-destructive" />
                  </div>
                  <div>
                    <h3 className="font-semibold">ส่งออก PDF</h3>
                    <p className="text-sm text-muted-foreground">พิมพ์หรือบันทึกรายงานเป็น PDF ผ่าน Print Dialog</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Transcript Dialog */}
      <Dialog open={showTranscriptDialog} onOpenChange={setShowTranscriptDialog}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>บทสนทนา</DialogTitle>
            <DialogDescription>
              {transcriptData?.phoneNumber && `เบอร์: ${transcriptData.phoneNumber}`}
            </DialogDescription>
          </DialogHeader>
          {transcriptData && (
            <div className="bg-muted/30 rounded-lg p-3 min-h-[150px] max-h-[400px] overflow-y-auto space-y-3">
              {transcriptData.conversationLog ? (
                transcriptData.conversationLog.split("\n").filter((l) => l.trim()).map((line, idx) => {
                  const match = line.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(Bot|User):\s*(.*)$/i);
                  if (!match) return <p key={idx} className="text-sm text-muted-foreground">{line}</p>;
                  const [, timestamp, role, message] = match;
                  const isBot = role.toLowerCase() === "bot";
                  const time = timestamp.split(" ")[1];
                  return (
                    <div key={idx} className={`flex ${isBot ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-2 ${isBot ? "bg-muted text-foreground rounded-bl-sm" : "bg-primary text-primary-foreground rounded-br-sm"}`}>
                        <p className="text-sm">{message}</p>
                        <p className={`text-[10px] mt-1 ${isBot ? "text-muted-foreground" : "text-primary-foreground/70"}`}>{time}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground italic text-center py-8">ไม่มีบทสนทนา</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* KPI Settings Dialog */}
      <Dialog open={showKpiSettings} onOpenChange={setShowKpiSettings}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>ตั้งค่า KPI Dashboard</DialogTitle>
            <DialogDescription>เลือก KPI ที่ต้องการแสดงบน Dashboard</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {KPI_OPTIONS.map((kpi) => (
              <label key={kpi.id} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={selectedKpis.includes(kpi.id)}
                  onChange={(e) => {
                    if (e.target.checked) saveKpis([...selectedKpis, kpi.id]);
                    else saveKpis(selectedKpis.filter((k) => k !== kpi.id));
                  }}
                  className="rounded"
                />
                <kpi.icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{kpi.label}</span>
              </label>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CallReportDashboard;
