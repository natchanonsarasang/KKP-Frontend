import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { MAIN_STATUSES, SUB_STATUSES, resolveMainStatus, resolveSubStatus } from "@/lib/callStatuses";

// Tailwind class palettes for the Main Status cards (mapped by status key).
const MAIN_STATUS_CARD_CLASSES: Record<string, { bg: string; border: string; text: string }> = {
  acknowledged:        { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700" },
  promised:            { bg: "bg-blue-50",    border: "border-blue-200",    text: "text-blue-700" },
  restructure:         { bg: "bg-violet-50",  border: "border-violet-200",  text: "text-violet-700" },
  callback_scheduled:  { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-700" },
  already_paid:        { bg: "bg-teal-50",    border: "border-teal-200",    text: "text-teal-700" },
  not_reached:         { bg: "bg-slate-50",   border: "border-slate-200",   text: "text-slate-700" },
  refused:             { bg: "bg-rose-50",    border: "border-rose-200",    text: "text-rose-700" },
};

interface CallRecord {
  id: string;
  phone_number: string;
  status: string | null;
  created_at: string;
  template_id: string | null;
  call_duration: number | null;
  result_data: Record<string, unknown> | null;
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
  call_record?: { result_data?: { status?: string } | null } | null;
}

interface Template {
  id: string;
  message: string;
  org_name: string;
}

interface CallAnalyticsChartsProps {
  callRecords: CallRecord[];
  callListItems: CallListItem[];
  templates: Template[];
}

const COLORS = {
  primary: "hsl(var(--primary))",
  success: "hsl(142.1 76.2% 36.3%)",
  warning: "hsl(45 93% 47%)",
  destructive: "hsl(var(--destructive))",
  muted: "hsl(var(--muted-foreground))",
};

const CHART_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

export const HourlyPickupChart = ({ callListItems }: { callListItems: CallListItem[] }) => {
  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${i.toString().padStart(2, "0")}:00`,
      total: 0,
      pickedUp: 0,
      rate: 0,
    }));

    callListItems.forEach((item) => {
      if (item.called_at) {
        const hour = new Date(item.called_at).getHours();
        hours[hour].total++;
        if (item.picked_up) {
          hours[hour].pickedUp++;
        }
      }
    });

    hours.forEach((h) => {
      h.rate = h.total > 0 ? Math.round((h.pickedUp / h.total) * 100) : 0;
    });

    return hours;
  }, [callListItems]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Pickup Rate by Hour</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                interval={2}
                className="text-muted-foreground"
              />
              <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number, name: string) => [
                  name === "rate" ? `${value}%` : value,
                  name === "rate" ? "Pickup Rate" : name === "total" ? "Total Calls" : "Picked Up",
                ]}
              />
              <Bar dataKey="total" fill="hsl(var(--muted-foreground))" name="total" radius={[4, 4, 0, 0]} />
              <Bar dataKey="pickedUp" fill="hsl(var(--primary))" name="pickedUp" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export const DayOfWeekChart = ({ callListItems }: { callListItems: CallListItem[] }) => {
  const dayData = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => ({
      day,
      total: 0,
      pickedUp: 0,
      confirmed: 0,
      rate: 0,
    }));

    callListItems.forEach((item) => {
      if (item.called_at) {
        const dayIndex = new Date(item.called_at).getDay();
        days[dayIndex].total++;
        if (item.picked_up) {
          days[dayIndex].pickedUp++;
        }
        if (item.call_outcome === "confirmed") {
          days[dayIndex].confirmed++;
        }
      }
    });

    days.forEach((d) => {
      d.rate = d.total > 0 ? Math.round((d.pickedUp / d.total) * 100) : 0;
    });

    return days;
  }, [callListItems]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Performance by Day</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dayData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} className="text-muted-foreground" />
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
              <Bar dataKey="total" fill="hsl(var(--muted-foreground))" name="Total" radius={[4, 4, 0, 0]} />
              <Bar dataKey="pickedUp" fill="hsl(var(--primary))" name="Picked Up" radius={[4, 4, 0, 0]} />
              <Bar dataKey="confirmed" fill="#22c55e" name="Confirmed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export const OutcomeDistributionChart = ({ callListItems }: { callListItems: CallListItem[] }) => {
  const outcomeData = useMemo(() => {
    const outcomes: Record<string, number> = {};

    callListItems.forEach((item) => {
      const rawOutcome = (item.call_outcome || "").toLowerCase().replace(/_/g, " ");
      const resultDataStatus = item.call_record?.result_data?.status;
      const rawStatus = (resultDataStatus || item.status || "").toLowerCase().replace(/_/g, " ");

      // GLOBAL EXCLUSION: skip "hanged_up"/"incomplete" entirely
      if (
        rawOutcome.includes("hanged") ||
        rawStatus.includes("hanged") ||
        rawStatus === "incomplete"
      ) {
        return;
      }

      let outcome = "pending";

      if (rawOutcome.includes("confirmed")) outcome = "confirmed";
      else if (rawOutcome.includes("declined") || rawOutcome.includes("rejected")) outcome = "rejected";
      else if (rawOutcome === "no answer") outcome = "no_answer";
      else if (rawOutcome === "voicemail") outcome = "voicemail";
      else if (rawOutcome === "busy") outcome = "busy";
      else if (rawOutcome === "failed") outcome = "failed";
      else if (item.picked_up === false) outcome = "no_answer";
      else if (rawStatus === "no answer") outcome = "no_answer";
      else if (rawStatus === "busy") outcome = "busy";
      else if (rawStatus === "failed") outcome = "failed";
      else if (rawStatus === "rejected" || rawStatus === "declined") outcome = "rejected";
      else if (item.picked_up === true) outcome = "completed";

      outcomes[outcome] = (outcomes[outcome] || 0) + 1;
    });

    const labels: Record<string, string> = {
      confirmed: "Confirmed",
      rejected: "Rejected",
      no_answer: "No Answer",
      pending: "Pending",
      failed: "Failed",
      completed: "Completed",
      busy: "Busy",
      voicemail: "Voicemail",
    };

    return Object.entries(outcomes).map(([key, value]) => ({
      name: labels[key] || key,
      value,
    }));
  }, [callListItems]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Call Outcomes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={outcomeData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {outcomeData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
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
  );
};

export const TemplatePerformanceChart = ({
  callListItems,
  templates,
}: {
  callListItems: CallListItem[];
  templates: Template[];
}) => {
  const templateData = useMemo(() => {
    const templateStats: Record<string, { total: number; pickedUp: number; confirmed: number }> = {};

    callListItems.forEach((item) => {
      if (item.template_id) {
        if (!templateStats[item.template_id]) {
          templateStats[item.template_id] = { total: 0, pickedUp: 0, confirmed: 0 };
        }
        templateStats[item.template_id].total++;
        if (item.picked_up) {
          templateStats[item.template_id].pickedUp++;
        }
        if (item.call_outcome === "confirmed") {
          templateStats[item.template_id].confirmed++;
        }
      }
    });

    return Object.entries(templateStats).map(([templateId, stats]) => {
      const template = templates.find((t) => t.id === templateId);
      return {
        name: template?.org_name || "Unknown",
        total: stats.total,
        pickupRate: stats.total > 0 ? Math.round((stats.pickedUp / stats.total) * 100) : 0,
        confirmRate: stats.total > 0 ? Math.round((stats.confirmed / stats.total) * 100) : 0,
      };
    });
  }, [callListItems, templates]);

  if (templateData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Template Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
            No template data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Template Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={templateData} layout="vertical" margin={{ top: 10, right: 10, left: 60, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={60} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number) => [`${value}%`]}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Bar dataKey="pickupRate" fill="hsl(var(--primary))" name="Pickup Rate" radius={[0, 4, 4, 0]} />
              <Bar dataKey="confirmRate" fill="#22c55e" name="Confirm Rate" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export const TrendChart = ({ callListItems }: { callListItems: CallListItem[] }) => {
  const trendData = useMemo(() => {
    const dailyStats: Record<string, { date: string; total: number; pickedUp: number; confirmed: number }> = {};

    callListItems.forEach((item) => {
      if (item.called_at) {
        const date = new Date(item.called_at).toISOString().split("T")[0];
        if (!dailyStats[date]) {
          dailyStats[date] = { date, total: 0, pickedUp: 0, confirmed: 0 };
        }
        dailyStats[date].total++;
        if (item.picked_up) {
          dailyStats[date].pickedUp++;
        }
        if (item.call_outcome === "confirmed") {
          dailyStats[date].confirmed++;
        }
      }
    });

    return Object.values(dailyStats)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14)
      .map((d) => ({
        ...d,
        date: new Date(d.date).toLocaleDateString("th-TH", { month: "short", day: "numeric" }),
      }));
  }, [callListItems]);

  if (trendData.length === 0) {
    return (
      <Card className="col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">14-Day Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
            No trend data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">14-Day Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" />
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
              <Line
                type="monotone"
                dataKey="total"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={2}
                name="Total"
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="pickedUp"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                name="Picked Up"
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="confirmed"
                stroke="#22c55e"
                strokeWidth={2}
                name="Confirmed"
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export const AICategoryDistributionChart = ({ callListItems }: { callListItems: CallListItem[] }) => {
  const chartColors = [
    "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4",
    "#ec4899", "#f97316", "#14b8a6", "#3b82f6", "#a855f7", "#71717a"
  ];
  const categoryData = useMemo(() => {
    // Thai categories as primary display labels
    const categories: Record<string, number> = {
      "ลูกค้าไม่สะดวกคุย (Not Convenient)": 0,
      "ลูกค้าแจ้งว่าชำระเรียบร้อยแล้ว (Already Paid)": 0,
      "แจ้งข้อมูลครบกำหนดชำระเบี้ยได้สำเร็จ (Normal Flow)": 0,
      "ลูกค้าแจ้งไม่ใช่ผู้เอาประกัน (Wrong Person)": 0,
      "ลูกค้าขอคุยกับเจ้าหน้าที่ (Transfer)": 0,
      "ลูกค้านัดหมายให้ติดต่อใหม่ (Call Later)": 0,
      "ลูกค้าสอบถามข้อมูลระหว่างสนทนา (Barge-in)": 0,
      "เสียงแทรก/เสียงรบกวน (Background Noise)": 0,
      "ลูกค้าพูดเรื่องอื่น (Out of Topic)": 0,
      "ลูกค้าเงียบ (Silence)": 0,
      "สายหลุดระหว่างสนทนา (Dropped Call)": 0,
      "ลูกค้าแจ้งให้ทวนประโยคเดิม (Repeat Request)": 0,
    };

    const englishToThai: Record<string, string> = {
      "Not Convenient": "ลูกค้าไม่สะดวกคุย (Not Convenient)",
      "Already Paid": "ลูกค้าแจ้งว่าชำระเรียบร้อยแล้ว (Already Paid)",
      "Normal Flow": "แจ้งข้อมูลครบกำหนดชำระเบี้ยได้สำเร็จ (Normal Flow)",
      "Wrong Person": "ลูกค้าแจ้งไม่ใช่ผู้เอาประกัน (Wrong Person)",
      "Transfer": "ลูกค้าขอคุยกับเจ้าหน้าที่ (Transfer)",
      "Call Later": "ลูกค้านัดหมายให้ติดต่อใหม่ (Call Later)",
      "Barge-in": "ลูกค้าสอบถามข้อมูลระหว่างสนทนา (Barge-in)",
      "Background Noise": "เสียงแทรก/เสียงรบกวน (Background Noise)",
      "Out of Topic": "ลูกค้าพูดเรื่องอื่น (Out of Topic)",
      "Silence": "ลูกค้าเงียบ (Silence)",
      "Dropped Call": "สายหลุดระหว่างสนทนา (Dropped Call)",
      "Repeat Request": "ลูกค้าแจ้งให้ทวนประโยคเดิม (Repeat Request)",
    };

    callListItems.forEach((item) => {
      if (!item.ai_category) return;
      
      const rawCategory = item.ai_category;
      
      // 1. Try direct mapping from English if AI returned only English
      let mappedCategory = englishToThai[rawCategory] || null;

      // 2. If not found, try to find match among our Thai(English) keys
      if (!mappedCategory) {
        mappedCategory = Object.keys(categories).find(cat => 
          rawCategory === cat || 
          rawCategory.includes(cat.split(" (")[0]) ||
          (cat.includes("(") && rawCategory.includes(cat.split("(")[1].split(")")[0]))
        ) || null;
      }

      if (mappedCategory) {
        categories[mappedCategory]++;
      } else {
        categories["ลูกค้าพูดเรื่องอื่น (Out of Topic)"]++;
      }
    });

    return Object.entries(categories)
      .map(([name, value]) => ({ name, value }));
      // Removed sort to lock the order as defined above
  }, [callListItems]);

  return (
    <Card className="col-span-1 md:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">AI Customer Insights (Categories)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[500px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={categoryData}
              layout="vertical"
              margin={{ top: 10, right: 30, left: 220, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={true} vertical={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} hide />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11 }}
                width={210}
                className="text-muted-foreground"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Bar
                dataKey="value"
                name="Calls"
                radius={[0, 4, 4, 0]}
                barSize={20}
                fill="#6366f1"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

// ============================================================
// Main Status Overview — primary collection outcomes
// ============================================================

const MAIN_STATUSES: { key: string; label: string; color: string; bg: string; border: string; text: string; match: (cat: string) => boolean }[] = [
  {
    key: "acknowledged",
    label: "Acknowledged",
    color: "#10b981",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    match: (c) => c.includes("acknowledge") || c.includes("normal flow") || c.includes("แจ้งข้อมูลครบกำหนด"),
  },
  {
    key: "promised",
    label: "Promised to Pay",
    color: "#3b82f6",
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    match: (c) => c.includes("promise") || c.includes("ยืนยันชำระ") || c.includes("รับปาก"),
  },
  {
    key: "restructure",
    label: "Restructure Requested",
    color: "#8b5cf6",
    bg: "bg-violet-50",
    border: "border-violet-200",
    text: "text-violet-700",
    match: (c) => c.includes("restructure") || c.includes("ปรับโครงสร้าง"),
  },
  {
    key: "callback_scheduled",
    label: "Callback Scheduled",
    color: "#f59e0b",
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    match: (c) => c.includes("callback scheduled") || c.includes("scheduled callback"),
  },
  {
    key: "already_paid",
    label: "Already Paid",
    color: "#14b8a6",
    bg: "bg-teal-50",
    border: "border-teal-200",
    text: "text-teal-700",
    match: (c) => c.includes("already paid") || c.includes("ชำระเรียบร้อย"),
  },
  {
    key: "not_reached",
    label: "Not Reached",
    color: "#64748b",
    bg: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-700",
    match: () => false,
  },
  {
    key: "refused",
    label: "Refused",
    color: "#f43f5e",
    bg: "bg-rose-50",
    border: "border-rose-200",
    text: "text-rose-700",
    match: (c) => c.includes("refuse") || c.includes("declined") || c.includes("rejected") || c.includes("ปฏิเสธ"),
  },
];

export const MainStatusOverview = ({ callListItems }: { callListItems: CallListItem[] }) => {
  const data = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(MAIN_STATUSES.map((s) => [s.key, 0]));

    callListItems.forEach((item) => {
      const s = (item.status || "").toLowerCase();
      const r = (item.call_record?.result_data?.status || "").toLowerCase();
      const o = (item.call_outcome || "").toLowerCase();
      if (s === "hanged_up" || s === "incomplete" || r === "hanged_up" || r === "incomplete" || o.includes("hanged")) return;

      if (
        item.picked_up === false ||
        o === "no answer" || o === "no_answer" || o === "busy" || o === "failed" ||
        r === "no answer" || r === "busy" || r === "failed"
      ) {
        counts["not_reached"]++;
        return;
      }

      const cat = (item.ai_category || "").toLowerCase();
      const matched = MAIN_STATUSES.find((m) => m.key !== "not_reached" && m.match(cat));
      if (matched) counts[matched.key]++;
    });

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return MAIN_STATUSES.map((s) => ({
      ...s,
      value: counts[s.key],
      pct: total > 0 ? Math.round((counts[s.key] / total) * 100) : 0,
      total,
    }));
  }, [callListItems]);

  const total = data[0]?.total ?? 0;
  const pieData = data.filter((d) => d.value > 0).map((d) => ({ name: d.label, value: d.value, color: d.color }));

  return (
    <Card className="shadow-sm border-blue-100">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-blue-900">Main Status Overview</CardTitle>
        <p className="text-xs text-muted-foreground">Primary collection outcomes across all calls</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
          <div className="h-64">
            {pieData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                No data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={2} dataKey="value">
                    {pieData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(v: number, n: string) => [`${v} (${total > 0 ? Math.round((v / total) * 100) : 0}%)`, n]}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {data.map((s) => (
              <div
                key={s.key}
                className={`${s.bg} ${s.border} border rounded-lg p-3 transition-all hover:shadow-sm`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  <span className={`text-[11px] font-semibold ${s.text} uppercase tracking-wide truncate`}>
                    {s.label}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className={`text-xl font-bold ${s.text}`}>{s.value}</span>
                  <span className="text-[11px] font-medium text-muted-foreground">{s.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ============================================================
// SubStatus Overview — secondary conversation behaviors
// ============================================================

const SUB_STATUSES: { key: string; label: string; match: (cat: string) => boolean }[] = [
  { key: "not_convenient", label: "Not Convenient", match: (c) => c.includes("not convenient") || c.includes("ไม่สะดวก") },
  { key: "wrong_person", label: "Wrong Person", match: (c) => c.includes("wrong person") || c.includes("ไม่ใช่ผู้") },
  { key: "call_later", label: "Call Later", match: (c) => c.includes("call later") || c.includes("นัดหมายให้ติดต่อใหม่") },
  { key: "transfer", label: "Transfer", match: (c) => c.includes("transfer") || c.includes("ขอคุยกับเจ้าหน้าที่") },
  { key: "background_noise", label: "Background Noise", match: (c) => c.includes("background noise") || c.includes("เสียงแทรก") || c.includes("เสียงรบกวน") },
  { key: "silence", label: "Silence", match: (c) => c.includes("silence") || c.includes("เงียบ") },
  { key: "dropped_call", label: "Dropped Call", match: (c) => c.includes("dropped") || c.includes("สายหลุด") },
  { key: "out_of_topic", label: "Out of Topic", match: (c) => c.includes("out of topic") || c.includes("พูดเรื่องอื่น") },
];

export const SubStatusOverview = ({ callListItems }: { callListItems: CallListItem[] }) => {
  const data = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(SUB_STATUSES.map((s) => [s.key, 0]));

    callListItems.forEach((item) => {
      const s = (item.status || "").toLowerCase();
      const r = (item.call_record?.result_data?.status || "").toLowerCase();
      const o = (item.call_outcome || "").toLowerCase();
      if (s === "hanged_up" || s === "incomplete" || r === "hanged_up" || r === "incomplete" || o.includes("hanged")) return;

      const cat = (item.ai_category || "").toLowerCase();
      if (!cat) return;
      const matched = SUB_STATUSES.find((m) => m.match(cat));
      if (matched) counts[matched.key]++;
    });

    return SUB_STATUSES.map((s) => ({ name: s.label, value: counts[s.key] }));
  }, [callListItems]);

  const hasData = data.some((d) => d.value > 0);

  return (
    <Card className="shadow-sm border-blue-100">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-blue-900">SubStatus Overview</CardTitle>
        <p className="text-xs text-muted-foreground">Secondary conversation behaviors observed</p>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          {!hasData ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              No conversation insights yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 5, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={130}
                  className="text-muted-foreground"
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(v: number) => [`${v} calls`, "Count"]}
                />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 6, 6, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
