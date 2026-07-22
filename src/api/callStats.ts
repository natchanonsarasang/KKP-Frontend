import { api } from "./client";

export interface DebtorCallStats {
  total: number;
  confirmed: number;
  declined: number;
  no_response: number;
  picked_up: number;
  not_picked_up: number;
}

// Per-debtor call summary computed server-side from call_records, keyed by
// debtor id. Replaces pulling every call_record to the browser and counting
// client-side (which didn't scale and drifted from the source of truth).
export async function getCallStatsByDebtor(
  workspaceId: string,
): Promise<Record<string, DebtorCallStats>> {
  const res = await api.get<{ data: Record<string, DebtorCallStats> | null }>(
    "/call-stats/by-debtor",
    { workspace_id: workspaceId },
  );
  return res.data ?? {};
}
