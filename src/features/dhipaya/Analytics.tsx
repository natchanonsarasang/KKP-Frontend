import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listCallLogs } from "./api/airtable";
import {
  Loader2,
  Phone,
  PhoneCall,
  PhoneOff,
  Clock,
  BarChart3,
} from "lucide-react";

const DhipayaAnalytics = () => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dhipaya-call-logs"],
    queryFn: () => listCallLogs({ pageSize: 100 }),
  });

  const logs = data?.logs ?? [];
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-primary" />
        <h2 className="text-2xl font-semibold tracking-tight">Analytics</h2>
        <Badge variant="secondary" className="ml-2">
          Airtable
        </Badge>
      </div>

      {isError && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            {(error as Error)?.message || "Failed to load analytics."}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Loading analytics...
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="Total Calls" value={total} icon={Phone} />
            <StatCard label="Answered" value={answered} icon={PhoneCall} />
            <StatCard label="No Answer" value={noAnswer} icon={PhoneOff} />
            <StatCard label="Avg Duration (s)" value={avgDuration} icon={Clock} />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent Calls</CardTitle>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No call logs found in Airtable yet.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {logs.slice(0, 10).map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center justify-between py-2.5 text-sm"
                    >
                      <span className="font-medium">{l.outcome || "—"}</span>
                      <span className="text-xs text-muted-foreground">
                        {l.calledAt || ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

interface StatProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}
const StatCard = ({ label, value, icon: Icon }: StatProps) => (
  <Card>
    <CardContent className="p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-2xl font-semibold">{value}</div>
      </div>
    </CardContent>
  </Card>
);

export default DhipayaAnalytics;
