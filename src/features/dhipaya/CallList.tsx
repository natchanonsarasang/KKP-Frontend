import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { normalizeThaiPhone } from "./lib/phone";
import {
  useCallQueue,
  clearCallQueue,
  removeFromCallQueue,
} from "./lib/callQueueStore";
import type { Customer } from "./types";

const CONCURRENCY = 5;

type QueueStatus = "pending" | "calling" | "success" | "failed" | "no_answer";

interface PhoneOption {
  label: string; // e.g. "Phone 1"
  raw: string;
  phone: string; // normalized
}

interface QueueRow {
  id: string;
  customer: Customer;
  phoneOptions: PhoneOption[];
  selectedPhone: string; // normalized; one of phoneOptions[].phone
  status: QueueStatus;
  startedAt?: number;
  finishedAt?: number;
  errorMessage?: string;
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
      <Icon className="w-3 h-3" />
      {cfg.label}
    </Badge>
  );
}

const DhipayaCallList = () => {
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const stopRef = useRef(false);
  const runningRef = useRef(0);

  const queued = useCallQueue();

  // Sync rows from the shared queue store. Keep existing per-row state
  // (selected phone, status, errors) when the same customer is still queued.
  useEffect(() => {
    setQueue((prev) => {
      const prevById = new Map(prev.map((r) => [r.id, r]));
      const next: QueueRow[] = [];
      for (const c of queued) {
        const existing = prevById.get(c.id);
        if (existing) {
          next.push(existing);
          continue;
        }
        const candidates: Array<{ label: string; raw?: string }> = [
          { label: "Phone 1", raw: c.phone1 },
          { label: "Phone 2", raw: c.phone2 },
          { label: "Phone 3", raw: c.phone3 },
        ];
        const phoneOptions: PhoneOption[] = [];
        for (const { label, raw } of candidates) {
          if (!raw) continue;
          const phone = normalizeThaiPhone(raw);
          if (phone) phoneOptions.push({ label, raw, phone });
        }
        if (phoneOptions.length === 0) continue;
        next.push({
          id: c.id,
          customer: c,
          phoneOptions,
          selectedPhone: phoneOptions[0].phone,
          status: "pending",
        });
      }
      return next;
    });
  }, [queued]);

  const updateRow = (id: string, patch: Partial<QueueRow>) => {
    setQueue((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  async function dialOne(row: QueueRow): Promise<void> {
    updateRow(row.id, { status: "calling", startedAt: Date.now() });
    try {
      const variables = {
        name: [row.customer.firstName, row.customer.lastName].filter(Boolean).join(" "),
        policy_no: row.customer.policyNumber || "",
      };
      const { data: resp, error: invokeErr } = await supabase.functions.invoke(
        "voicebot-make-call",
        { body: { phone_number: row.selectedPhone, variables, interruptible: false } },
      );
      if (invokeErr) throw new Error(invokeErr.message);
      const status: QueueStatus =
        resp && typeof resp === "object" && "success" in resp && !(resp as any).success
          ? "failed"
          : "success";
      updateRow(row.id, { status, finishedAt: Date.now() });
    } catch (e) {
      updateRow(row.id, {
        status: "failed",
        finishedAt: Date.now(),
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const counts = useMemo(() => {
    const c = { pending: 0, calling: 0, completed: 0, total: queue.length };
    for (const r of queue) {
      if (r.status === "pending") c.pending++;
      else if (r.status === "calling") c.calling++;
      else c.completed++;
    }
    return c;
  }, [queue]);

  async function startCalling() {
    if (isRunning || queue.length === 0) return;
    setIsRunning(true);
    stopRef.current = false;

    // Snapshot pending IDs at start; new pendings added later are ignored.
    let cursor = 0;
    const pendingIds = queue.filter((r) => r.status === "pending").map((r) => r.id);
    if (pendingIds.length === 0) {
      toast.info("Nothing to call");
      setIsRunning(false);
      return;
    }
    toast.success(`Starting ${pendingIds.length} calls (max ${CONCURRENCY} parallel)`);

    await new Promise<void>((resolve) => {
      const pump = () => {
        if (stopRef.current && runningRef.current === 0) {
          resolve();
          return;
        }
        while (
          !stopRef.current &&
          runningRef.current < CONCURRENCY &&
          cursor < pendingIds.length
        ) {
          const id = pendingIds[cursor++];
          // Re-read latest row each time
          setQueue((prev) => {
            const row = prev.find((r) => r.id === id);
            if (row && row.status === "pending") {
              runningRef.current++;
              dialOne(row).finally(() => {
                runningRef.current--;
                pump();
              });
            }
            return prev;
          });
        }
        if (
          (cursor >= pendingIds.length || stopRef.current) &&
          runningRef.current === 0
        ) {
          resolve();
        }
      };
      pump();
    });

    setIsRunning(false);
    stopRef.current = false;
    toast.success("Call session finished");
  }

  function stopCalling() {
    stopRef.current = true;
    toast.info("Stopping after in-flight calls finish");
  }

  const rowsByTab: Record<"pending" | "calling" | "completed", QueueRow[]> = {
    pending: queue.filter((r) => r.status === "pending"),
    calling: queue.filter((r) => r.status === "calling"),
    completed: queue.filter(
      (r) => r.status === "success" || r.status === "failed" || r.status === "no_answer",
    ),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Call List</h2>
          <p className="text-sm text-muted-foreground">
            Dhipaya queue · phones normalized to 0XXXXXXXXX · max{" "}
            {CONCURRENCY} parallel
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearCallQueue()}
            disabled={isRunning || queue.length === 0}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear queue
          </Button>
          {isRunning ? (
            <Button variant="destructive" onClick={stopCalling}>
              <Square className="w-4 h-4 mr-2" />
              Stop
            </Button>
          ) : (
            <Button onClick={startCalling} disabled={counts.pending === 0}>
              <Play className="w-4 h-4 mr-2" />
              Start Calling ({counts.pending})
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total" value={counts.total} />
        <StatCard label="Pending" value={counts.pending} />
        <StatCard label="Calling" value={counts.calling} />
        <StatCard label="Completed" value={counts.completed} />
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
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">Pending ({rowsByTab.pending.length})</TabsTrigger>
            <TabsTrigger value="calling">Calling ({rowsByTab.calling.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({rowsByTab.completed.length})</TabsTrigger>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rowsByTab[tab].length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
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
                                onValueChange={(v) => updateRow(r.id, { selectedPhone: v })}
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
                              const sel = r.phoneOptions.find((o) => o.phone === r.selectedPhone);
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
                            {r.errorMessage && (
                              <p className="text-xs text-destructive mt-1">{r.errorMessage}</p>
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
    </div>
  );
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
    </Card>
  );
}

export default DhipayaCallList;
