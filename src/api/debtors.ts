import { api } from "./client";
import type { Debtor } from "./types";

export async function listDebtorsByWorkspace(workspaceId: string): Promise<Debtor[]> {
  const res = await api.get<{ data: Debtor[] | null }>(`/debtors/workspace/${workspaceId}`);
  return res.data ?? [];
}

export async function getDebtor(id: string, workspaceId: string): Promise<Debtor | null> {
  const res = await api.get<{ data: Debtor | null }>(`/debtors/${id}`, { workspace_id: workspaceId });
  return res.data ?? null;
}

export async function createDebtor(body: Partial<Debtor> & { workspace_id: string }): Promise<void> {
  await api.post("/debtors", body);
}

export async function updateDebtor(
  id: string,
  workspaceId: string,
  body: Partial<Debtor>,
): Promise<void> {
  await api.put(`/debtors/${id}?workspace_id=${encodeURIComponent(workspaceId)}`, body);
}

export async function deleteDebtor(id: string, workspaceId: string): Promise<void> {
  await api.delete(`/debtors/${id}?workspace_id=${encodeURIComponent(workspaceId)}`);
}
