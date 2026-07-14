import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { listDebtorsByWorkspace } from "@/api/debtors";
import { listCallListItemsByWorkspace } from "@/api/callListItems";
import { listCallAttemptsByWorkspace } from "@/api/callAttempts";
import { listCallRecords } from "@/api/callRecords";
import { resolveLatestStatusLabel, resolveMainStatus, resolveSubStatus } from "@/lib/callStatuses";
import { PAGE_SIZE } from "./constants";
import { applyDebtorFilters } from "./utils";
import type { Debtor, PhoneCallStats, SortDirection } from "./types";

interface UseDebtorsQueriesArgs {
  effectiveUserId: string | null | undefined;
  workspaceId: string | undefined;
  searchQuery: string;
  statusFilter: string;
  callStatusFilter: string;
  dateRange: DateRange | undefined;
  sortField: string;
  sortDirection: SortDirection;
  page: number;
}

// All read queries backing the Debtors page: the latest call-status-per-debtor
// join, the paginated/filtered debtor list itself, raw call-record stats per
// phone, and aggregate counts. Polling is gated on an active call session —
// see the refetchInterval comments — so the page stays quiet when idle.
export function useDebtorsQueries({
  effectiveUserId,
  workspaceId,
  searchQuery,
  statusFilter,
  callStatusFilter,
  dateRange,
  sortField,
  sortDirection,
  page,
}: UseDebtorsQueriesArgs) {
  const queryClient = useQueryClient();

  // Latest call status per debtor (from call_list_items.ai_category, ordered by called_at)
  const { data: latestStatusByDebtor } = useQuery({
    queryKey: ["debtor-latest-call-status", effectiveUserId, workspaceId],
    queryFn: async () => {
      const map = new Map<string, string | null>();
      if (!workspaceId) return map;
      let rows = await listCallListItemsByWorkspace(workspaceId);
      if (effectiveUserId) rows = rows.filter((r) => r.user_id === effectiveUserId);
      // Order by called_at desc (Go zero-time "0001-..." naturally sorts last), then created_at desc.
      rows = [...rows].sort((a, b) => {
        const ca = a.called_at || "";
        const cb = b.called_at || "";
        if (ca !== cb) return cb.localeCompare(ca);
        return (b.created_at || "").localeCompare(a.created_at || "");
      });
      rows.forEach((row) => {
        if (!map.has(row.debtor_id)) map.set(row.debtor_id, row.ai_category ?? null);
      });
      return map;
    },
    enabled: !!effectiveUserId && !!workspaceId,
    // Only poll while a call session is actually running/stopping — otherwise
    // this hits the backend every 10s forever just from having the page open.
    refetchInterval: () => {
      const session = queryClient.getQueryData<{ status: string } | null>(["active-call-session", effectiveUserId, workspaceId]);
      return session && ["running", "stopping"].includes(session.status) ? 10000 : false;
    },
  });

  // Debtor IDs matching the active call-status filter (server-side scope)
  const filteredDebtorIds = useMemo<string[] | null>(() => {
    if (callStatusFilter === "all" || !latestStatusByDebtor) return null;
    const ids: string[] = [];
    latestStatusByDebtor.forEach((cat, debtorId) => {
      if (callStatusFilter === "never") return; // handled separately
      const label = resolveLatestStatusLabel(cat);
      if (callStatusFilter === "Other") {
        if (label === "Other") ids.push(debtorId);
        return;
      }
      // Match by resolved label (works whether DB stores English, Thai, or raw keywords)
      const mainOrSub = resolveMainStatus(cat) ?? resolveSubStatus(cat);
      if (mainOrSub?.label === callStatusFilter || cat === callStatusFilter) {
        ids.push(debtorId);
      }
    });
    return ids;
  }, [callStatusFilter, latestStatusByDebtor]);

  // Paginated query (fetch-all + client-side filter/sort/slice)
  const {
    data: debtorsData,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: [
      "debtors",
      searchQuery,
      statusFilter,
      callStatusFilter,
      filteredDebtorIds,
      sortField,
      sortDirection,
      page,
      effectiveUserId,
      workspaceId,
      dateRange?.from?.toISOString() ?? null,
      dateRange?.to?.toISOString() ?? null,
    ],
    queryFn: async () => {
      if (!workspaceId) return { debtors: [] as Debtor[], totalCount: 0 };
      const all = (await listDebtorsByWorkspace(workspaceId)) as unknown as Debtor[];
      const filtered = applyDebtorFilters(all, {
        effectiveUserId,
        statusFilter,
        callStatusFilter,
        latestStatusByDebtor,
        filteredDebtorIds,
        searchQuery,
        dateRange,
        sortField,
        sortDirection,
      });
      const from = page * PAGE_SIZE;
      return { debtors: filtered.slice(from, from + PAGE_SIZE), totalCount: filtered.length };
    },
    placeholderData: (prev) => prev,
    enabled: !!effectiveUserId,
  });

  const debtors = debtorsData?.debtors;
  const totalCount = debtorsData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Fetch call stats from raw call_records, keyed by DEBTOR ID (not phone number).
  // Phone numbers aren't unique per debtor — two debtors can share one — so keying
  // by phone made a newly-created debtor inherit another debtor's call history.
  // call_records has no debtor_id, so we resolve record -> debtor via call_list_items
  // (has both debtor_id and call_record_id) and call_attempts (covers retry records).
  const { data: callStats } = useQuery({
    queryKey: ["call-stats-by-debtor", effectiveUserId, workspaceId],
    queryFn: async () => {
      const stats: Record<string, PhoneCallStats> = {};
      if (!workspaceId) return stats;

      const [records, listItems, attempts] = await Promise.all([
        listCallRecords({}),
        listCallListItemsByWorkspace(workspaceId),
        listCallAttemptsByWorkspace(workspaceId),
      ]);

      // Map each call_record_id to the debtor it belongs to.
      const itemToDebtor = new Map(listItems.map((it) => [it.id, it.debtor_id]));
      const recordToDebtor = new Map<string, string>();
      listItems.forEach((it) => {
        if (it.call_record_id) recordToDebtor.set(it.call_record_id, it.debtor_id);
      });
      // Attempts carry each retry's own record id; resolve via its list item.
      attempts.forEach((att) => {
        const debtorId = itemToDebtor.get(att.call_list_item_id);
        if (att.call_record_id && debtorId) recordToDebtor.set(att.call_record_id, debtorId);
      });

      records.forEach((record) => {
        const debtorId = recordToDebtor.get(record.id);
        if (!debtorId) return; // record not linked to a debtor in this workspace

        if (!stats[debtorId]) {
          stats[debtorId] = {
            total: 0,
            confirmed: 0,
            declined: 0,
            no_response: 0,
            picked_up: 0,
            not_picked_up: 0,
          };
        }
        stats[debtorId].total++;

        // Count by status from call_records
        if (record.status === "confirmed") {
          stats[debtorId].confirmed++;
          stats[debtorId].picked_up++;
        } else if (record.status === "declined") {
          stats[debtorId].declined++;
          stats[debtorId].picked_up++;
        } else if (record.status === "no_response") {
          stats[debtorId].no_response++;
          stats[debtorId].picked_up++;
        } else if (record.status === "completed") {
          stats[debtorId].picked_up++;
        } else if (record.status === "no_answer" || record.status === "failed") {
          stats[debtorId].not_picked_up++;
        }
      });
      return stats;
    },
    // Only poll while a call session is actually running/stopping — otherwise
    // this hits the backend every 5s forever just from having the page open.
    refetchInterval: () => {
      const session = queryClient.getQueryData<{ status: string } | null>(["active-call-session", effectiveUserId, workspaceId]);
      return session && ["running", "stopping"].includes(session.status) ? 5000 : false;
    },
  });

  // Fetch aggregate stats separately using count queries to avoid 1000 row limit
  const { data: statsData } = useQuery({
    queryKey: ["debtors-stats", effectiveUserId, workspaceId],
    queryFn: async () => {
      if (!workspaceId) return { total: 0, totalDebt: 0, active: 0, paid: 0 };

      const all = await listDebtorsByWorkspace(workspaceId);
      const scoped = effectiveUserId ? all.filter((d) => d.user_id === effectiveUserId) : all;

      const active = scoped.filter((d) => d.status === "active").length;
      const paid = scoped.filter((d) => d.status === "paid").length;

      const totalDebt = scoped.reduce((sum, d) => {
        const vars = (d.variables ?? {}) as Record<string, unknown>;
        const debtValue = vars.Debt || vars.debt || vars.total_debt || 0;
        const numericValue = Number(String(debtValue).replace(/,/g, "")) || 0;
        return sum + numericValue;
      }, 0);

      return { total: scoped.length, totalDebt, active, paid };
    },
    enabled: !!effectiveUserId,
  });

  const stats = statsData || { total: 0, totalDebt: 0, active: 0, paid: 0 };

  return {
    latestStatusByDebtor,
    filteredDebtorIds,
    debtors,
    totalCount,
    totalPages,
    isLoading,
    isFetching,
    callStats,
    stats,
  };
}
