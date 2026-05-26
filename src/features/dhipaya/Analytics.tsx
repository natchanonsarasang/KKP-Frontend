import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { listCallLogs } from "./api/airtable";
import { Loader2, Phone, PhoneCall, PhoneOff, Clock } from "lucide-react";

const DhipayaAnalytics = () => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dhipaya-call-logs"],
    queryFn: () => listCallLogs({ pageSize: 100 }),
  });

  const logs = data?.logs ?? [];
  const total = logs.length;
  const answered = logs.filter((l) => l.outcome && l.outcome.toLowerCase().includes("answer")).length;
  const noAnswer = logs.filter((l) => l.outcome && l.outcome.toLowerCase().includes("no")).length;
  const avgDuration =
    total === 0 ? 0 : Math.round(logs.reduce((s, l) => s + (l.duration ?? 0), 0) / total);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Analytics</h2>
        <p className="text-sm text-muted-foreground">Call activity from Airtable</p>
      </div>

      {isError && (
        <Card className="p-4 text-sm text-destructive">
          {(error as Error)?.message || "Failed to load analytics."}
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Loading analytics...
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="Total Calls" value={total} icon={Phone} />
            <StatCard label="Answered" value={answered} icon={PhoneCall} />
            <StatCard label="No Answer" value={noAnswer} icon={PhoneOff} />
            <StatCard label="Avg Duration (s)" value={avgDuration} icon={Clock} />
          </div>

          <Card className="p-6">
            <h3 className="font-medium mb-3">Recent Calls</h3>
            <div className="text-sm text-muted-foreground">
              {logs.length === 0 ? (
                "No call logs found in Airtable yet."
              ) : (
                <ul className="space-y-2">
                  {logs.slice(0, 10).map((l) => (
                    <li key={l.id} className="flex items-center justify-between border-b border-border/50 pb-2">
                      <span>{l.outcome || "—"}</span>
                      <span className="text-xs">{l.calledAt || ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
  <Card className="p-4 flex items-center gap-3">
    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
      <Icon className="w-5 h-5 text-primary" />
    </div>
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  </Card>
);

export default DhipayaAnalytics;
