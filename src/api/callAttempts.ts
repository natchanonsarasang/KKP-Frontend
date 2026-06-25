import { api, apiRequest } from "./client";
import type { CallAttempt } from "./types";

export interface CallAttemptFilter {
  call_list_item_id?: string;
  status?: string;
  limit?: number;
}

export async function listCallAttemptsByWorkspace(
  workspaceId: string,
  filter: CallAttemptFilter = {},
): Promise<CallAttempt[]> {
  const res = await api.get<{ data: CallAttempt[] | null }>(
    `/call-attempts/workspace/${workspaceId}`,
    { call_list_item_id: filter.call_list_item_id, status: filter.status, limit: filter.limit },
  );
  return res.data ?? [];
}

export async function getCallAttempt(id: string, workspaceId: string): Promise<CallAttempt | null> {
  const res = await api.get<{ data: CallAttempt | null }>(`/call-attempts/${id}`, {
    workspace_id: workspaceId,
  });
  return res.data ?? null;
}

export async function createCallAttempt(
  body: Partial<CallAttempt> & { workspace_id: string },
): Promise<void> {
  await api.post("/call-attempts", body);
}

export async function updateCallAttempt(
  id: string,
  workspaceId: string,
  body: Partial<CallAttempt>,
): Promise<void> {
  await api.put(`/call-attempts/${id}?workspace_id=${encodeURIComponent(workspaceId)}`, body);
}

// Bulk update: PUT /call-attempts (filter via query) -> { modified_count }
export async function updateMultipleCallAttempts(
  workspaceId: string,
  filter: { call_list_item_id?: string; status?: string },
  body: Partial<CallAttempt>,
): Promise<number> {
  const params = new URLSearchParams({ workspace_id: workspaceId });
  if (filter.call_list_item_id) params.set("call_list_item_id", filter.call_list_item_id);
  if (filter.status) params.set("status", filter.status);
  const res = await apiRequest<{ modified_count?: number }>(`/call-attempts?${params.toString()}`, {
    method: "PUT",
    body,
  });
  return res.modified_count ?? 0;
}

export async function deleteCallAttempt(id: string, workspaceId: string): Promise<void> {
  await api.delete(`/call-attempts/${id}?workspace_id=${encodeURIComponent(workspaceId)}`);
}
