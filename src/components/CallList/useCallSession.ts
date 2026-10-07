import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { updateCallSession } from "@/api/callSessions";
import { createCallSession } from "@/api/callSessions";
import { processCallSession } from "@/api/voicebot";
import type { CallSessionSettings } from "@/api/types";
import type { AutoDialSettings, CallListItem, CallSession } from "./types";

interface UseCallSessionArgs {
  workspaceId: string | undefined;
  settings: AutoDialSettings;
  effectiveUserId: string | null | undefined;
  callListItems: CallListItem[] | undefined;
  activeSession: CallSession | null | undefined;
  refetchSession: () => void;
}

// Session lifecycle (start/pause/resume/stop) and the background heartbeat that
// keeps the backend's stale-session check alive even if the voicebot's result
// webhooks go quiet. All dialing happens server-side via the call-process
// endpoint — there is no client-driven single-call path.
export function useCallSession({
  workspaceId,
  settings,
  effectiveUserId,
  callListItems,
  activeSession,
  refetchSession,
}: UseCallSessionArgs) {
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check if currently within business hours and days
  const isWithinBusinessHours = useCallback(() => {
    if (!settings.businessHoursOnly) return true;

    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday

    // Check if today is a business day
    if (!settings.businessDays.includes(currentDay)) return false;

    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hours * 60 + minutes;

    const [startHour, startMin] = settings.businessHoursStart.split(":").map(Number);
    const [endHour, endMin] = settings.businessHoursEnd.split(":").map(Number);
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    return currentTime >= startTime && currentTime <= endTime;
  }, [settings]);

  // Heartbeat: nudge the backend to re-check for stale "calling" items even when
  // no result webhook arrives to re-trigger ProcessSession (vendor webhooks can
  // go silent, which otherwise leaves a session stuck "in progress" forever).
  useEffect(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    if (activeSession?.status === "running") {
      const sessionId = activeSession.id;
      heartbeatIntervalRef.current = setInterval(() => {
        processCallSession({ session_id: sessionId, action: "continue" }).catch(() => {
          // Fire-and-forget safety net; a failed nudge just means we try again next tick.
        });
      }, 25000);
    }

    // Cleanup heartbeat interval on unmount or when the session stops running
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [activeSession?.id, activeSession?.status]);

  // Start calling using backend session (persists even if page closed)
  const startCalling = useCallback(async () => {
    // Check business hours
    if (!isWithinBusinessHours()) {
      toast.error(`Outside business hours (${settings.businessHoursStart} - ${settings.businessHoursEnd})`);
      return;
    }

    if (!effectiveUserId || !workspaceId) {
      toast.error("Not authenticated or no workspace selected");
      return;
    }

    const pendingItems =
      callListItems?.filter((item) => (item.status === "pending" || item.status === "retry_pending") && item.debtor) ||
      [];

    if (pendingItems.length === 0) {
      toast.error("No pending calls in the list");
      return;
    }

    try {
      // Create a call session (client-generated id; the Go create returns only a message).
      const sessionId = crypto.randomUUID();
      await createCallSession({
        id: sessionId,
        workspace_id: workspaceId,
        status: "running",
        total_calls: pendingItems.length,
        settings: settings as unknown as CallSessionSettings,
      });

      // Start processing in the background via the Go call-process endpoint
      await processCallSession({ session_id: sessionId, action: "start" });

      toast.success(
        `Started calling ${pendingItems.length} debtors. You can close this page - calls will continue in the background.`,
      );
      refetchSession();
    } catch (error) {
      console.error("Error starting call session:", error);
      toast.error("Failed to start call session");
    }
  }, [callListItems, settings, effectiveUserId, workspaceId, isWithinBusinessHours, refetchSession]);

  // Pause the active session
  const pauseCalling = useCallback(async () => {
    if (!activeSession) return;

    try {
      await processCallSession({ session_id: activeSession.id, action: "pause" });

      toast.info("Pausing calls...");
      refetchSession();
    } catch (error) {
      console.error("Error pausing call session:", error);
      toast.error("Failed to pause call session");
    }
  }, [activeSession, refetchSession]);

  // Resume a paused session
  const resumeCalling = useCallback(async () => {
    if (!activeSession || activeSession.status !== "paused") return;

    try {
      // Update status to running
      await updateCallSession(activeSession.id, { status: "running", error_message: null });

      // Start processing again
      await processCallSession({ session_id: activeSession.id, action: "start" });

      toast.success("Resumed calling");
      refetchSession();
    } catch (error) {
      console.error("Error resuming call session:", error);
      toast.error("Failed to resume call session");
    }
  }, [activeSession, refetchSession]);

  // Stop/terminate the active session completely
  const stopCalling = useCallback(async () => {
    if (!activeSession) return;

    try {
      await processCallSession({ session_id: activeSession.id, action: "stop" });

      toast.info("Stopping session...");
      refetchSession();
    } catch (error) {
      console.error("Error stopping call session:", error);
      toast.error("Failed to stop call session");
    }
  }, [activeSession, refetchSession]);

  return {
    isWithinBusinessHours,
    startCalling,
    pauseCalling,
    resumeCalling,
    stopCalling,
  };
}
