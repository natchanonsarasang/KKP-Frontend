import { api } from "./client";
import type { Workspace } from "./types";

// The Go API scopes every query to the JWT user, so no owner/user filter is sent.
// Create/update/delete return only `{ message }`; callers re-fetch the list as needed.

export async function listWorkspaces(): Promise<Workspace[]> {
  const res = await api.get<{ data: Workspace[] | null }>("/workspaces");
  return res.data ?? [];
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const res = await api.get<{ data: Workspace | null }>(`/workspaces/${id}`);
  return res.data ?? null;
}

export async function createWorkspace(body: { name: string }): Promise<void> {
  await api.post("/workspaces", body);
}

export async function updateWorkspace(id: string, body: { name: string }): Promise<void> {
  await api.put(`/workspaces/${id}`, body);
}

export async function deleteWorkspace(id: string): Promise<void> {
  await api.delete(`/workspaces/${id}`);
}
