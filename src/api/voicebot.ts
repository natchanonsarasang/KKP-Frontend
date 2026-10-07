import { api } from "./client";

// POST /api/v1/call-process -> { message }
export async function processCallSession(body: Record<string, unknown>): Promise<void> {
  await api.post("/call-process", body);
}
