import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Card } from "@/components/ui/card";
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
} from "lucide-react";
import {
  useQueueRows,
  useIsCalling,
  startCalling,
  stopCalling,
  clearCallQueue,
  clearCompleted,
  removeFromCallQueue,
  setSelectedPhone,
  applyCallRecordUpdate,
  reconcileCallingRows,
  setActiveWorkspaceId,
  CONCURRENCY,
  type QueueRow,
  type QueueStatus,
} from "./lib/callQueueStore";

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

  // Keep store in sync with the current workspace.
  useEffect(() => {
    setActiveWorkspaceId(currentWorkspace?.id ?? null);
  }, [currentWorkspace?.id]);

  // Reconcile any in-flight calls on mount.
  useEffect(() => {
    reconcileCallingRows();
  }, []);

  // Realtime subscription on call_records → completion signal from webhook.
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

  // Auto switch tabs based on activity.
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Call List</h2>
          <p className="text-sm text-muted-foreground">
            Dhipaya queue · max {CONCURRENCY} parallel · completion confirmed by
            webhook
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      {queue.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {isRunning || counts.calling > 0 ? (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              ) : (
                <CheckCircle className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="font-medium">
                {counts.calling > 0
                  ? `${counts.calling} call${counts.calling > 1 ? "s" : ""} in progress`
                  : isRunning
                    ? "Dispatching calls…"
                    : counts.pending > 0
                      ? "Idle"
                      : "All done"}
              </span>
              <span className="text-muted-foreground">
                · {counts.completed}/{counts.total} completed
              </span>
            </div>
            <span className="text-muted-foreground">{progressPct}%</span>
          </div>
          <Progress value={progressPct} className="h-2" />
          <p className="text-xs text-muted-foreground">
            You can leave this page — calls continue in the background and will
            be marked complete when the voicebot webhook returns.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total" value={counts.total} />
        <StatCard label="Pending" value={counts.pending} />
        <StatCard label="Calling" value={counts.calling} highlight={counts.calling > 0} />
        <StatCard label="Success" value={counts.success} />
        <StatCard label="Failed / No Answer" value={counts.failed + counts.no_answer} />
      </div>

      {queue.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Inbox className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="font-medium">Your call queue is empty</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Go to the Customers step, select the customers you want to call, and
            click <span className="font-medium">Send to Call List</span>.
          </p>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
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
          {(["pending", "calling", "completed"] as const).map((tab) => (
            <TabsContent key={tab} value={tab} className="mt-3">
              <Card className="p-0 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Policy</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead className="w-[120px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rowsByTab[tab].length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center text-muted-foreground py-8"
                        >
                          No items.
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
                          <TableCell>{r.customer.policyNumber || "—"}</TableCell>
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
                          <TableCell className="text-sm text-muted-foreground">
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
                              r.status === "no_answer") &&
                              (r.conversationLog || r.audioUrl) && (
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
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      )}

      <Dialog open={!!transcript} onOpenChange={(o) => !o && setTranscript(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Call Transcript</DialogTitle>
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

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <Card className={`p-4 ${highlight ? "ring-2 ring-primary" : ""}`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
    </Card>
  );
}

export default DhipayaCallList;
