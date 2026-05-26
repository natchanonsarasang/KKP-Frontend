import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { listCustomers } from "./api/airtable";
import { addToCallQueue, useCallQueue } from "./lib/callQueueStore";
import { normalizeThaiPhone } from "./lib/phone";
import { Loader2, RefreshCcw, ArrowRight, Send } from "lucide-react";

interface Props {
  onNextStep: () => void;
}

const DhipayaCustomersList = ({ onNextStep }: Props) => {
  const [offsetStack, setOffsetStack] = useState<(string | undefined)[]>([undefined]);
  const currentOffset = offsetStack[offsetStack.length - 1];
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const queued = useCallQueue();
  const queuedIds = useMemo(() => new Set(queued.map((c) => c.id)), [queued]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["dhipaya-customers", currentOffset],
    queryFn: () => listCustomers({ pageSize: 50, offset: currentOffset }),
  });

  const customers = data?.customers ?? [];

  // Rows that have at least one valid phone number can be queued.
  const callable = useMemo(
    () =>
      customers.filter(
        (c) =>
          normalizeThaiPhone(c.phone1) ||
          normalizeThaiPhone(c.phone2) ||
          normalizeThaiPhone(c.phone3),
      ),
    [customers],
  );

  const allSelected =
    callable.length > 0 && callable.every((c) => selectedIds.has(c.id));
  const someSelected = !allSelected && callable.some((c) => selectedIds.has(c.id));

  function toggleAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const c of callable) next.delete(c.id);
      } else {
        for (const c of callable) next.add(c.id);
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function sendSelectedToCallList() {
    const chosen = customers.filter((c) => selectedIds.has(c.id));
    if (chosen.length === 0) {
      toast.error("Select at least one customer");
      return;
    }
    const added = addToCallQueue(chosen);
    setSelectedIds(new Set());
    if (added === 0) {
      toast.info("All selected customers are already in the call queue");
    } else {
      toast.success(
        `Added ${added} customer${added > 1 ? "s" : ""} to the call list`,
      );
    }
    // Always advance to the Call List step so the user lands where work happens.
    onNextStep();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Customers</h2>
          <p className="text-sm text-muted-foreground">
            Live data from Airtable · {queued.length} in call queue
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="secondary"
            onClick={sendSelectedToCallList}
            disabled={selectedIds.size === 0}
          >
            <Send className="w-4 h-4 mr-2" />
            Send to Call List ({selectedIds.size})
          </Button>
          <Button onClick={onNextStep}>
            Next: Call List
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Loading customers...
          </div>
        ) : isError ? (
          <div className="p-6 text-sm text-destructive">
            {(error as Error)?.message || "Failed to load customers."}
            <p className="mt-2 text-muted-foreground">
              Make sure the Airtable secrets <code>AIRTABLE_PAT</code> and <code>AIRTABLE_BASE_ID</code> are set.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                    disabled={callable.length === 0}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Routing</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Consent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No customers found.
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((c) => {
                  const hasPhone =
                    !!normalizeThaiPhone(c.phone1) ||
                    !!normalizeThaiPhone(c.phone2) ||
                    !!normalizeThaiPhone(c.phone3);
                  const inQueue = queuedIds.has(c.id);
                  return (
                    <TableRow key={c.id} data-state={selectedIds.has(c.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(c.id)}
                          onCheckedChange={() => toggleOne(c.id)}
                          disabled={!hasPhone}
                          aria-label="Select customer"
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}
                        {c.duplicateFlag && (
                          <Badge variant="outline" className="ml-2">dup</Badge>
                        )}
                        {inQueue && (
                          <Badge variant="secondary" className="ml-2">in queue</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {hasPhone ? (
                          c.phone1 || c.phone2 || c.phone3
                        ) : (
                          <span className="text-muted-foreground">no valid phone</span>
                        )}
                      </TableCell>
                      <TableCell>{c.routingGroup || "—"}</TableCell>
                      <TableCell>{c.campaign || "—"}</TableCell>
                      <TableCell>
                        {c.consentStatus ? (
                          <Badge variant="secondary">{c.consentStatus}</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={offsetStack.length <= 1}
          onClick={() => setOffsetStack((s) => s.slice(0, -1))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!data?.offset}
          onClick={() => data?.offset && setOffsetStack((s) => [...s, data.offset])}
        >
          Next
        </Button>
      </div>
    </div>
  );
};

export default DhipayaCustomersList;
