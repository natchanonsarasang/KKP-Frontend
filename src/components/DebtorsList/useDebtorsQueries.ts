import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { listDebtorsByWorkspace } from "@/api/debtors";
import { listCallListItemsByWorkspace } from "@/api/callListItems";
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

  // Fetch call stats from raw call_records (like a CDP)
  const { data: callStats } = useQuery({
    queryKey: ["call-stats-by-phone"],
    queryFn: async () => {
      const data = await listCallRecords({});

      // Calculate stats per phone number from raw data
      const stats: Record<string, PhoneCallStats> = {};

      data.forEach((record) => {
        if (!stats[record.phone_number]) {
          stats[record.phone_number] = {
            total: 0,
            confirmed: 0,
            declined: 0,
            no_response: 0,
            picked_up: 0,
            not_picked_up: 0,
          };
        }
        stats[record.phone_number].total++;

        // Count by status from call_records
        if (record.status === "confirmed") {
          stats[record.phone_number].confirmed++;
          stats[record.phone_number].picked_up++;
        } else if (record.status === "declined") {
          stats[record.phone_number].declined++;
          stats[record.phone_number].picked_up++;
        } else if (record.status === "no_response") {
          stats[record.phone_number].no_response++;
          stats[record.phone_number].picked_up++;
        } else if (record.status === "completed") {
          stats[record.phone_number].picked_up++;
        } else if (record.status === "no_answer" || record.status === "failed") {
          stats[record.phone_number].not_picked_up++;
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
