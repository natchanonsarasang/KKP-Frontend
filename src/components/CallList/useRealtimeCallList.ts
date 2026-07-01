import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface UseRealtimeCallListArgs {
  workspaceId: string | undefined;
  effectiveUserId: string | null | undefined;
  /** Called whenever call_list_items changes — use to force an immediate refetch. */
  onCallListChange?: () => void;
  /** Called whenever call_sessions changes. */
  onSessionChange?: () => void;
}

// Subscribes to Supabase Realtime changes on `call_list_items` and
// `call_sessions` for the current workspace.
//
// Design notes:
// - A single WebSocket channel covers both tables.
// - On any row change the relevant React Query caches are invalidated AND
//   the optional `onCallListChange` / `onSessionChange` callbacks are called,
//   so the parent can additionally call `refetch()` for an immediate re-render
//   without waiting for React Query's internal scheduler.
// - The subscription status is logged so you can verify Realtime is connected
//   in the browser console.
export function useRealtimeCallList({
  workspaceId,
  effectiveUserId,
  onCallListChange,
  onSessionChange,
}: UseRealtimeCallListArgs) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId || !effectiveUserId) return;
    if (!supabase) {
      console.warn("[Realtime] Supabase client is not configured. Realtime subscriptions are disabled.");
      return;
    }

    const channelName = `call-list-realtime-${workspaceId}`;

    const channel = supabase
      .channel(channelName)
      // ── call_list_items ────────────────────────────────────────────────────
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "call_list_items",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          console.log("[Realtime] call_list_items changed:", payload.eventType, payload.new);

          // Invalidate cached list so React Query re-fetches fresh data.
          queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
          queryClient.invalidateQueries({ queryKey: ["available-debtors-for-call"] });

          // Call the parent's immediate refetch if provided.
          onCallListChange?.();
        },
      )
      // ── call_sessions ──────────────────────────────────────────────────────
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "call_sessions",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          console.log("[Realtime] call_sessions changed:", payload.eventType, payload.new);

          queryClient.invalidateQueries({
            queryKey: ["active-call-session", effectiveUserId, workspaceId],
          });

          onSessionChange?.();
        },
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          console.log(`[Realtime] ✅ Subscribed to channel: ${channelName}`);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(`[Realtime] ❌ Subscription error on ${channelName}:`, status, err);
        } else {
          console.log(`[Realtime] Channel status: ${status}`);
        }
      });

    return () => {
      console.log(`[Realtime] Unsubscribing from channel: ${channelName}`);
      supabase.removeChannel(channel);
    };
  }, [workspaceId, effectiveUserId, queryClient, onCallListChange, onSessionChange]);
}
