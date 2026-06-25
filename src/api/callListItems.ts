import { api } from "./client";
import type { CallListItem } from "./types";

export interface CallListItemFilter {
  called_at_gte?: string; // RFC3339 or YYYY-MM-DD
  statuses_in?: string[];
  statuses_not_in?: string[];
}

export async function listCallListItemsByWorkspace(
  workspaceId: string,
  filter: CallListItemFilter = {},
): Promise<CallListItem[]> {
  const res = await api.get<{ data: CallListItem[] | null }>(
    `/call-list-items/workspace/${workspaceId}`,
    {
      called_at_gte: filter.called_at_gte,
      statuses_in: filter.statuses_in?.join(","),
      statuses_not_in: filter.statuses_not_in?.join(","),
    },
  );
  return res.data ?? [];
}

export async function getCallListItem(id: string, workspaceId: string): Promise<CallListItem | null> {
  const res = await api.get<{ data: CallListItem | null }>(`/call-list-items/${id}`, {
    workspace_id: workspaceId,
  });
  return res.data ?? null;
}

export async function createCallListItem(
  body: Partial<CallListItem> & { workspace_id: string },
): Promise<void> {
  await api.post("/call-list-items", body);
}

// Convenience bulk create (the Go API has no batch endpoint; sends concurrently).
// Accepts loose objects so callers can pass extra fields the Go model ignores.
export async function createCallListItems(
  items: Array<Record<string, unknown> & { workspace_id: string }>,
): Promise<void> {
  await Promise.all(items.map((it) => api.post("/call-list-items", it)));
}

export async function updateCallListItem(
  id: string,
  workspaceId: string,
  body: Partial<CallListItem>,
): Promise<void> {
  await api.put(`/call-list-items/${id}?workspace_id=${encodeURIComponent(workspaceId)}`, body);
}

export async function deleteCallListItem(id: string, workspaceId: string): Promise<void> {
  await api.delete(`/call-list-items/${id}?workspace_id=${encodeURIComponent(workspaceId)}`);
}
