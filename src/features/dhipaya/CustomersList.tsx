import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { deleteCustomer, listCustomers, listPolicies } from "./api/airtable";
import { addToCallQueue, useCallQueue } from "./lib/callQueueStore";
import { normalizeThaiPhone } from "./lib/phone";
import EditCustomerDialog from "./EditCustomerDialog";
import type { Customer } from "./types";
import { Loader2, RefreshCcw, ArrowRight, Send, Search, Users, Pencil, MoreHorizontal, Trash2 } from "lucide-react";

interface Props {
  onNextStep: () => void;
}

const DhipayaCustomersList = ({ onNextStep }: Props) => {
  const [offsetStack, setOffsetStack] = useState<(string | undefined)[]>([undefined]);
  const currentOffset = offsetStack[offsetStack.length - 1];
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [consentFilter, setConsentFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);

  const queued = useCallQueue();
  const queuedIds = useMemo(() => new Set(queued.map((c) => c.id)), [queued]);

  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["dhipaya-customers", currentOffset],
    queryFn: () => listCustomers({ pageSize: 50, offset: currentOffset }),
    staleTime: 0,
    gcTime: 0,
  });

  const customers = data?.customers ?? [];

  const { data: policiesData } = useQuery({
    queryKey: ["dhipaya-policies"],
    queryFn: () => listPolicies({ pageSize: 100 }),
  });

  const policyMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of policiesData?.policies ?? []) {
      if (p.customerId && p.expiryDate) map.set(p.customerId, p.expiryDate);
    }
    return map;
  }, [policiesData]);

  // Reconcile selection against the latest fetched page — drop ghost IDs.
  useEffect(() => {
    if (!data) return;
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const currentIds = new Set(customers.map((c) => c.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (currentIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  async function handleSync() {
    await queryClient.invalidateQueries({ queryKey: ["dhipaya-customers"] });
    await refetch();
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCustomer(id),
    onSuccess: () => {
      toast.success("Customer deleted");
      queryClient.invalidateQueries({ queryKey: ["dhipaya-customers"] });
      setDeleting(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete customer");
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (consentFilter !== "all") {
        const status = (c.consentStatus ?? "").trim();
        if (consentFilter === "none") {
          if (status !== "" && status !== "—") return false;
        } else if (status !== consentFilter) {
          return false;
        }
      }
      if (!q) return true;
      const name = [c.firstName, c.lastName].filter(Boolean).join(" ").toLowerCase();
      return (
        name.includes(q) ||
        (c.phone1 || "").toLowerCase().includes(q) ||
        (c.phone2 || "").toLowerCase().includes(q) ||
        (c.phone3 || "").toLowerCase().includes(q) ||
        (c.campaign || "").toLowerCase().includes(q) ||
        (c.routingGroup || "").toLowerCase().includes(q)
      );
    });
  }, [customers, search, consentFilter]);

  // Rows that have at least one valid phone number can be queued.
  const callable = useMemo(
    () =>
      filtered.filter(
        (c) => normalizeThaiPhone(c.phone1) || normalizeThaiPhone(c.phone2) || normalizeThaiPhone(c.phone3),
      ),
    [filtered],
  );

  const allSelected = callable.length > 0 && callable.every((c) => selectedIds.has(c.id));
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
      toast.success(`Added ${added} customer${added > 1 ? "s" : ""} to the call list`);
    }
    onNextStep();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <CardTitle className="text-xl">Customers</CardTitle>
            <Badge variant="secondary" className="ml-2">
              {queued.length} in queue
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSync} disabled={isFetching}>
              <RefreshCcw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              {isFetching ? "Syncing…" : "Sync"}
            </Button>
            <Button variant="default" size="sm" onClick={sendSelectedToCallList} disabled={selectedIds.size === 0}>
              <Send className="w-4 h-4 mr-2" />
              Send to Call List ({selectedIds.size})
            </Button>
            <Button size="sm" variant="secondary" onClick={onNextStep}>
              Next: Call List
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Search + Consent filter */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, routing…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={consentFilter} onValueChange={setConsentFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filter by consent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="Consent Given">Consent Given</SelectItem>
                <SelectItem value="Consent Denied">Consent Denied</SelectItem>
                <SelectItem value="none">—</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border overflow-hidden">
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
                    <TableHead>Consent</TableHead>
                    <TableHead>Policy</TableHead>
                    <TableHead>Policy Status</TableHead>
                    <TableHead>Renewal Premium</TableHead>
                    <TableHead>Outstanding Balance</TableHead>
                    <TableHead>Plan Code</TableHead>
                    <TableHead>Notice Sent</TableHead>
                    <TableHead>Payment Date</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead>Policy (Detail)</TableHead>
                    <TableHead className="w-12 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={14} className="text-center text-muted-foreground py-8">
                        No customers found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((c) => {
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
                              <Badge variant="outline" className="ml-2">
                                dup
                              </Badge>
                            )}
                            {inQueue && (
                              <Badge variant="secondary" className="ml-2">
                                in queue
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {hasPhone ? (
                              c.phone1 || c.phone2 || c.phone3
                            ) : (
                              <span className="text-muted-foreground">no valid phone</span>
                            )}
                          </TableCell>
                          <TableCell>{c.routingGroup ? c.routingGroup : "—"}</TableCell>
                          <TableCell>
                            {(() => {
                              const s = (c.consentStatus ?? "").trim();
                              if (s === "Consent Given")
                                return (
                                  <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-transparent">
                                    {s}
                                  </Badge>
                                );
                              if (s === "Consent Denied")
                                return (
                                  <Badge className="bg-red-100 text-red-700 hover:bg-red-200 border-transparent">
                                    {s}
                                  </Badge>
                                );
                              return s ? <Badge variant="secondary">{s}</Badge> : "—";
                            })()}
                          </TableCell>
                          <TableCell>{c.policyNumber ? c.policyNumber : "—"}</TableCell>
                          <TableCell>{c.policyStatus ? c.policyStatus : "—"}</TableCell>
                          <TableCell>{c.renewalPremium ? c.renewalPremium : "—"}</TableCell>
                          <TableCell>{c.outstandingBalance ? c.outstandingBalance : "—"}</TableCell>
                          <TableCell>{c.planCode ? c.planCode : "—"}</TableCell>
                          <TableCell>{c.noticeSent ? c.noticeSent : "—"}</TableCell>
                          <TableCell>{c.paymentDate ? c.paymentDate : "—"}</TableCell>
                          <TableCell>{policyMap.get(String(c.customerId ?? "")) ?? "—"}</TableCell>
                          <TableCell>{c.policy ? c.policy : "—"}</TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open actions">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setEditing(c)}>
                                  <Pencil className="w-4 h-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleting(c)}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {filtered.length} of {customers.length} on this page
              {selectedIds.size > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-foreground">{selectedIds.size} selected</span>
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
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
        </CardContent>
      </Card>

      <EditCustomerDialog customer={editing} open={!!editing} onOpenChange={(open) => !open && setEditing(null)} />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">
                {[deleting?.firstName, deleting?.lastName].filter(Boolean).join(" ") || "this customer"}
              </span>{" "}
              from Airtable. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleting) deleteMutation.mutate(deleting.id);
              }}
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DhipayaCustomersList;
