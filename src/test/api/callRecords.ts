import { api } from "./client";
import type { CallRecord } from "./types";

export interface CallRecordFilter {
  status?: string;
  workspace_id?: string;
  user_id?: string;
  botnoi_call_id?: string;
}

export async function listCallRecords(filter: CallRecordFilter = {}): Promise<CallRecord[]> {
  const res = await api.get<{ data: CallRecord[] | null }>("/call-records", {
    status: filter.status,
    workspace_id: filter.workspace_id,
    user_id: filter.user_id,
    botnoi_call_id: filter.botnoi_call_id,
  });
  return res.data ?? [];
}

export async function getCallRecord(id: string): Promise<CallRecord | null> {
  const res = await api.get<{ data: CallRecord | null }>(`/call-records/${id}`);
  return res.data ?? null;
}

export async function createCallRecord(body: Partial<CallRecord>): Promise<void> {
  await api.post("/call-records", body);
}

export async function updateCallRecord(id: string, body: Partial<CallRecord>): Promise<void> {
  await api.put(`/call-records/${id}`, body);
}

export async function deleteCallRecord(id: string): Promise<void> {
  await api.delete(`/call-records/${id}`);
}
