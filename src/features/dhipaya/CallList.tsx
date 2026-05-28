import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Phone,
  PhoneOff,
  Play,
  Square,
  CheckCircle,
  Clock,
  AlertCircle,
  Trash2,
  Inbox,
  Loader2,
  X,
  FileText,
  Volume2,
  RefreshCw,
  ListChecks,
  Users,
  RotateCcw,
} from "lucide-react";
import {
  useQueueRows,
  useIsCalling,
  startCalling,
  stopCalling,
  clearCallQueue,
  clearCompleted,
  removeFromCallQueue,
  requeueRow,
  requeueAllCompleted,
  setSelectedPhone,
  applyCallRecordUpdate,
  reconcileCallingRows,
  setActiveWorkspaceId,
  CONCURRENCY,
  type QueueRow,
  type QueueStatus,
} from "./lib/callQueueStore";
import {
  resolveMainStatus,
  type CallStatusTone,
} from "./lib/dhipaya-callStatuses";

const mainToneClass: Record<CallStatusTone, string> = {
  done: "bg-success/10 text-success border-success/30",
  skip: "bg-destructive/10 text-destructive border-destructive/30",
  callback: "bg-warning/10 text-warning border-warning/30",
  "soft-callback": "bg-warning/10 text-warning border-warning/30",
  transfer: "bg-primary/10 text-primary border-primary/30",
  other: "bg-muted text-muted-foreground border-border",
  none: "bg-muted text-muted-foreground border-border",
};

function ResultBadge({ row }: { row: QueueRow }) {
  if (row.status === "pending" || row.status === "calling") {
    return <span className="text-muted-foreground">—</span>;
  }
  const main = resolveMainStatus(row.aiCategory, {
    picked_up: row.status === "success",
    status: row.status,
    call_outcome: row.callOutcome,
  });
  if (!main) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  return (
    <Badge variant="outline" className={mainToneClass[main.tone]}>
      {main.label}
    </Badge>
  );
}

const statusConfig: Record<
  QueueStatus,
  { label: string; className: string; icon: typeof CheckCircle }
> = {
  pending: { label: "Pending", className: "bg-muted text-muted-foreground", icon: Clock },
  calling: { label: "Calling", className: "bg-primary/10 text-primary", icon: Phone },
  success: { label: "Success", className: "bg-success/10 text-success", icon: CheckCircle },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive", icon: AlertCircle },
  no_answer: { label: "No Answer", className: "bg-muted text-muted-foreground", icon: PhoneOff },
};

function StatusBadge({ status }: { status: QueueStatus }) {
  const cfg = statusConfig[status];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${cfg.className}`}>
      {status === "calling" ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <Icon className="w-3 h-3" />
      )}
      {cfg.label}
    </Badge>
  );
}

function formatDuration(s?: number) {
  if (!s || s <= 0) return "—";
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

type TabKey = "pending" | "calling" | "completed";

const DhipayaCallList = () => {
  const queue = useQueueRows();
  const isRunning = useIsCalling();
  const { currentWorkspace } = useWorkspace();
  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [transcript, setTranscript] = useState<{
    conversationLog: string | null;
    audioUrl: string | null;
  } | null>(null);

  useEffect(() => {
    setActiveWorkspaceId(currentWorkspace?.id ?? null);
  }, [currentWorkspace?.id]);

  useEffect(() => {
    reconcileCallingRows();
  }, []);

  useEffect(() => {
    if (!currentWorkspace?.id) return;
    const channel = supabase
      .channel(`dhipaya-call-records-${currentWorkspace.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "call_records",
          filter: `workspace_id=eq.${currentWorkspace.id}`,
        },
        (payload) => {
          const rec = (payload.new || payload.old) as any;
          if (rec) applyCallRecordUpdate(rec);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentWorkspace?.id]);

  const counts = useMemo(() => {
    const c = {
      pending: 0,
      calling: 0,
      completed: 0,
      success: 0,
      failed: 0,
      no_answer: 0,
      total: queue.length,
    };
    for (const r of queue) {
      if (r.status === "pending") c.pending++;
      else if (r.status === "calling") c.calling++;
      else {
        c.completed++;
        if (r.status === "success") c.success++;
        else if (r.status === "failed") c.failed++;
        else if (r.status === "no_answer") c.no_answer++;
      }
    }
    return c;
  }, [queue]);

  const callingCount = counts.calling;
  useEffect(() => {
    if (callingCount > 0) setActiveTab("calling");
  }, [callingCount]);

  useEffect(() => {
    if (
      counts.total > 0 &&
      counts.pending === 0 &&
      counts.calling === 0 &&
      counts.completed > 0
    ) {
      setActiveTab("completed");
    }
  }, [counts.total, counts.pending, counts.calling, counts.completed]);

  const progressPct = counts.total
    ? Math.round(((counts.completed + counts.calling * 0.5) / counts.total) * 100)
    : 0;

  function handleStart() {
    const { dispatched } = startCalling(currentWorkspace?.id ?? null);
    if (dispatched === 0) {
      toast.info("Nothing to call");
    } else {
      setActiveTab("calling");
      toast.success(
        `Calling ${dispatched} customer${dispatched > 1 ? "s" : ""} (max ${CONCURRENCY} in parallel)`,
      );
    }
  }

  function handleStop() {
    stopCalling();
    toast.info("Stopping after in-flight calls dispatch");
  }

  function handleRefresh() {
    reconcileCallingRows();
    toast.success("Refreshed");
  }

  const rowsByTab: Record<TabKey, QueueRow[]> = {
    pending: queue.filter((r) => r.status === "pending"),
    calling: queue.filter((r) => r.status === "calling"),
    completed: queue.filter(
      (r) =>
        r.status === "success" ||
        r.status === "failed" ||
        r.status === "no_answer",
    ),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Call List</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Dhipaya queue · max {CONCURRENCY} parallel · completion confirmed by webhook
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const n = rowsByTab.completed.length;
              requeueAllCompleted();
              if (n > 0) toast.success(`Re-queued ${n} call${n > 1 ? "s" : ""}`);
            }}
            disabled={counts.completed === 0}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Re-queue completed
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearCompleted}
            disabled={counts.completed === 0}
          >
            Clear completed
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearCallQueue}
            disabled={isRunning || queue.length === 0}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear all
          </Button>
          {isRunning ? (
            <Button variant="destructive" onClick={handleStop}>
              <Square className="w-4 h-4 mr-2" />
              Stop
            </Button>
          ) : (
            <Button onClick={handleStart} disabled={counts.pending === 0}>
              <Play className="w-4 h-4 mr-2" />
              Start Calling ({counts.pending})
            </Button>
          )}
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
        <StatCard label="Total" value={counts.total} icon={ListChecks} tone="primary" />
        <StatCard label="Pending" value={counts.pending} icon={Clock} tone="muted" />
        <StatCard
          label="Calling"
          value={counts.calling}
          icon={Phone}
          tone="primary"
          highlight={counts.calling > 0}
          spin={counts.calling > 0}
        />
        <StatCard label="Success" value={counts.success} icon={CheckCircle} tone="success" />
        <StatCard
          label="Failed / No Answer"
          value={counts.failed + counts.no_answer}
          icon={AlertCircle}
          tone="destructive"
        />
      </div>

      {/* Active session card */}
      {queue.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                {isRunning || counts.calling > 0 ? (
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-muted-foreground" />
                )}
                {counts.calling > 0
                  ? `${counts.calling} call${counts.calling > 1 ? "s" : ""} in progress`
                  : isRunning
                    ? "Dispatching calls…"
                    : counts.pending > 0
                      ? "Idle"
                      : "All done"}
              </CardTitle>
              <span className="text-sm text-muted-foreground">
                {counts.completed}/{counts.total} · {progressPct}%
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={progressPct} className="h-2" />
            <p className="text-xs text-muted-foreground">
              You can leave this page — calls continue in the background and will be marked
              complete when the voicebot webhook returns.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Queue */}
      {queue.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Inbox className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="font-medium">Your call queue is empty</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Go to the Customers step, select the customers you want to call, and click{" "}
              <span className="font-medium">Send to Call List</span>.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  Queue
                </CardTitle>
                <TabsList>
                  <TabsTrigger value="pending">
                    Pending ({rowsByTab.pending.length})
                  </TabsTrigger>
                  <TabsTrigger value="calling">
                    Calling ({rowsByTab.calling.length})
                  </TabsTrigger>
                  <TabsTrigger value="completed">
                    Completed ({rowsByTab.completed.length})
                  </TabsTrigger>
                </TabsList>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {(["pending", "calling", "completed"] as const).map((tab) => (
                <TabsContent key={tab} value={tab} className="mt-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Policy</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead className="w-[140px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rowsByTab[tab].length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="text-center text-muted-foreground py-10"
                          >
                            <div className="flex flex-col items-center gap-2">
                              <Inbox className="w-5 h-5 opacity-60" />
                              No items in this tab.
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        rowsByTab[tab].map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">
                              {[r.customer.firstName, r.customer.lastName]
                                .filter(Boolean)
                                .join(" ") || "—"}
                            </TableCell>
                            <TableCell>
                              {r.status === "pending" && r.phoneOptions.length > 1 ? (
                                <Select
                                  value={r.selectedPhone}
                                  onValueChange={(v) => setSelectedPhone(r.id, v)}
                                >
                                  <SelectTrigger className="h-8 w-[180px] font-mono">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {r.phoneOptions.map((opt) => (
                                      <SelectItem key={opt.phone} value={opt.phone}>
                                        <span className="font-mono mr-2">{opt.phone}</span>
                                        <span className="text-xs text-muted-foreground">
                                          {opt.label}
                                        </span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="font-mono">{r.selectedPhone}</span>
                              )}
                              {(() => {
                                const sel = r.phoneOptions.find(
                                  (o) => o.phone === r.selectedPhone,
                                );
                                return sel ? (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {sel.label} · {sel.raw}
                                  </p>
                                ) : null;
                              })()}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {r.customer.policyNumber || "—"}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={r.status} />
                              {r.callOutcome && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {r.callOutcome}
                                </p>
                              )}
                              {r.errorMessage && (
                                <p className="text-xs text-destructive mt-1">
                                  {r.errorMessage}
                                </p>
                              )}
                            </TableCell>
                            <TableCell>
                              <ResultBadge row={r} />
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground font-mono">
                              {formatDuration(r.callDuration)}
                            </TableCell>
                            <TableCell className="text-right">
                              {r.status === "pending" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => removeFromCallQueue(r.id)}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              )}
                              {(r.status === "success" ||
                                r.status === "failed" ||
                                r.status === "no_answer") && (
                                <div className="flex items-center justify-end gap-1">
                                  {(r.conversationLog || r.audioUrl) && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        setTranscript({
                                          conversationLog: r.conversationLog ?? null,
                                          audioUrl: r.audioUrl ?? null,
                                        })
                                      }
                                    >
                                      <FileText className="w-4 h-4 mr-1" />
                                      Transcript
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      requeueRow(r.id);
                                      toast.success("Moved back to Pending");
                                      setActiveTab("pending");
                                    }}
                                    title="Re-queue this call"
                                  >
                                    <RotateCcw className="w-4 h-4 mr-1" />
                                    Re-queue
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>
              ))}
            </CardContent>
          </Tabs>
        </Card>
      )}

      {/* Transcript Dialog */}
      <Dialog open={!!transcript} onOpenChange={(o) => !o && setTranscript(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Call Transcript
            </DialogTitle>
            <DialogDescription>
              Conversation log and recording from this call.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {transcript?.audioUrl ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Volume2 className="w-4 h-4" />
                  Recording
                </div>
                <audio controls className="w-full" src={transcript.audioUrl} />
              </div>
            ) : null}
            {transcript?.conversationLog ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">Conversation</div>
                <pre className="text-xs whitespace-pre-wrap bg-muted p-3 rounded max-h-[400px] overflow-auto">
                  {transcript.conversationLog}
                </pre>
              </div>
            ) : (
              !transcript?.audioUrl && (
                <p className="text-sm text-muted-foreground">
                  No transcript available.
                </p>
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

type StatTone = "primary" | "success" | "destructive" | "muted" | "warning";

const toneStyles: Record<StatTone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  destructive: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
  warning: "bg-warning/10 text-warning",
};

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
  highlight,
  spin,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: StatTone;
  highlight?: boolean;
  spin?: boolean;
}) {
  return (
    <Card className={highlight ? "ring-2 ring-primary" : ""}>
      <CardContent className="p-4 flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${toneStyles[tone]}`}
        >
          {spin ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Icon className="w-5 h-5" />
          )}
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

export default DhipayaCallList;
