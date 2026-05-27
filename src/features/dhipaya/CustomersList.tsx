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
import { deleteCustomer, listCustomers, listPolicies, listInstallmentKb } from "./api/airtable";
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

  const { data: installmentKbData } = useQuery({
    queryKey: ["dhipaya-installment-kb"],
    queryFn: () => listInstallmentKb({ pageSize: 100 }),
  });

  const planCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of installmentKbData?.items ?? []) {
      if (item.planCode) map.set(item.id, item.planCode);
    }
    return map;
  }, [installmentKbData]);

  const policyMap = useMemo(() => {
    const mapByCustomer = new Map<string, string>();
    const mapByPolicy = new Map<string, string>();
    console.log("Policies Data:", policiesData?.policies);
    for (const p of policiesData?.policies ?? []) {
      if (p.expiryDate) {
        if (p.customerId) mapByCustomer.set(p.customerId, p.expiryDate);
        if (p.policyNumber) mapByPolicy.set(p.policyNumber, p.expiryDate);
      }
    }
    return { mapByCustomer, mapByPolicy };
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
    const chosen = customers
      .filter((c) => selectedIds.has(c.id))
      .map((c) => ({
        ...c,
        expiryDate:
          policyMap.mapByCustomer.get(c.id) ||
          (c.policyNumber ? policyMap.mapByPolicy.get(c.policyNumber) : undefined) ||
          c.expiryDate,
      }));
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
    <div className="space-y-6">
      <Card className="shadow-sm border-border/60">
        <CardHeader className="flex flex-col gap-4 pb-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-xl font-semibold tracking-tight">Customers</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {customers.length} on this page · <span className="font-medium text-foreground">{queued.length}</span> in queue
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSync} disabled={isFetching} className="h-9">
              <RefreshCcw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              {isFetching ? "Syncing…" : "Sync"}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={sendSelectedToCallList}
              disabled={selectedIds.size === 0}
              className="h-9 shadow-sm"
            >
              <Send className="w-4 h-4 mr-2" />
              Send to Call List
              {selectedIds.size > 0 && (
                <span className="ml-2 rounded-md bg-primary-foreground/20 px-1.5 py-0.5 text-xs font-semibold">
                  {selectedIds.size}
                </span>
              )}
            </Button>
            <Button size="sm" variant="secondary" onClick={onNextStep} className="h-9">
              Next: Call List
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Search + Consent filter */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, routing…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10 bg-muted/30 border-border/60 focus-visible:bg-background"
              />
            </div>
            <Select value={consentFilter} onValueChange={setConsentFilter}>
              <SelectTrigger className="w-full sm:w-[200px] h-10 bg-muted/30 border-border/60">
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

          <div className="rounded-lg border border-border/60 overflow-hidden bg-card">
            <div className="max-h-[640px] overflow-auto">

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
                <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                  <TableRow className="hover:bg-transparent border-b border-border/60">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? "indeterminate" : false}
                        onCheckedChange={toggleAll}
                        aria-label="Select all"
                        disabled={callable.length === 0}
                      />
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phone</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Routing</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Consent</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Policy</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Policy Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Renewal Premium</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outstanding</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plan Code</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notice Sent</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment Date</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expiry Date</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Policy (Detail)</TableHead>
                    <TableHead className="w-12 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={15} className="text-center text-muted-foreground py-12">
                        <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
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
                      const isSelected = selectedIds.has(c.id);
                      return (
                        <TableRow
                          key={c.id}
                          data-state={isSelected ? "selected" : undefined}
                          className="group transition-colors hover:bg-muted/40 data-[state=selected]:bg-primary/5"
                        >
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleOne(c.id)}
                              disabled={!hasPhone}
                              aria-label="Select customer"
                            />
                          </TableCell>
                          <TableCell className="font-medium whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                {((c.firstName?.[0] || "") + (c.lastName?.[0] || "")).toUpperCase() || "?"}
                              </div>
                              <span>{[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}</span>
                              {c.duplicateFlag && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  dup
                                </Badge>
                              )}
                              {inQueue && (
                                <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 border-transparent hover:bg-blue-200">
                                  queued
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {hasPhone ? (
                              c.phone1 || c.phone2 || c.phone3
                            ) : (
                              <span className="text-muted-foreground italic">no phone</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{c.routingGroup ? c.routingGroup : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell>
                            {(() => {
                              const s = (c.consentStatus ?? "").trim();
                              if (s === "Consent Given")
                                return (
                                  <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-transparent font-medium">
                                    ✓ Given
                                  </Badge>
                                );
                              if (s === "Consent Denied")
                                return (
                                  <Badge className="bg-red-100 text-red-700 hover:bg-red-200 border-transparent font-medium">
                                    ✗ Denied
                                  </Badge>
                                );
                              return s ? <Badge variant="secondary">{s}</Badge> : <span className="text-muted-foreground">—</span>;
                            })()}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{c.policyNumber ? c.policyNumber : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-sm">{c.policyStatus ? <Badge variant="outline" className="font-normal">{c.policyStatus}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-sm tabular-nums">{c.renewalPremium ? c.renewalPremium : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-sm tabular-nums">{c.outstandingBalance ? c.outstandingBalance : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-sm">{c.planCodeId ? (planCodeMap.get(c.planCodeId) ?? c.planCodeId) : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-sm">{c.noticeSent ? c.noticeSent : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{c.paymentDate ? c.paymentDate : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {(() => {
                              const byRecId = policyMap.mapByCustomer.get(c.id);
                              if (byRecId) return byRecId;
                              const byPolicy = c.policyNumber ? policyMap.mapByPolicy.get(c.policyNumber) : null;
                              if (byPolicy) return byPolicy;
                              return <span className="text-muted-foreground">—</span>;
                            })()}
                          </TableCell>
                          <TableCell className="text-sm">{c.policy ? c.policy : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity"
                                  aria-label="Open actions"
                                >
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
          </div>


          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{filtered.length}</span> of{" "}
              <span className="font-semibold text-foreground">{customers.length}</span>
              {selectedIds.size > 0 && (
                <>
                  {" · "}
                  <span className="font-semibold text-primary">{selectedIds.size} selected</span>
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                disabled={offsetStack.length <= 1}
                onClick={() => setOffsetStack((s) => s.slice(0, -1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
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
