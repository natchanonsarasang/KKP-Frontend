import { api } from "./client";

export interface MakeCallRequest {
  phone_number: string;
  variables?: Record<string, unknown>;
  interruptible?: boolean;
  next_intent?: string;
  outbound_id?: string;
  event_id?: string;
  bot_type?: string;
}

// POST /api/v1/voicebot/make-call -> { message }
export async function makeCall(body: MakeCallRequest): Promise<void> {
  console.log("[makeCall] → POST /voicebot/make-call", JSON.stringify(body, null, 2));
  // Fire-and-forget copy to the Vercel serverless function so the payload also
  // shows up in the Vercel dashboard logs (client console.log never reaches Vercel).
  void fetch("/api/log-call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
  await api.post("/voicebot/make-call", body);
}

// POST /api/v1/call-process -> { message }
export async function processCallSession(body: Record<string, unknown>): Promise<void> {
  await api.post("/call-process", body);
}
