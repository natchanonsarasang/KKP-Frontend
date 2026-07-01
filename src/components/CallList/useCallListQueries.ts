import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listDebtorsByWorkspace } from "@/api/debtors";
import { listCallListItemsByWorkspace } from "@/api/callListItems";
import { listCallRecords } from "@/api/callRecords";
import { listCallSessions } from "@/api/callSessions";
import type { CallListItem, CallSession, Debtor } from "./types";

interface UseCallListQueriesArgs {
  effectiveUserId: string | null | undefined;
  workspaceId: string | undefined;
}

export type PhoneStats = Record<
  string,
  { picked_up: number; not_picked_up: number; confirmed: number; declined: number }
>;

// All read queries backing the Call List page: the queue itself, the debtor
// pool available to queue, call-record stats used for filtering, today's call
// count, and the active call session. Polling is gated on the session being
// "running"/"stopping" — see the refetchInterval comments below — so the page
// stays quiet when idle instead of hitting the backend on a fixed timer forever.
export function useCallListQueries({ effectiveUserId, workspaceId }: UseCallListQueriesArgs) {
  const queryClient = useQueryClient();

  // Fetch active call session for this workspace
  const { data: activeSession, refetch: refetchSession } = useQuery({
    queryKey: ["active-call-session", effectiveUserId, workspaceId],
    queryFn: async () => {
      if (!effectiveUserId || !workspaceId) return null;

      const sessions = await listCallSessions({
        workspace_id: workspaceId,
        user_id: effectiveUserId,
      });
      const active = sessions
        .filter((s) => ["running", "stopping", "paused"].includes(s.status))
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      return (active[0] ?? null) as unknown as CallSession | null;
    },
    enabled: !!effectiveUserId && !!workspaceId,
    // Only poll while a session is actively running/stopping, and slowly (10s)
    // — this just needs to catch progress/completion eventually, not in
    // real time. Idle (no session, or paused) means no background polling at
    // all — the UI relies on the explicit Refresh button and on
    // refetchSession() calls right after start/pause/resume/stop to pick up
    // the new state immediately.
    refetchInterval: (query) => {
      const data = query.state.data as CallSession | null | undefined;
      return data && ["running", "stopping"].includes(data.status) ? 2000 : false;
    },
    refetchIntervalInBackground: true,
  });

  // Fetch call list items with debtor info (with pagination to bypass 1000 row limit)
  const {
    data: callListItems,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["call-list-items", effectiveUserId, workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [] as CallListItem[];

      let allItems = (await listCallListItemsByWorkspace(workspaceId)) as unknown as CallListItem[];
      if (effectiveUserId) allItems = allItems.filter((it) => it.user_id === effectiveUserId);
      // Exclude "incomplete" entirely (hanged_up rows ARE included)
      allItems = allItems.filter((it) => it.status !== "incomplete");
      allItems = [...allItems].sort((a, b) =>
        (b.created_at || "").localeCompare(a.created_at || ""),
      );

      if (allItems.length === 0) return [] as CallListItem[];

      // Join debtor info from a single workspace fetch.
      const allDebtors = (await listDebtorsByWorkspace(workspaceId)) as unknown as Debtor[];
      const debtorMap = new Map(allDebtors.map((d) => [d.id, d]));

      return allItems.map((item) => ({
        ...item,
        debtor: debtorMap.get(item.debtor_id),
      })) as CallListItem[];
    },
    enabled: !!effectiveUserId && !!workspaceId,
    staleTime: 0,
    // Enable fast 2-second polling when a batch session is actively running
    // OR when any single call list item is in "calling" status. Goes completely
    // quiet (no background requests) when the app is idle.
    refetchInterval: (query) => {
      const items = query.state.data as CallListItem[] | undefined;
      // Poll if there are any active items (calling, pending, or retry_pending)
      // since the Go/MongoDB backend doesn't trigger Supabase Realtime WebSockets.
      const hasActiveItem = items?.some((it) => 
        ["calling", "pending", "retry_pending"].includes(it.status)
      );

      const session = queryClient.getQueryData<CallSession | null>(["active-call-session", effectiveUserId, workspaceId]);
      const isSessionRunning = session && ["running", "stopping"].includes(session.status);

      return isSessionRunning || hasActiveItem ? 2000 : false;
    },
    refetchIntervalInBackground: true,
  });

  // Fetch all active debtors for bulk queue (with pagination to bypass 1000 row limit)
  const { data: allActiveDebtors, isLoading: isLoadingAllActiveDebtors } = useQuery({
    queryKey: ["all-active-debtors", effectiveUserId, workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [] as Debtor[];

      const all = (await listDebtorsByWorkspace(workspaceId)) as unknown as Debtor[];
      return all.filter(
        (d) =>
          ["active", "pending", "negotiating"].includes(d.status) &&
          (!effectiveUserId || d.user_id === effectiveUserId),
      );
    },
    enabled: !!effectiveUserId && !!workspaceId,
  });

  // Fetch call records stats for filtering (same logic as DebtorsList)
  const { data: phoneStats } = useQuery({
    queryKey: ["call-records-stats-for-filter", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return {} as PhoneStats;

      const records = await listCallRecords({ workspace_id: workspaceId });
      const data = records.filter((r) => !["hanged_up", "incomplete"].includes(r.status as string));

      const stats: PhoneStats = {};

      data.forEach((record) => {
        if (!stats[record.phone_number]) {
          stats[record.phone_number] = {
            picked_up: 0,
            not_picked_up: 0,
            confirmed: 0,
            declined: 0,
          };
        }

        if (record.status === "confirmed") {
          stats[record.phone_number].confirmed++;
          stats[record.phone_number].picked_up++;
        } else if (record.status === "declined") {
          stats[record.phone_number].declined++;
          stats[record.phone_number].picked_up++;
        } else if (record.status === "no_response" || record.status === "completed") {
          stats[record.phone_number].picked_up++;
        } else if (record.status === "no_answer" || record.status === "failed") {
          stats[record.phone_number].not_picked_up++;
        }
      });
      return stats;
    },
    enabled: !!workspaceId,
  });

  // Get today's call count for daily limit
  const { data: todayCallCount } = useQuery({
    queryKey: ["today-call-count", effectiveUserId, workspaceId],
    queryFn: async () => {
      if (!workspaceId) return 0;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();

      let items = await listCallListItemsByWorkspace(workspaceId);
      if (effectiveUserId) items = items.filter((i) => i.user_id === effectiveUserId);
      // called_at is a Go time.Time; unset rows carry the zero date "0001-...".
      return items.filter((i) => i.called_at && i.called_at >= todayIso).length;
    },
    enabled: !!effectiveUserId && !!workspaceId,
  });

  // Fetch available debtors (not already in pending call list)
  const { data: availableDebtors } = useQuery({
    queryKey: ["available-debtors-for-call", effectiveUserId, workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [] as Debtor[];

      let pendingItems = await listCallListItemsByWorkspace(workspaceId);
      pendingItems = pendingItems.filter(
        (i) =>
          ["pending", "retry_pending", "calling"].includes(i.status) &&
          (!effectiveUserId || i.user_id === effectiveUserId),
      );
      const pendingDebtorIds = new Set(pendingItems.map((item) => item.debtor_id));

      const all = (await listDebtorsByWorkspace(workspaceId)) as unknown as Debtor[];
      return all.filter(
        (d) =>
          ["active", "pending", "negotiating"].includes(d.status) &&
          (!effectiveUserId || d.user_id === effectiveUserId) &&
          !pendingDebtorIds.has(d.id),
      );
    },
    enabled: !!effectiveUserId && !!workspaceId,
  });

  return {
    callListItems,
    isLoading,
    refetch,
    allActiveDebtors,
    isLoadingAllActiveDebtors,
    phoneStats,
    todayCallCount,
    availableDebtors,
    activeSession,
    refetchSession,
  };
}
