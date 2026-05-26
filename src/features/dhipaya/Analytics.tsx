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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listCallLogs } from "./api/airtable";
import {
  Phone,
  PhoneCall,
  PhoneOff,
  Clock,
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

function formatDuration(s?: number) {
  if (!s || s <= 0) return "—";
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

function outcomeTone(outcome?: string | null): StatTone {
  const o = (outcome || "").toLowerCase();
  if (o.includes("confirm") || o.includes("answer") || o.includes("success")) return "success";
  if (o.includes("declin") || o.includes("fail")) return "destructive";
  if (o.includes("no")) return "muted";
  return "primary";
}

const DhipayaAnalytics = () => {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["dhipaya-call-logs"],
    queryFn: () => listCallLogs({ pageSize: 100 }),
  });

  const logs = data?.logs ?? [];

  const stats = useMemo(() => {
    const total = logs.length;
    const answered = logs.filter(
      (l) => l.outcome && l.outcome.toLowerCase().includes("answer"),
    ).length;
    const noAnswer = logs.filter(
      (l) => l.outcome && l.outcome.toLowerCase().includes("no"),
    ).length;
    const avgDuration =
      total === 0
        ? 0
        : Math.round(logs.reduce((s, l) => s + (l.duration ?? 0), 0) / total);
    const pickupRate = total === 0 ? 0 : Math.round((answered / total) * 1000) / 10;
    return { total, answered, noAnswer, avgDuration, pickupRate };
  }, [logs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h2 className="text-2xl font-semibold tracking-tight">Analytics</h2>
            <Badge variant="secondary" className="ml-1">
              Airtable
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Call performance and outcomes from the Dhipaya pipeline.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {isError && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            {(error as Error)?.message || "Failed to load analytics."}
          </CardContent>
        </Card>
      )}

      {/* KPI Grid */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
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
            <StatCard label="Total Calls" value={stats.total} icon={Phone} tone="primary" />
            <StatCard label="Answered" value={stats.answered} icon={PhoneCall} tone="success" />
            <StatCard label="No Answer" value={stats.noAnswer} icon={PhoneOff} tone="muted" />
            <StatCard
              label="Avg Duration"
              value={formatDuration(stats.avgDuration)}
              icon={Clock}
              tone="warning"
            />
            <StatCard
              label="Pickup Rate"
              value={`${stats.pickupRate}%`}
              icon={TrendingUp}
              tone="success"
            />
          </>
        )}
      </div>

      {/* Recent Calls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-primary" />
            Recent Calls
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Inbox className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="font-medium">No call logs yet</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Once calls complete, results from Airtable will appear here.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Called At</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.slice(0, 20).map((l) => {
                  const tone = outcomeTone(l.outcome);
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        <Badge variant="outline" className={`gap-1 ${toneStyles[tone]}`}>
                          {l.outcome || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {l.calledAt
                          ? new Date(l.calledAt).toLocaleString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {formatDuration(l.duration)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
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
