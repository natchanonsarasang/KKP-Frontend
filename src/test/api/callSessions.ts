import { api } from "./client";
import type { CallSession } from "./types";

export interface CallSessionFilter {
  status?: string;
  workspace_id?: string;
  user_id?: string;
}

export async function listCallSessions(filter: CallSessionFilter = {}): Promise<CallSession[]> {
  const res = await api.get<{ data: CallSession[] | null }>("/call-sessions", {
    status: filter.status,
    workspace_id: filter.workspace_id,
    user_id: filter.user_id,
  });
  return res.data ?? [];
}

export async function getCallSession(id: string): Promise<CallSession | null> {
  const res = await api.get<{ data: CallSession | null }>(`/call-sessions/${id}`);
  return res.data ?? null;
}

export async function createCallSession(body: Partial<CallSession>): Promise<void> {
  await api.post("/call-sessions", body);
}

export async function updateCallSession(id: string, body: Partial<CallSession>): Promise<void> {
  await api.put(`/call-sessions/${id}`, body);
}

export async function deleteCallSession(id: string): Promise<void> {
  await api.delete(`/call-sessions/${id}`);
}
