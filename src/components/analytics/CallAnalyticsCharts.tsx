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
      const outcome = item.call_outcome || (item.picked_up === false ? "no_answer" : "pending");
      outcomes[outcome] = (outcomes[outcome] || 0) + 1;
    });

    const labels: Record<string, string> = {
      confirmed: "Confirmed",
      declined: "Declined",
      no_answer: "No Answer",
      pending: "Pending",
      failed: "Failed",
      completed: "Completed",
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
  const chartColors = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
  const categoryData = useMemo(() => {
    // Thai categories as primary display labels
    const categories: Record<string, number> = {
      "ลูกค้าอยู่ที่เสียงดัง": 0,
      "ลูกค้าอยู่ข้างทาง / ไม่สะดวก": 0,
      "ลูกค้าไม่ยอมจ่าย (เงียบ / พูดแทรก)": 0,
      "ลูกค้าสนใจปรับโครงสร้างหนี้": 0,
      "ลูกค้าขอคุยกับเจ้าหน้าที่": 0,
      "ลูกค่ายอมจ่าย + บอกวันที่": 0,
      "ลูกค่ายอมจ่าย แต่ไม่บอกวันที่": 0,
      "ไม่รับสาย → โทรรอบ 2": 0,
      "ไม่อยากคุยกับ Bot": 0,
      "ลูกค้าพูดเรื่องอื่น (น้ำท่วม / เสียชีวิต)": 0,
      "ลูกค้าพูดภาษาถิ่น": 0,
      "ลูกค้าไม่พูด": 0,
      "โทรแล้วปิดเครื่อง": 0,
    };

    // Map English webhook categories to Thai
    const englishToThai: Record<string, string> = {
      "Customer in noisy environment": "ลูกค้าอยู่ที่เสียงดัง",
      "Customer not convenient to talk": "ลูกค้าอยู่ข้างทาง / ไม่สะดวก",
      "Customer refused to pay": "ลูกค้าไม่ยอมจ่าย (เงียบ / พูดแทรก)",
      "Customer interested in debt restructuring": "ลูกค้าสนใจปรับโครงสร้างหนี้",
      "Customer requested human agent": "ลูกค้าขอคุยกับเจ้าหน้าที่",
      "Customer promised to pay with date": "ลูกค่ายอมจ่าย + บอกวันที่",
      "Customer promised to pay (no date)": "ลูกค่ายอมจ่าย แต่ไม่บอกวันที่",
      "No answer – call back later": "ไม่รับสาย → โทรรอบ 2",
      "Customer refused to talk to bot": "ไม่อยากคุยกับ Bot",
      "Customer has hardship situation": "ลูกค้าพูดเรื่องอื่น (น้ำท่วม / เสียชีวิต)",
      "Language barrier": "ลูกค้าพูดภาษาถิ่น",
      "Customer silent": "ลูกค้าไม่พูด",
      "Phone is turned off": "โทรแล้วปิดเครื่อง",
    };

    callListItems.forEach((item) => {
      if (!item.ai_category) return;
      // Map English to Thai if needed, keep Thai as-is
      const mapped = englishToThai[item.ai_category] || item.ai_category;
      if (categories[mapped] !== undefined) {
        categories[mapped]++;
      } else {
        categories[mapped] = (categories[mapped] || 0) + 1;
      }
    });

    return Object.entries(categories)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [callListItems]);

  return (
    <Card className="col-span-1 md:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">AI Customer Insights (Categories)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={categoryData}
              layout="vertical"
              margin={{ top: 10, right: 30, left: 160, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={true} vertical={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} hide />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11 }}
                width={150}
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
              >
                {categoryData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
