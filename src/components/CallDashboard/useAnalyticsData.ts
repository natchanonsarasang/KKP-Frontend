import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listCallRecords } from "@/api/callRecords";
import { listCallListItemsByWorkspace } from "@/api/callListItems";
import { listCallAttemptsByWorkspace } from "@/api/callAttempts";
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

  // Kept for the loading state + manual refresh; the history table itself is now
  // derived from call_list_items (see enrichedRecords below), not from this data.
  const { isLoading: loadingRecords, refetch: refetchRecords } = useQuery({
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

  // Call attempts drive the "Recent Calls" history — one row per dial, so retries
  // show as separate entries. We request status="finished" so each completed dial
  // yields exactly one canonical row (the webhook also writes a redundant
  // success/failed row per dial, which this filter excludes).
  const { data: callAttempts, isLoading: loadingAttempts, refetch: refetchAttempts } = useQuery({
    queryKey: ["call-attempts-analytics", effectiveUserId, workspaceId, dateRange, customRange],
    queryFn: async () => {
      if (!workspaceId) return [];
      let attempts = await listCallAttemptsByWorkspace(workspaceId, { status: "finished" });

      if (effectiveUserId) attempts = attempts.filter((a) => a.user_id === effectiveUserId);
      const { start, end } = getDateFilter();
      if (start) attempts = attempts.filter((a) => a.created_at >= start);
      if (end) attempts = attempts.filter((a) => a.created_at <= end);

      return [...attempts].sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
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

  const debtorById = useMemo(() => {
    const map = new Map<string, Debtor>();
    (debtors || []).forEach((d) => map.set(d.id, d));
    return map;
  }, [debtors]);

  // call_list_item lookup (by id) so each attempt can resolve the debtor snapshot
  // (phone/name/amount) captured on its parent list item.
  const itemById = useMemo(() => {
    const map = new Map<string, CallListItem>();
    (callListItems || []).forEach((item) => map.set(item.id, item));
    return map;
  }, [callListItems]);

  // Enriched call history — one row per call attempt (retries included). Sourced
  // from call_attempts rather than call_records: a single dial's debtor identity
  // is resolved from its parent call_list_item's snapshot, then the debtor record
  // as a fallback. Each attempt already carries its own outcome + AI fields.
  const enrichedRecords = useMemo<EnrichedCallRecord[]>(() => {
    const attempts = callAttempts || [];
    return attempts.map((attempt) => {
      const item = attempt.call_list_item_id ? itemById.get(attempt.call_list_item_id) : undefined;
      const debtorId = item?.debtor_id;
      const debtor =
        (debtorId ? debtorById.get(debtorId) : undefined) ||
        (item?.debtor_phone ? debtorByPhone.get(item.debtor_phone) : undefined);
      const vars = debtor?.variables || {};

      const phone = item?.debtor_phone || debtor?.phone_number || "";
      const debtorName =
        item?.debtor_name ||
        vars.name ||
        (debtor ? `${debtor.name || ""} ${debtor.last_name || ""}`.trim() : "");
      const amountVal =
        (item?.debtor_amount != null ? String(item.debtor_amount) : "") ||
        vars.total_debt ||
        vars.amount ||
        vars.outstanding_amount ||
        (debtor?.total_debt != null ? String(debtor.total_debt) : "") ||
        "";
      const dueDateVal = vars.due_date_iso || debtor?.due_date || "";

      return {
        id: attempt.id,
        phone_number: phone,
        due_date: dueDateVal,
        amount: amountVal,
        // Prefer the parent item's two-state status (success/failed, set by the
        // webhook) for the badge; fall back to the attempt's own status.
        status: item?.status || attempt.status || "",
        botnoi_call_id: attempt.call_record_id ?? null,
        created_at: attempt.created_at,
        updated_at: attempt.updated_at ?? attempt.created_at,
        template_id: item?.template_id ?? null,
        call_duration: attempt.call_duration ?? null,
        result_data: null,
        appointment_date: null,
        appointment_time: null,
        user_id: attempt.user_id ?? null,
        workspace_id: attempt.workspace_id ?? null,
        debtor_name: debtorName,
        picked_up: attempt.picked_up ?? null,
        call_outcome: attempt.call_outcome ?? null,
        ai_category: attempt.ai_category ?? null,
        ai_reason: attempt.ai_reason ?? null,
        ai_confidence: attempt.ai_confidence ?? null,
        conversation_log: attempt.conversation_log ?? null,
        audio_url: attempt.audio_url ?? null,
      } satisfies EnrichedCallRecord;
    });
  }, [callAttempts, itemById, debtorById, debtorByPhone]);

  // Filtered by search
  const filteredRecords = useMemo(() => {
    if (!searchQuery) return enrichedRecords;
    const q = searchQuery.toLowerCase();
    return enrichedRecords.filter((r) => r.phone_number.includes(q) || r.debtor_name.toLowerCase().includes(q));
  }, [enrichedRecords, searchQuery]);

  const handleRefresh = () => {
    refetchRecords();
    refetchItems();
    refetchAttempts();
    toast.success("Data refreshed");
  };

  return {
    callListItems,
    debtorByPhone,
    filteredRecords,
    isLoading: loadingRecords || loadingItems || loadingAttempts,
    handleRefresh,
  };
}
