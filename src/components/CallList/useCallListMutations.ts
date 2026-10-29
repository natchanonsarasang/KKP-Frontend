import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createCallListItems, deleteCallListItem } from "@/api/callListItems";
import { listCallAttemptsByWorkspace, deleteCallAttempt } from "@/api/callAttempts";
import { deleteCallRecord } from "@/api/callRecords";
import type { FilterConditions } from "@/components/DebtorFilterPanel";
import { debtorMatchesStatusFilter, getDebtorDebt } from "./utils";
import { COMPLETED_STATUSES } from "./constants";
import type { CallListItem, Debtor, Template } from "./types";
import type { PhoneStats } from "./useCallListQueries";

interface UseCallListMutationsArgs {
  effectiveUserId: string | null | undefined;
  workspaceId: string | undefined;
  callListItems: CallListItem[] | undefined;
  allActiveDebtors: Debtor[] | undefined;
  phoneStats: PhoneStats | undefined;
  selectedTemplateId: string;
  templates: Template[];
  selectedDebtors: string[];
  scheduledTime: string;
  onAddToListSuccess: () => void;
  onQueueFilteredSuccess: () => void;
}

function pickDefaultTemplate(templates: Template[], selectedTemplateId: string) {
  const preferredTemplate = selectedTemplateId ? templates?.find((t) => t.id === selectedTemplateId) : undefined;
  return (
    preferredTemplate ||
    templates?.find((t) => !t.is_system_default) ||
    templates?.find((t) => t.is_system_default) ||
    templates?.[0]
  );
}

// All write operations on the call queue: queueing (all/uncalled/filtered),
// adding/removing individual items, clearing the queue, and retrying failures.
export function useCallListMutations({
  effectiveUserId,
  workspaceId,
  callListItems,
  allActiveDebtors,
  phoneStats,
  selectedTemplateId,
  templates,
  selectedDebtors,
  scheduledTime,
  onAddToListSuccess,
  onQueueFilteredSuccess,
}: UseCallListMutationsArgs) {
  const queryClient = useQueryClient();

  const queuedDebtorIds = new Set(
    (callListItems || [])
      .filter((item) => ["pending", "retry_pending", "calling"].includes(item.status))
      .map((item) => item.debtor_id),
  );

  // Queue all active debtors mutation
  // NOTE: Daily limit applies to CALLING, not QUEUEING. We allow queueing all, then startCalling will respect daily limit.
  const queueAllDebtorsMutation = useMutation({
    mutationFn: async () => {
      const targetUserId = effectiveUserId;
      if (!targetUserId) throw new Error("Not authenticated");
      if (!workspaceId) throw new Error("No workspace selected");

      const debtorsToQueue = (allActiveDebtors || []).filter((d) => !queuedDebtorIds.has(d.id));

      if (debtorsToQueue.length === 0) {
        throw new Error("No new debtors to queue");
      }

      const defaultTemplate = pickDefaultTemplate(templates, selectedTemplateId);

      // Insert in chunks to avoid request size limits
      const chunkSize = 500;
      let inserted = 0;

      for (let i = 0; i < debtorsToQueue.length; i += chunkSize) {
        const chunk = debtorsToQueue.slice(i, i + chunkSize);
        const items = chunk.map((debtor) => ({
          debtor_id: debtor.id,
          user_id: targetUserId,
          workspace_id: workspaceId,
          template_id: defaultTemplate?.id || null,
          status: "pending",
          phone_number: debtor.phone_number,
        }));

        await createCallListItems(items);
        inserted += items.length;
      }

      return inserted;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      queryClient.invalidateQueries({ queryKey: ["available-debtors-for-call"] });
      toast.success(`Queued ${count} debtors for calling`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Queue only uncalled debtors (those with 0 calls)
  const queueUncalledDebtorsMutation = useMutation({
    mutationFn: async () => {
      const targetUserId = effectiveUserId;
      if (!targetUserId) throw new Error("Not authenticated");
      if (!workspaceId) throw new Error("No workspace selected");

      // Filter to only debtors with 0 calls
      const debtorsToQueue = (allActiveDebtors || []).filter((d) => {
        if (queuedDebtorIds.has(d.id)) return false;
        const stats = phoneStats?.[d.phone_number];
        const totalCalls = (stats?.picked_up ?? 0) + (stats?.not_picked_up ?? 0);
        return totalCalls === 0;
      });

      if (debtorsToQueue.length === 0) {
        throw new Error("No uncalled debtors to queue");
      }

      const defaultTemplate = pickDefaultTemplate(templates, selectedTemplateId);

      // Insert in chunks to avoid request size limits
      const chunkSize = 500;
      let inserted = 0;

      for (let i = 0; i < debtorsToQueue.length; i += chunkSize) {
        const chunk = debtorsToQueue.slice(i, i + chunkSize);
        const items = chunk.map((debtor) => ({
          debtor_id: debtor.id,
          user_id: targetUserId,
          workspace_id: workspaceId,
          template_id: defaultTemplate?.id || null,
          status: "pending",
          phone_number: debtor.phone_number,
        }));

        await createCallListItems(items);
        inserted += items.length;
      }

      return inserted;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      queryClient.invalidateQueries({ queryKey: ["available-debtors-for-call"] });
      toast.success(`Queued ${count} uncalled debtors`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Add debtors to call list
  const addToListMutation = useMutation({
    mutationFn: async () => {
      const targetUserId = effectiveUserId;
      if (!targetUserId) throw new Error("Not authenticated");
      if (!workspaceId) throw new Error("No workspace selected");

      const items = selectedDebtors.map((debtorId) => ({
        debtor_id: debtorId,
        user_id: targetUserId,
        workspace_id: workspaceId,
        template_id: selectedTemplateId || null,
        scheduled_at: scheduledTime ? new Date(scheduledTime).toISOString() : null,
        status: "pending",
      }));

      await createCallListItems(items);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      queryClient.invalidateQueries({ queryKey: ["available-debtors-for-call"] });
      toast.success(`Added ${selectedDebtors.length} contacts to call list`);
      onAddToListSuccess();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to add to call list");
    },
  });

  // Remove from call list
  const removeFromListMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteCallListItem(id, workspaceId ?? "");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      queryClient.invalidateQueries({ queryKey: ["available-debtors-for-call"] });
      toast.success("Removed from call list");
    },
    onError: () => {
      toast.error("Failed to remove");
    },
  });

  // Clear pending items only
  const clearPendingMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("No workspace selected");
      const ids = (callListItems || []).filter((i) => i.status === "pending").map((i) => i.id);
      await Promise.all(ids.map((id) => deleteCallListItem(id, workspaceId)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      queryClient.invalidateQueries({ queryKey: ["available-debtors-for-call"] });
      queryClient.invalidateQueries({ queryKey: ["all-active-debtors"] });
      toast.success("Cleared pending calls");
    },
  });

  // Clear completed items (explicit user action to wipe history rows)
  const clearCompletedMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("No workspace selected");
      const done = COMPLETED_STATUSES as readonly string[];
      const ids = (callListItems || []).filter((i) => done.includes(i.status)).map((i) => i.id);
      if (ids.length === 0) return;
      const idSet = new Set(ids);

      // Delete the queue items FIRST — this is the user-visible "Clear Completed"
      // action and must never be blocked by the history cleanup below. Use
      // allSettled so one bad row doesn't abort the rest, then report failures.
      const itemResults = await Promise.allSettled(ids.map((id) => deleteCallListItem(id, workspaceId)));
      const itemFailures = itemResults.filter((r) => r.status === "rejected").length;

      // Best-effort cascade: the Analytics "Recent Calls" history is sourced from
      // call_attempts (and their call_records), so clear those tied to the removed
      // items too, else they linger as orphaned rows with a "-" debtor. These are
      // tolerant of individual failures — a record already gone or owned by another
      // user returns 400 (DeleteByUser → ErrNoDocuments) and must not undo the clear.
      try {
        const attempts = await listCallAttemptsByWorkspace(workspaceId);
        const relatedAttempts = attempts.filter((a) => a.call_list_item_id && idSet.has(a.call_list_item_id));
        const recordIds = new Set(relatedAttempts.map((a) => a.call_record_id).filter((rid): rid is string => !!rid));

        await Promise.allSettled(relatedAttempts.map((a) => deleteCallAttempt(a.id, workspaceId)));
        await Promise.allSettled([...recordIds].map((rid) => deleteCallRecord(rid)));
      } catch {
        // Listing attempts failed — the queue items are already cleared; history
        // cleanup will catch up on the next clear. Don't fail the whole action.
      }

      if (itemFailures > 0) {
        throw new Error(
          `Cleared ${ids.length - itemFailures} of ${ids.length} — ${itemFailures} could not be removed`,
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      queryClient.invalidateQueries({ queryKey: ["available-debtors-for-call"] });
      queryClient.invalidateQueries({ queryKey: ["debtor-latest-call-status"] });
      // Refresh the Analytics history queries so cleared rows disappear at once.
      queryClient.invalidateQueries({ queryKey: ["call-attempts-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["call-records"] });
      toast.success("Cleared completed calls");
    },
    onError: (error: Error) => {
      // Surface failures instead of silently swallowing them (the old behavior,
      // which is why clicking Clear Completed looked like it did nothing).
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      toast.error(error.message || "Failed to clear completed calls");
    },
  });

  // Queue failed calls for retry - create NEW items so failed records stay visible
  const retryFailedMutation = useMutation({
    mutationFn: async () => {
      const failedItems =
        callListItems?.filter((item) => ["failed", "no_answer", "no_response"].includes(item.status)) || [];

      if (failedItems.length === 0) {
        throw new Error("No failed calls to retry");
      }

      // Create new pending items based on the failed ones
      const newItems = failedItems.map((item) => ({
        debtor_id: item.debtor_id,
        user_id: item.user_id,
        template_id: item.template_id,
        workspace_id: workspaceId,
        status: "pending" as string,
        notes: `Retry of failed call`,
      }));

      await createCallListItems(
        newItems.map((it) => ({ ...it, workspace_id: workspaceId ?? "" })),
      );
      return failedItems.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      toast.success(`Created ${count} new retry calls`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Queue filtered debtors mutation
  const queueFilteredDebtorsMutation = useMutation({
    mutationFn: async (conditions: FilterConditions) => {
      const targetUserId = effectiveUserId;
      if (!targetUserId) throw new Error("Not authenticated");
      if (!workspaceId) throw new Error("No workspace selected");

      // Filter debtors based on conditions
      let filteredDebtors = (allActiveDebtors || []).filter((d) => {
        if (queuedDebtorIds.has(d.id)) return false;

        // Apply debt filters
        const debtValue = getDebtorDebt(d);
        if (conditions.minDebt !== undefined && debtValue < conditions.minDebt) return false;
        if (conditions.maxDebt !== undefined && debtValue > conditions.maxDebt) return false;

        // Get counts from call_records stats (same as DebtorsList UI displays)
        const debtorStats = phoneStats?.[d.phone_number];
        const pickedUp = debtorStats?.picked_up ?? 0;
        const notPickedUp = debtorStats?.not_picked_up ?? 0;
        const accepted = debtorStats?.confirmed ?? 0;
        const rejected = debtorStats?.declined ?? 0;

        if (conditions.minPickedUp !== undefined && pickedUp < conditions.minPickedUp) return false;
        if (conditions.maxPickedUp !== undefined && pickedUp > conditions.maxPickedUp) return false;
        if (conditions.minNotPickedUp !== undefined && notPickedUp < conditions.minNotPickedUp) return false;
        if (conditions.maxNotPickedUp !== undefined && notPickedUp > conditions.maxNotPickedUp) return false;
        if (conditions.minAccepted !== undefined && accepted < conditions.minAccepted) return false;
        if (conditions.maxAccepted !== undefined && accepted > conditions.maxAccepted) return false;
        if (conditions.minRejected !== undefined && rejected < conditions.minRejected) return false;
        if (conditions.maxRejected !== undefined && rejected > conditions.maxRejected) return false;
        if (conditions.status && !debtorMatchesStatusFilter(d, conditions.status)) return false;

        return true;
      });

      if (filteredDebtors.length === 0) {
        throw new Error("No debtors match the filter criteria");
      }

      // If maxDebtors is set and we have more debtors than the limit, randomly pick
      if (conditions.maxDebtors !== undefined && filteredDebtors.length > conditions.maxDebtors) {
        // Fisher-Yates shuffle and take first maxDebtors
        const shuffled = [...filteredDebtors];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        filteredDebtors = shuffled.slice(0, conditions.maxDebtors);
      }

      const defaultTemplate = pickDefaultTemplate(templates, selectedTemplateId);

      // Insert in chunks
      const chunkSize = 500;
      let inserted = 0;

      for (let i = 0; i < filteredDebtors.length; i += chunkSize) {
        const chunk = filteredDebtors.slice(i, i + chunkSize);
        const items = chunk.map((debtor) => ({
          debtor_id: debtor.id,
          user_id: targetUserId,
          workspace_id: workspaceId,
          template_id: defaultTemplate?.id || null,
          status: "pending",
          phone_number: debtor.phone_number,
        }));

        await createCallListItems(items);
        inserted += items.length;
      }

      return inserted;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      queryClient.invalidateQueries({ queryKey: ["available-debtors-for-call"] });
      onQueueFilteredSuccess();
      toast.success(`Queued ${count} filtered debtors for calling`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return {
    queuedDebtorIds,
    queueAllDebtorsMutation,
    queueUncalledDebtorsMutation,
    addToListMutation,
    removeFromListMutation,
    clearPendingMutation,
    clearCompletedMutation,
    retryFailedMutation,
    queueFilteredDebtorsMutation,
  };
}
