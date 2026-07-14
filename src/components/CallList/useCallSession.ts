import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { updateDebtor } from "@/api/debtors";
import { updateCallListItem } from "@/api/callListItems";
import { createCallRecord, getCallRecord, updateCallRecord } from "@/api/callRecords";
import { createCallSession, updateCallSession } from "@/api/callSessions";
import { makeCall as apiMakeCall, processCallSession } from "@/api/voicebot";
import type { CallSessionSettings } from "@/api/types";
import { buildCallPayload } from "./utils";
import type { AutoDialSettings, CallListItem, CallSession, PreviewPayload, Template } from "./types";

interface UseCallSessionArgs {
  templates: Template[];
  workspaceId: string | undefined;
  settings: AutoDialSettings;
  effectiveUserId: string | null | undefined;
  callListItems: CallListItem[] | undefined;
  activeSession: CallSession | null | undefined;
  refetchSession: () => void;
}

// Session lifecycle (start/pause/resume/stop), the single-call flow used by
// the preview dialog, and the background heartbeat that keeps the backend's
// stale-session check alive even if the voicebot's result webhooks go quiet.
export function useCallSession({
  templates,
  workspaceId,
  settings,
  effectiveUserId,
  callListItems,
  activeSession,
  refetchSession,
}: UseCallSessionArgs) {
  const stopAutoDialRef = useRef(false);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [previewPayload, setPreviewPayload] = useState<PreviewPayload | null>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);

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

  // Build the payload for preview/call
  const handlePreviewCall = useCallback(
    (item: CallListItem) => {
      const payload = buildCallPayload(item, templates);
      if (payload) {
        setPreviewPayload(payload);
        setShowPreviewDialog(true);
      } else {
        toast.error("Cannot build call payload - missing template or debtor data");
      }
    },
    [templates],
  );

  // Make a single call
  const makeCall = useCallback(
    async (item: CallListItem): Promise<{ success: boolean; shouldRetry: boolean; finalStatus: string }> => {
      const selectedTemplate = templates?.find((t) => t.id === item.template_id) || templates?.[0];
      if (!selectedTemplate?.template_id || !item.debtor) return { success: false, shouldRetry: false, finalStatus: "failed" };

      const wsId = workspaceId ?? "";
      try {
        const debtor = item.debtor;
        const debtorVars = {
          ...((debtor.variables || {}) as Record<string, string>),
        };

        // Update call list item to calling
        await updateCallListItem(item.id, wsId, {
          status: "calling",
          called_at: new Date().toISOString(),
        });

        // Create call record (client-generated id so we can link + poll it).
        const callRecordId = crypto.randomUUID();
        await createCallRecord({
          id: callRecordId,
          phone_number: debtor.phone_number,
          amount: debtor.total_debt ?? 0,
          status: "calling",
          template_id: selectedTemplate.id,
          workspace_id: wsId,
        });

        // Link call record to call list item
        await updateCallListItem(item.id, wsId, { call_record_id: callRecordId });

        // Make call via the Go voicebot endpoint
        try {
          await apiMakeCall({
            phone_number: debtor.phone_number,
            variables: debtorVars,
            interruptible: !!settings.interruptible,
            bot_type: "in_init_conversation",
          });
        } catch (callError) {
          await updateCallRecord(callRecordId, {
            status: "failed",
            result_data: { error: (callError as Error)?.message },
          });
          await updateCallListItem(item.id, wsId, { status: "failed" });
          return { success: false, shouldRetry: true, finalStatus: "failed" };
        }

        // The Go make-call endpoint does not return a botnoi id; mark pending.
        await updateCallRecord(callRecordId, { status: "pending" });

        // Update debtor contact attempts
        await updateDebtor(debtor.id, wsId, {
          contact_attempts: (debtor.contact_attempts || 0) + 1,
          last_contact_at: new Date().toISOString(),
        });

        // Wait for call to complete
        const maxWaitTime = 5 * 60 * 1000;
        const pollInterval = 3000;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitTime) {
          if (stopAutoDialRef.current) return { success: false, shouldRetry: false, finalStatus: "failed" };

          await new Promise((resolve) => setTimeout(resolve, pollInterval));

          const updatedRecord = await getCallRecord(callRecordId);

          if (updatedRecord) {
            const finalStatuses = ["confirmed", "declined", "no_response", "failed", "no_answer", "completed"];
            if (finalStatuses.includes(updatedRecord.status || "")) {
              const shouldRetry = ["failed", "no_answer", "no_response"].includes(updatedRecord.status || "");
              const finalStatus = updatedRecord.status || "completed";
              // Update call list item with final status
              await updateCallListItem(item.id, wsId, {
                status: finalStatus,
                call_outcome: finalStatus,
                picked_up: ["confirmed", "declined", "no_response", "completed"].includes(finalStatus),
              });
              return { success: true, shouldRetry, finalStatus };
            }
          }
        }

        // Timeout — 5 min elapsed with no final webhook status.
        await updateCallListItem(item.id, wsId, { status: "completed" });
        return { success: true, shouldRetry: false, finalStatus: "completed" };
      } catch (error) {
        console.error("Error making call:", error);
        await updateCallListItem(item.id, wsId, { status: "failed" });
        return { success: false, shouldRetry: true, finalStatus: "failed" };
      }
    },
    [templates, workspaceId, settings.interruptible],
  );

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

    // Token check disabled for testing
    /*
    const currentTokens = userTokens ?? 0;
    if (currentTokens < 1) {
      toast.error(`You have no tokens. Please add tokens to start calling.`);
      return;
    }
    */

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
    makeCall,
    handlePreviewCall,
    previewPayload,
    showPreviewDialog,
    setShowPreviewDialog,
  };
}
