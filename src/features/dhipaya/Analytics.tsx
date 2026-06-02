import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { listCallLogs, listCustomers } from "./api/airtable";
import {
  Phone,
  PhoneCall,
  PhoneOff,
  BarChart3,
  TrendingUp,
  RefreshCw,
  Inbox,
} from "lucide-react";

type StatTone = "primary" | "success" | "destructive" | "muted" | "warning";

const toneStyles: Record<StatTone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  destructive: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
  warning: "bg-warning/10 text-warning",
};

function ymd(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

const CONSENT_GIVEN = "Consent Given";
const CONSENT_DENIED = "Consent Denied";

const DhipayaAnalytics = () => {
  const customersQuery = useQuery({
    queryKey: ["dhipaya-customers-analytics"],
    queryFn: () => listCustomers({ pageSize: 100 }),
  });

  const callLogsQuery = useQuery({
    queryKey: ["dhipaya-call-logs-analytics"],
    queryFn: () => listCallLogs({ pageSize: 100 }),
  });

  const isLoading = customersQuery.isLoading || callLogsQuery.isLoading;
  const isFetching = customersQuery.isFetching || callLogsQuery.isFetching;
  const isError = customersQuery.isError || callLogsQuery.isError;
  const errorMessage =
    (customersQuery.error as Error)?.message ||
    (callLogsQuery.error as Error)?.message;

  const customers = customersQuery.data?.customers ?? [];
  const logs = callLogsQuery.data?.logs ?? [];

  const handleRefresh = () => {
    customersQuery.refetch();
    callLogsQuery.refetch();
  };

  // Section A: Total vs Called
  const callStatus = useMemo(() => {
    const calledCustomerIds = new Set(
      logs.map((l) => l.customerId).filter((id): id is string => Boolean(id)),
    );
    const total = customers.length;
    const called = customers.filter((c) => calledCustomerIds.has(c.id)).length;
    const empty = total - called;
    return { total, called, empty };
  }, [customers, logs]);

  // Section B: Consent success rate by date
  const consentSeries = useMemo(() => {
    const customerById = new Map(customers.map((c) => [c.id, c]));
    const buckets = new Map<
      string,
      { given: number; denied: number }
    >();

    for (const log of logs) {
      const date = ymd(log.calledAt);
      if (!date) continue;
      const outcome = (log.outcome || "").toLowerCase();
      const customer = log.customerId
        ? customerById.get(log.customerId)
        : undefined;
      const consentStatus = customer?.consentStatus || "";

      const isGiven =
        outcome.includes("consent_given") || consentStatus === CONSENT_GIVEN;
      const isDenied =
        outcome.includes("consent_denied") || consentStatus === CONSENT_DENIED;

      if (!isGiven && !isDenied) continue;

      const bucket = buckets.get(date) || { given: 0, denied: 0 };
      if (isGiven) bucket.given += 1;
      else if (isDenied) bucket.denied += 1;
      buckets.set(date, bucket);
    }

    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { given, denied }]) => {
        const total = given + denied;
        const rate = total === 0 ? 0 : Math.round((given / total) * 1000) / 10;
        return { date, given, denied, rate };
      });
  }, [customers, logs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h2 className="text-2xl font-semibold tracking-tight">
              Call &amp; Consent Dashboard
            </h2>
            <Badge variant="secondary" className="ml-1">
              Airtable
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Coverage of the customer base and consent success over time.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isFetching}
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {isError && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            {errorMessage || "Failed to load analytics."}
          </CardContent>
        </Card>
      )}

      {/* Section A: Call Status */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Call Status
        </h3>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4 flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-lg" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-6 w-12" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              <StatCard
                label="Total Customers"
                value={callStatus.total}
                icon={Phone}
                tone="primary"
              />
              <StatCard
                label="Called"
                value={callStatus.called}
                icon={PhoneCall}
                tone="success"
              />
              <StatCard
                label="Empty (Not Called)"
                value={callStatus.empty}
                icon={PhoneOff}
                tone="muted"
              />
            </>
          )}
        </div>
      </section>

      {/* Section B: Consent Success Rate by Date */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Consent Success Rate by Date
        </h3>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Daily Consent Rate (%)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : consentSeries.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <Inbox className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="font-medium">No consent data yet</p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Once call outcomes with consent decisions are recorded, the
                  trend will appear here.
                </p>
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={consentSeries}
                    margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="date"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                    />
                    <YAxis
                      domain={[0, 100]}
                      unit="%"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                    />
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
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="rate"
                      name="Success Rate"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: StatTone;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${toneStyles[tone]}`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground truncate">
            {label}
          </div>
          <div className="text-2xl font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default DhipayaAnalytics;
