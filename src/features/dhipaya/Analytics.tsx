import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { listCallLogs, listCustomers, listConsents, listInstallmentKb, listPolicies } from "./api/airtable";
import type { CallLog, Customer, Consent } from "./types";
import {
  PhoneCall,
  CheckCircle2,
  XCircle,
  TrendingUp,
  RefreshCw,
  Inbox,
  BarChart3,
  Calendar as CalendarIcon,
  FileText,
  Clock,
  Users,
} from "lucide-react";

const CONSENT_GIVEN = "Consent Given";
const CONSENT_DENIED = "Consent Denied";

/** Normalize a consent status to "given" | "denied" | "" — tolerates casing,
 *  whitespace, Thai variants, and synonyms. */
function normalizeConsent(raw: unknown): "given" | "denied" | "" {
  if (raw == null) return "";
  const s = String(raw).trim().toLowerCase();
  if (!s) return "";
  if (
    s === "consent given" ||
    s === "given" ||
    s === "granted" ||
    s === "yes" ||
    s.includes("ยินยอม") && !s.includes("ไม่")
  ) return "given";
  if (
    s === "consent denied" ||
    s === "denied" ||
    s === "deny" ||
    s === "no" ||
    s.includes("ไม่ยินยอม") ||
    s.includes("ปฏิเสธ")
  ) return "denied";
  return "";
}

function ymd(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function shortDate(d: string): string {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function getConsentLabel(
  c: Customer,
  logs: CallLog[],
  consentById: Map<string, Consent>,
): "given" | "denied" | "called" | "none" {
  const s = (c.consentStatus ?? "").trim();
  if (s === CONSENT_GIVEN) return "given";
  if (s === CONSENT_DENIED) return "denied";
  const hasLog = logs.some((l) => l.customerId === c.id);
  if (hasLog) {
    const consentStatuses = logs
      .filter((l) => l.customerId === c.id)
      .map((l) => {
        const consent = l.consentId ? consentById.get(l.consentId) : undefined;
        return (consent?.consentStatus ?? "").toLowerCase();
      })
      .join(" ");
    if (consentStatuses.includes("consent given")) return "given";
    if (consentStatuses.includes("consent denied")) return "denied";
    return "called";
  }
  return "none";
}

function ConsentBadge({ status }: { status: ReturnType<typeof getConsentLabel> }) {
  if (status === "given")
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-transparent font-medium">
        ✓ Consent Given
      </Badge>
    );
  if (status === "denied")
    return (
      <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-200 border-transparent font-medium">
        ✗ Consent Denied
      </Badge>
    );
  if (status === "called")
    return <Badge className="bg-sky-100 text-sky-700 hover:bg-sky-200 border-transparent font-medium">● Called</Badge>;
  return (
    <Badge variant="secondary" className="font-medium">
      — Not Called
    </Badge>
  );
}

const OUTCOME_COLORS = {
  given: "#10b981",
  denied: "#ef4444",
  noAnswer: "#9ca3af",
} as const;

function OutcomeAndPolicyCharts({
  customers,
  logs,
  consentById,
}: {
  customers: Customer[];
  logs: CallLog[];
  consentById: Map<string, Consent>;
}) {
  const outcomeData = useMemo(() => {
    let given = 0;
    let denied = 0;
    let noAnswer = 0;
    for (const log of logs) {
      const consent = log.consentId ? consentById.get(log.consentId) : undefined;
      const consentStatus = consent?.consentStatus || "";
      if (consentStatus === CONSENT_GIVEN) given++;
      else if (consentStatus === CONSENT_DENIED) denied++;
      else noAnswer++;
    }
    const total = given + denied + noAnswer;
    return {
      total,
      slices: [
        { key: "given", name: "Consent Given", value: given, color: OUTCOME_COLORS.given },
        { key: "denied", name: "Consent Denied", value: denied, color: OUTCOME_COLORS.denied },
        { key: "noAnswer", name: "No Answer", value: noAnswer, color: OUTCOME_COLORS.noAnswer },
      ],
    };
  }, [logs, consentById]);

  const policyData = useMemo(() => {
    const buckets = new Map<string, { total: number; converted: number }>();
    for (const c of customers) {
      const raw = (c.policyStatus || "").trim();
      if (!raw) continue;
      const key = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
      const b = buckets.get(key) || { total: 0, converted: 0 };
      b.total++;
      if ((c.consentStatus || "").trim() === CONSENT_GIVEN) b.converted++;
      buckets.set(key, b);
    }
    return Array.from(buckets.entries())
      .map(([name, v]) => ({
        name,
        conversion: v.total > 0 ? Math.round((v.converted / v.total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.conversion - a.conversion);
  }, [customers]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Outcome Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {outcomeData.total === 0 ? (
            <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
              No call data in range.
            </div>
          ) : (
            <>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={outcomeData.slices}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {outcomeData.slices.map((s) => (
                        <Cell key={s.key} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name) => {
                        const pct = outcomeData.total ? ((value / outcomeData.total) * 100).toFixed(1) : "0";
                        return [`${value} (${pct}%)`, name];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1.5">
                {outcomeData.slices.map((s) => {
                  const pct = outcomeData.total ? ((s.value / outcomeData.total) * 100).toFixed(1) : "0.0";
                  return (
                    <div key={s.key} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                        <span className="text-foreground">{s.name}</span>
                      </div>
                      <span className="text-muted-foreground tabular-nums">
                        {s.value} ({pct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Policy Status Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {policyData.length === 0 ? (
            <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
              No policy data available.
            </div>
          ) : (
            <>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={policyData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }}
                      width={80}
                    />
                    <Tooltip formatter={(v: number) => [`${v}% conversion`, "Conversion"]} />
                    <Bar dataKey="conversion" fill="#2563eb" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1.5">
                {policyData.map((p) => (
                  <div key={p.name} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{p.name}</span>
                    <span className="text-muted-foreground tabular-nums">{p.conversion.toFixed(1)}% conversion</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const DhipayaAnalytics = () => {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [logModal, setLogModal] = useState<Customer | null>(null);

  const customersQuery = useQuery({
    queryKey: ["dhipaya-customers-dashboard"],
    queryFn: () => listCustomers({ pageSize: 100 }),
  });
  const callLogsQuery = useQuery({
    queryKey: ["dhipaya-call-logs-dashboard"],
    queryFn: () => listCallLogs({ pageSize: 100 }),
  });
  const consentsQuery = useQuery({
    queryKey: ["dhipaya-consents-dashboard"],
    queryFn: () => listConsents({ pageSize: 100 }),
  });
  const policiesQuery = useQuery({
    queryKey: ["dhipaya-policies-dashboard"],
    queryFn: () => listPolicies({ pageSize: 100 }),
  });
  const installmentKbQuery = useQuery({
    queryKey: ["dhipaya-installment-kb-dashboard"],
    queryFn: () => listInstallmentKb({ pageSize: 100 }),
  });

  const customers = customersQuery.data?.customers ?? [];
  const logs = callLogsQuery.data?.logs ?? [];
  const consents = consentsQuery.data?.consents ?? [];
  const policies = policiesQuery.data?.policies ?? [];
  const kbItems = installmentKbQuery.data?.items ?? [];

  const isLoading = customersQuery.isLoading || callLogsQuery.isLoading || consentsQuery.isLoading;
  const isFetching =
    customersQuery.isFetching ||
    callLogsQuery.isFetching ||
    consentsQuery.isFetching ||
    policiesQuery.isFetching ||
    installmentKbQuery.isFetching;
  const isError = customersQuery.isError || callLogsQuery.isError || consentsQuery.isError;
  const errorMessage =
    (customersQuery.error as Error)?.message ||
    (callLogsQuery.error as Error)?.message ||
    (consentsQuery.error as Error)?.message;

  const handleRefresh = () => {
    customersQuery.refetch();
    callLogsQuery.refetch();
    consentsQuery.refetch();
    policiesQuery.refetch();
    installmentKbQuery.refetch();
  };

  const planCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of kbItems) if (item.planCode) map.set(item.id, item.planCode);
    return map;
  }, [kbItems]);

  const consentById = useMemo(() => {
    const map = new Map<string, Consent>();
    for (const c of consents) map.set(c.id, c);
    // Diagnostic: count distinct status values and sample of unmatched logs
    const statusCounts: Record<string, number> = {};
    for (const c of consents) {
      const k = (c.consentStatus ?? "(empty)").toString();
      statusCounts[k] = (statusCounts[k] ?? 0) + 1;
    }
    console.log("[Analytics] consents loaded:", consents.length, "status counts:", statusCounts);
    const missing: string[] = [];
    for (const l of logs) {
      if (l.consentId && !map.has(l.consentId)) missing.push(l.consentId);
    }
    if (missing.length) {
      console.warn(
        `[Analytics] ${missing.length} call log(s) reference a consentId not in consentById. First 5:`,
        missing.slice(0, 5),
      );
    }
    return map;
  }, [consents, logs]);

  const policyMap = useMemo(() => {
    const byCustomer = new Map<string, string>();
    const byPolicy = new Map<string, string>();
    for (const p of policies) {
      if (p.expiryDate) {
        if (p.customerId) byCustomer.set(p.customerId, p.expiryDate);
        if (p.policyNumber) byPolicy.set(p.policyNumber, p.expiryDate);
      }
    }
    return { byCustomer, byPolicy };
  }, [policies]);

  // Date-filtered logs (no range = all logs)
  const fromDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined;
  const toDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : fromDate;
  const filteredLogs = useMemo(() => {
    if (!fromDate && !toDate) return logs;
    return logs.filter((l) => {
      const d = ymd(l.calledAt);
      if (!d) return false;
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }, [logs, fromDate, toDate]);

  // KPIs
  const kpis = useMemo(() => {
    const totalCalls = filteredLogs.length;
    let given = 0;
    let denied = 0;
    for (const log of filteredLogs) {
      const consent = log.consentId ? consentById.get(log.consentId) : undefined;
      const consentStatus = consent?.consentStatus || "";
      if (consentStatus === CONSENT_GIVEN) given++;
      else if (consentStatus === CONSENT_DENIED) denied++;
    }
    return { totalCalls, given, denied };
  }, [filteredLogs, consentById]);

  // Chart series
  const series = useMemo(() => {
    const buckets = new Map<string, { given: number; denied: number }>();
    for (const log of filteredLogs) {
      const date = ymd(log.calledAt);
      if (!date) continue;
      const consent = log.consentId ? consentById.get(log.consentId) : undefined;
      const consentStatus = consent?.consentStatus || "";
      const isGiven = consentStatus === CONSENT_GIVEN;
      const isDenied = consentStatus === CONSENT_DENIED;
      if (!isGiven && !isDenied) continue;
      const b = buckets.get(date) || { given: 0, denied: 0 };
      if (isGiven) b.given++;
      else b.denied++;
      buckets.set(date, b);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { given, denied }]) => {
        const tot = given + denied;
        const rate = tot === 0 ? 0 : Math.round((given / tot) * 1000) / 10;
        return { date: shortDate(date), rate, given, denied };
      });
  }, [filteredLogs, consentById]);

  const logsByCustomer = useMemo(() => {
    const map = new Map<string, CallLog[]>();
    for (const l of logs) {
      if (!l.customerId) continue;
      const arr = map.get(l.customerId) || [];
      arr.push(l);
      map.set(l.customerId, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (b.calledAt || "").localeCompare(a.calledAt || ""));
    }
    return map;
  }, [logs]);

  const modalLogs = logModal ? logsByCustomer.get(logModal.id) || [] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h2 className="text-2xl font-semibold tracking-tight">Enhanced Call &amp; Consent Dashboard</h2>
            <Badge variant="secondary" className="ml-1">
              Airtable
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Calls and consent outcomes across your customer base.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-9 justify-start text-left font-normal min-w-[240px]",
                  !dateRange?.from && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "LLL dd, y")} – {format(dateRange.to, "LLL dd, y")}
                    </>
                  ) : (
                    format(dateRange.from, "LLL dd, y")
                  )
                ) : (
                  <span>เลือกช่วงวันที่</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          {dateRange?.from && (
            <Button variant="ghost" size="sm" onClick={() => setDateRange(undefined)} className="h-9">
              Clear
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching} className="h-9">
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {isError && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            {errorMessage || "Failed to load dashboard."}
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5 flex items-center gap-4">
                <Skeleton className="w-14 h-14 rounded-xl" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-7 w-16" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <KpiCard
              label="Total Calls"
              value={kpis.totalCalls}
              icon={PhoneCall}
              gradient="from-blue-500 to-indigo-600"
            />
            <KpiCard
              label="# of Consent Given"
              value={kpis.given}
              icon={CheckCircle2}
              gradient="from-emerald-500 to-teal-600"
            />
            <KpiCard
              label="# of Consent Denied"
              value={kpis.denied}
              icon={XCircle}
              gradient="from-rose-500 to-red-600"
            />
          </>
        )}
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Daily Consent Success Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : series.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Inbox className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="font-medium">No consent data in this range</p>
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="consentRate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis domain={[0, 100]} unit="%" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      color: "hsl(var(--popover-foreground))",
                    }}
                    formatter={(value: number, name) =>
                      name === "rate" ? [`${value}%`, "Success Rate"] : [value, name]
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="rate"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#consentRate)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Outcome Breakdown + Policy Status Performance */}
      <OutcomeAndPolicyCharts customers={customers} logs={filteredLogs} consentById={consentById} />

      {/* Customer Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Customer Table
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border/60 overflow-hidden bg-card">
            <div className="max-h-[640px] overflow-auto">
              {isLoading ? (
                <div className="p-6 space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                    <TableRow className="hover:bg-transparent border-b border-border/60">
                      {[
                        "Name",
                        "Phone",
                        "Routing",
                        "Consent",
                        "Policy",
                        "Policy Status",
                        "Renewal Premium",
                        "Outstanding",
                        "Plan Code",
                        "Notice Sent",
                        "Payment Date",
                        "Expiry Date",
                        "Policy (Detail)",
                      ].map((h) => (
                        <TableHead
                          key={h}
                          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                        >
                          {h}
                        </TableHead>
                      ))}
                      <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={14} className="text-center text-muted-foreground py-12">
                          <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                          No customers found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      customers.map((c) => {
                        const status = getConsentLabel(c, logs, consentById);
                        const expiry =
                          policyMap.byCustomer.get(c.id) ||
                          (c.policyNumber ? policyMap.byPolicy.get(c.policyNumber) : null);
                        const logCount = logsByCustomer.get(c.id)?.length ?? 0;
                        return (
                          <TableRow key={c.id} className="hover:bg-muted/40">
                            <TableCell className="font-medium whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                  {((c.firstName?.[0] || "") + (c.lastName?.[0] || "")).toUpperCase() || "?"}
                                </div>
                                <span>{[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}</span>
                                {c.duplicateFlag && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    dup
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {c.phone1 || c.phone2 || c.phone3 || (
                                <span className="text-muted-foreground italic">no phone</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {c.routingGroup || <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell>
                              <ConsentBadge status={status} />
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {c.policyNumber || <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-sm">
                              {c.policyStatus ? (
                                <Badge variant="outline" className="font-normal">
                                  {c.policyStatus}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm tabular-nums">
                              {c.renewalPremium || <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-sm tabular-nums">
                              {c.outstandingBalance || <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-sm">
                              {c.planCodeId ? (
                                (planCodeMap.get(c.planCodeId) ?? c.planCodeId)
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {c.noticeSent || <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-sm whitespace-nowrap">
                              {c.paymentDate || <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-sm whitespace-nowrap">
                              {expiry || <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-sm">
                              {c.policy || <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" onClick={() => setLogModal(c)} className="h-8">
                                <FileText className="w-3.5 h-3.5 mr-1.5" />
                                View Log
                                {logCount > 0 && (
                                  <span className="ml-1.5 rounded-full bg-primary/15 text-primary px-1.5 text-[10px] font-semibold">
                                    {logCount}
                                  </span>
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Call Logs Modal */}
      <Dialog open={!!logModal} onOpenChange={(open) => !open && setLogModal(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Call Logs History
            </DialogTitle>
            <DialogDescription>
              {logModal
                ? `${[logModal.firstName, logModal.lastName].filter(Boolean).join(" ") || "Customer"} · ${modalLogs.length} log${modalLogs.length === 1 ? "" : "s"}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            {modalLogs.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No call logs for this customer yet.
              </div>
            ) : (
              <div className="space-y-3">
                {modalLogs.map((log) => {
                  const consent = log.consentId ? consentById.get(log.consentId) : undefined;
                  const consentStatus = consent?.consentStatus || "";
                  const isGiven = consentStatus === CONSENT_GIVEN;
                  const isDenied = consentStatus === CONSENT_DENIED;
                  const campaign = logModal?.campaign || "";
                  return (
                    <div key={log.id} className="rounded-lg border border-border/60 p-4 space-y-3 bg-card">
                      {/* Header row: timestamp, duration, consent */}
                      <div className="flex flex-wrap items-center gap-2 justify-between">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDateTime(log.calledAt)}
                        </div>
                        <div className="flex items-center gap-2">
                          {typeof log.duration === "number" && (
                            <Badge variant="outline" className="font-mono text-xs">
                              {log.duration}s
                            </Badge>
                          )}
                          {isGiven ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border-transparent">
                              ✓ Consent Given
                            </Badge>
                          ) : isDenied ? (
                            <Badge className="bg-rose-100 text-rose-700 border-transparent">✗ Consent Denied</Badge>
                          ) : null}
                        </div>
                      </div>

                      {/* Campaign */}
                      {campaign && (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs font-medium">
                            {campaign}
                          </Badge>
                        </div>
                      )}

                      {/* Audio player */}
                      {log.audioUrl && (
                        <audio
                          controls
                          src={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audio-proxy?url=${encodeURIComponent(log.audioUrl)}`}
                          className="w-full h-9"
                        />
                      )}

                      {/* Conversation log */}
                      {log.conversationLogs && (
                        <div className="text-sm space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Conversation
                          </p>
                          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                            {log.conversationLogs.split("\n").map((line, idx) => {
                              const isBot = line.startsWith("Bot:") || line.startsWith("Assistant:");
                              const isUser = line.startsWith("User:") || line.startsWith("Customer:");
                              const cleanLine = line.replace(/^(Bot|Assistant|User|Customer):\s*/, "");
                              return (
                                <div
                                  key={idx}
                                  className={`text-xs leading-relaxed rounded px-2 py-1 ${
                                    isBot
                                      ? "bg-blue-50 text-blue-900"
                                      : isUser
                                        ? "bg-emerald-50 text-emerald-900"
                                        : "bg-muted/40 text-foreground"
                                  }`}
                                >
                                  <span className="font-semibold mr-1">{isBot ? "Bot:" : isUser ? "User:" : ""}</span>
                                  {cleanLine}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function KpiCard({
  label,
  value,
  icon: Icon,
  gradient,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5 flex items-center gap-4">
        <div
          className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br ${gradient} text-white shadow-md`}
        >
          <Icon className="w-7 h-7" />
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground truncate">{label}</div>
          <div className="text-3xl font-semibold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default DhipayaAnalytics;
