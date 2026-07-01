import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createDebtor, deleteDebtor, listDebtorsByWorkspace, updateDebtor } from "@/api/debtors";
import { createCallListItem } from "@/api/callListItems";
import { createCallRecord } from "@/api/callRecords";
import { makeCall } from "@/api/voicebot";
import { parseDebtAmountForColumn, toApiDate } from "@/lib/debtorVariables";
import { buildVariablesToSave } from "./utils";
import type { Debtor, DebtorFormData } from "./types";

interface FullTemplate {
  id: string;
  is_system_default?: boolean;
}

interface UseDebtorsMutationsArgs {
  effectiveUserId: string | null | undefined;
  workspaceId: string | undefined;
  templates: FullTemplate[];
  onAddSuccess: () => void;
  onUpdateSuccess: () => void;
  onClearAllSuccess: () => void;
  onMakeCallSettled: () => void;
  onSendToCallListSuccess: (count: number) => void;
}

export function useDebtorsMutations({
  effectiveUserId,
  workspaceId,
  templates,
  onAddSuccess,
  onUpdateSuccess,
  onClearAllSuccess,
  onMakeCallSettled,
  onSendToCallListSuccess,
}: UseDebtorsMutationsArgs) {
  const queryClient = useQueryClient();

  const createDebtorMutation = useMutation({
    mutationFn: async (data: { formData: DebtorFormData; variables: Record<string, string> }) => {
      // Use effectiveUserId for admin impersonation
      const targetUserId = effectiveUserId;
      if (!targetUserId) throw new Error("Not authenticated");
      if (!workspaceId) throw new Error("No workspace selected");

      const variablesData = buildVariablesToSave(data.variables, null, data.formData.due_date, data.formData.paid_date);
      const totalDebt = parseDebtAmountForColumn(variablesData.total_debt);

      await createDebtor({
        phone_number: data.formData.phone_number,
        status: data.formData.status,
        notes: data.formData.notes || "",
        total_debt: totalDebt,
        ...(data.formData.due_date ? { due_date: toApiDate(data.formData.due_date) } : {}),
        variables: variablesData,
        workspace_id: workspaceId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
      toast.success("Debtor added");
      onAddSuccess();
    },
    onError: (error: Error) => {
      if (error.message.includes("duplicate")) {
        toast.error("Phone number already exists");
      } else {
        toast.error("Failed to add debtor");
      }
    },
  });

  const updateDebtorMutation = useMutation({
    mutationFn: async ({
      id,
      data,
      existingVariables,
    }: {
      id: string;
      data: { formData: DebtorFormData; variables: Record<string, string> };
      existingVariables: Record<string, unknown> | null | undefined;
    }) => {
      const variablesData = buildVariablesToSave(data.variables, existingVariables, data.formData.due_date, data.formData.paid_date);
      const totalDebt = parseDebtAmountForColumn(variablesData.total_debt);

      await updateDebtor(id, workspaceId ?? "", {
        phone_number: data.formData.phone_number,
        status: data.formData.status,
        notes: data.formData.notes || "",
        total_debt: totalDebt,
        ...(data.formData.due_date ? { due_date: toApiDate(data.formData.due_date) } : {}),
        variables: variablesData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
      toast.success("Debtor updated");
      onUpdateSuccess();
    },
    onError: () => {
      toast.error("Failed to update debtor");
    },
  });

  const deleteDebtorMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDebtor(id, workspaceId ?? "");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
      toast.success("Debtor removed");
    },
    onError: () => {
      toast.error("Failed to remove debtor");
    },
  });

  const clearAllDebtorsMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("No workspace selected");
      if (!effectiveUserId) throw new Error("Not authenticated");

      // No bulk-delete endpoint; remove this user's debtors one at a time.
      const all = await listDebtorsByWorkspace(workspaceId);
      const mine = all.filter((d) => d.user_id === effectiveUserId);
      await Promise.all(mine.map((d) => deleteDebtor(d.id, workspaceId)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
      queryClient.invalidateQueries({ queryKey: ["debtors-stats"] });
      queryClient.invalidateQueries({ queryKey: ["workspace-schema"] });
      toast.success("All debtors cleared");
      onClearAllSuccess();
    },
    onError: () => {
      toast.error("Failed to clear debtors");
    },
  });

  // call_templates is not served by the Go API; no workspace template available.
  const workspaceTemplate: { id: string } | null = null;

  // Make call mutation - directly call the debtor
  const makeCallMutation = useMutation({
    mutationFn: async (debtor: Debtor) => {
      const debtorVars = {
        ...((debtor.variables || {}) as Record<string, string>),
      };

      // Create a unique client-side ID for the call record
      const callRecordId = crypto.randomUUID();

      await makeCall({ phone_number: debtor.phone_number, variables: debtorVars });

      // Create call record
      await createCallRecord({
        id: callRecordId,
        phone_number: debtor.phone_number,
        template_id: workspaceTemplate?.id ?? null,
        workspace_id: workspaceId,
        status: "pending",
      });

      return { debtor, callRecordId };
    },
    onSuccess: ({ debtor, callRecordId }) => {
      // Start polling for the call result in the background
      const maxWaitTime = 5 * 60 * 1000;
      const pollInterval = 3000;
      const startTime = Date.now();

      const pollPromise = new Promise<string>(async (resolve, reject) => {
        try {
          // Dynamic import of getCallRecord to avoid circular deps if any, or just use the API
          const { getCallRecord } = await import("@/api/callRecords");
          
          while (Date.now() - startTime < maxWaitTime) {
            await new Promise((r) => setTimeout(r, pollInterval));
            const updatedRecord = await getCallRecord(callRecordId);
            
            if (updatedRecord) {
              const finalStatuses = ["confirmed", "declined", "no_response", "failed", "no_answer", "completed"];
              if (finalStatuses.includes(updatedRecord.status || "")) {
                resolve(updatedRecord.status || "completed");
                return;
              }
            }
          }
          resolve("completed");
        } catch (err) {
          reject(err);
        }
      });

      toast.promise(pollPromise, {
        loading: `📞 Calling ${debtor.phone_number}...`,
        success: (status) => {
          queryClient.invalidateQueries({ queryKey: ["call-records"] });
          queryClient.invalidateQueries({ queryKey: ["call-stats-by-phone"] });
          onMakeCallSettled();
          
          const statusMap: Record<string, string> = {
            confirmed: "✅ Confirmed",
            declined: "❌ Declined",
            no_response: "🤐 No Response",
            no_answer: "📵 No Answer",
            failed: "⚠️ Call Failed",
            completed: "✅ Call Completed",
          };
          return statusMap[status] ?? `Call ended — ${status}`;
        },
        error: () => {
          onMakeCallSettled();
          return "⚠️ Call failed unexpectedly";
        }
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to make call");
      onMakeCallSettled();
    },
  });

  // Send selected debtors to call list
  const sendToCallListMutation = useMutation({
    mutationFn: async (debtorsToAdd: Debtor[]) => {
      const targetUserId = effectiveUserId;
      if (!targetUserId) throw new Error("Not authenticated");
      if (!workspaceId) throw new Error("No workspace selected");
      if (debtorsToAdd.length === 0) throw new Error("No debtors selected");

      // Get default template
      const defaultTemplate = templates.find((t) => !t.is_system_default) || templates[0];

      // No bulk-create endpoint; create call-list items one at a time (user bound server-side).
      await Promise.all(
        debtorsToAdd.map((debtor) =>
          createCallListItem({
            debtor_id: debtor.id,
            workspace_id: workspaceId,
            template_id: defaultTemplate?.id || "",
            status: "pending",
          }),
        ),
      );

      return debtorsToAdd.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
      toast.success(`Added ${count} debtors to Call List`);
      onSendToCallListSuccess(count);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to add to call list");
    },
  });

  return {
    createDebtorMutation,
    updateDebtorMutation,
    deleteDebtorMutation,
    clearAllDebtorsMutation,
    makeCallMutation,
    sendToCallListMutation,
  };
}
