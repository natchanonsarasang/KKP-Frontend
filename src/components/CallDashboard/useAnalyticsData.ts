import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listCallRecords } from "@/api/callRecords";
import { listCallListItemsByWorkspace } from "@/api/callListItems";
import { listDebtorsByWorkspace } from "@/api/debtors";
import type { CallListItem, CallRecord, DateRangeType, Debtor, EnrichedCallRecord } from "./types";

interface UseAnalyticsDataArgs {
  effectiveUserId: string | null | undefined;
  workspaceId: string | undefined;
  dateRange: DateRangeType;
  customRange: unknown;
  getDateFilter: () => { start: string | undefined; end: string | undefined };
  searchQuery: string;
}

// All read queries backing the Analytics dashboard, plus the derived joins
// (debtor lookup maps, enriched/filtered call records) the UI renders from.
// Polling is gated on an active call session — see the refetchInterval
// comments — so the page stays quiet when nothing is actively being called.
export function useAnalyticsData({
  effectiveUserId,
  workspaceId,
  dateRange,
  customRange,
  getDateFilter,
  searchQuery,
}: UseAnalyticsDataArgs) {
  const queryClient = useQueryClient();

  const { data: callRecords, isLoading: loadingRecords, refetch: refetchRecords } = useQuery({
    queryKey: ["call-records", effectiveUserId, workspaceId, dateRange, customRange],
    queryFn: async () => {
      if (!workspaceId) return [];
      const records = await listCallRecords({
        workspace_id: workspaceId,
        ...(effectiveUserId ? { user_id: effectiveUserId } : {}),
      });

      // Date filtering happens client-side (the Go list endpoint has no date range).
      const { start, end } = getDateFilter();
      let filtered = records;
      if (start) filtered = filtered.filter((r) => r.created_at >= start);
      if (end) filtered = filtered.filter((r) => r.created_at <= end);

      return [...filtered].sort((a, b) => b.created_at.localeCompare(a.created_at)) as unknown as CallRecord[];
    },
    // Only poll while a call session is actually running/stopping — otherwise
    // this hits the backend every 10s forever just from having the page open.
    refetchInterval: () => {
      const session = queryClient.getQueryData<{ status: string } | null>(["active-call-session", effectiveUserId, workspaceId]);
      return session && ["running", "stopping"].includes(session.status) ? 10000 : false;
    },
    enabled: !!effectiveUserId && !!workspaceId,
  });

  const { data: callListItems, isLoading: loadingItems, refetch: refetchItems } = useQuery({
    queryKey: ["call-list-items-analytics", effectiveUserId, workspaceId, dateRange, customRange],
    queryFn: async () => {
      if (!workspaceId) return [];
      let items = await listCallListItemsByWorkspace(workspaceId);

      if (effectiveUserId) items = items.filter((i) => i.user_id === effectiveUserId);
      const { start, end } = getDateFilter();
      if (start) items = items.filter((i) => i.created_at >= start);
      if (end) items = items.filter((i) => i.created_at <= end);

      return [...items].sort((a, b) => b.created_at.localeCompare(a.created_at)) as unknown as CallListItem[];
    },
    // Only poll while a call session is actually running/stopping — otherwise
    // this hits the backend every 10s forever just from having the page open.
    refetchInterval: () => {
      const session = queryClient.getQueryData<{ status: string } | null>(["active-call-session", effectiveUserId, workspaceId]);
      return session && ["running", "stopping"].includes(session.status) ? 10000 : false;
    },
    enabled: !!effectiveUserId && !!workspaceId,
  });

  const { data: debtors } = useQuery({
    queryKey: ["analytics-debtors", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const data = await listDebtorsByWorkspace(workspaceId);
      return data as unknown as Debtor[];
    },
    enabled: !!workspaceId,
  });

  // Debtor lookup maps
  const debtorByPhone = useMemo(() => {
    const map = new Map<string, Debtor>();
    (debtors || []).forEach((d) => map.set(d.phone_number, d));
    return map;
  }, [debtors]);

  // Enriched call history: join call_records with debtor info + call_list_items
  const enrichedRecords = useMemo<EnrichedCallRecord[]>(() => {
    if (!callRecords) return [];
    // Build a map from call_record_id -> call_list_item for outcome/pickup
    const cliByRecordId = new Map<string, CallListItem>();
    (callListItems || []).forEach((item) => {
      const recordId = (item as unknown as Record<string, unknown>).call_record_id as string | null;
      if (recordId) cliByRecordId.set(recordId, item);
    });

    return callRecords.map((record) => {
      const debtor = debtorByPhone.get(record.phone_number);
      const cli = cliByRecordId.get(record.id);
      const vars = debtor?.variables || {};
      const debtorName = vars.name || (debtor ? `${debtor.name || ""} ${debtor.last_name || ""}`.trim() : "");
      const amountVal =
        vars.amount ||
        vars.outstanding_amount ||
        (debtor?.total_debt != null ? String(debtor.total_debt) : "") ||
        record.amount ||
        "";
      const dueDateVal = vars.due_date || debtor?.due_date || record.due_date || "";
      return {
        ...record,
        debtor_name: debtorName,
        amount: amountVal,
        due_date: dueDateVal,
        picked_up: cli?.picked_up ?? null,
        call_outcome: cli?.call_outcome ?? null,
      };
    });
  }, [callRecords, callListItems, debtorByPhone]);

  // Filtered by search
  const filteredRecords = useMemo(() => {
    if (!searchQuery) return enrichedRecords;
    const q = searchQuery.toLowerCase();
    return enrichedRecords.filter((r) => r.phone_number.includes(q) || r.debtor_name.toLowerCase().includes(q));
  }, [enrichedRecords, searchQuery]);

  const handleRefresh = () => {
    refetchRecords();
    refetchItems();
    toast.success("Data refreshed");
  };

  return {
    callListItems,
    debtorByPhone,
    filteredRecords,
    isLoading: loadingRecords || loadingItems,
    handleRefresh,
  };
}
