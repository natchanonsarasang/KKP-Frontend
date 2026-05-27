import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeThaiPhone } from "./phone";
import type { Customer } from "../types";
import { CUSTOMER_FIELDS } from "../fieldMap";

export type NextIntent = "skip" | "consent" | "campaign2" | "campaign3";

const THAI_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export function formatThaiDate(input?: string | null): string {
  if (!input) return "";
  let d: Date | null = null;
  const s = String(input).trim();
  // ISO YYYY-MM-DD (Airtable default)
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, day] = iso;
    d = new Date(Number(y), Number(m) - 1, Number(day));
  } else {
    // Fallback M/D/YYYY
    const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
      const [, a, b, y] = slash;
      d = new Date(Number(y), Number(a) - 1, Number(b));
    } else {
      const parsed = new Date(s);
      if (!isNaN(parsed.getTime())) d = parsed;
    }
  }
  if (!d || isNaN(d.getTime())) return "";
  return `วัน${THAI_DAYS[d.getDay()]}ที่ ${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

export function checkConditionFlow(customer: Customer): NextIntent {
  const get = (key: keyof typeof CUSTOMER_FIELDS): string => {
    const v = (customer as unknown as Record<string, unknown>)[key];
    return (v == null ? "" : String(v)).trim().toLowerCase();
  };

  // P1: Policy status
  const policyStatus = get("policyStatus");
  if (policyStatus === "active") return "skip";
  if (policyStatus !== "overdue" && policyStatus !== "prospect") return "skip";

  // P2: Consent
  const consent = get("consentStatus");
  if (!consent) return "consent";
  if (consent === "consent denied") return "skip";
  if (consent !== "consent given") return "skip";

  // Special Condition for Policy : "prospect" and Consent: "consent given".
  if (policyStatus === "prospect" && consent === "consent given") return "campaign3";

  // P3: Notice sent
  const notice = get("noticeSent");
  if (notice === "yes") return "campaign2";
  if (notice === "no") return "campaign3";
  return "skip";
}

// Concurrency limit applied across the whole page (background-safe).
export const CONCURRENCY = 5;

export type QueueStatus = "pending" | "calling" | "success" | "failed" | "no_answer";

export interface PhoneOption {
  label: string;
  raw: string;
  phone: string;
}

export interface QueueRow {
  id: string;
  customer: Customer;
  phoneOptions: PhoneOption[];
  selectedPhone: string;
  status: QueueStatus;
  outboundId?: string;
  startedAt?: number;
  finishedAt?: number;
  errorMessage?: string;
  callOutcome?: string;
  callDuration?: number;
  conversationLog?: string | null;
  audioUrl?: string | null;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
}

// ---------- module state (persists across component mounts) ----------
let rows: QueueRow[] = [];
let isRunning = false;
let stopRequested = false;
let inFlight = 0;
let activeWorkspaceId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function getSnapshot() {
  return { rows, isRunning };
}

// ---------- helpers ----------
function buildPhoneOptions(c: Customer): PhoneOption[] {
  const candidates: Array<{ label: string; raw?: string }> = [
    { label: "Phone 1", raw: c.phone1 },
    { label: "Phone 2", raw: c.phone2 },
    { label: "Phone 3", raw: c.phone3 },
  ];
  const opts: PhoneOption[] = [];
  for (const { label, raw } of candidates) {
    if (!raw) continue;
    const phone = normalizeThaiPhone(raw);
    if (phone) opts.push({ label, raw, phone });
  }
  return opts;
}

// ---------- mutations ----------
export function addToCallQueue(customers: Customer[]): number {
  const existing = new Set(rows.map((r) => r.id));
  let added = 0;
  for (const c of customers) {
    if (existing.has(c.id)) continue;
    const phoneOptions = buildPhoneOptions(c);
    if (phoneOptions.length === 0) continue;
    rows.push({
      id: c.id,
      customer: c,
      phoneOptions,
      selectedPhone: phoneOptions[0].phone,
      status: "pending",
    });
    added++;
  }
  if (added > 0) emit();
  return added;
}

export function removeFromCallQueue(id: string) {
  const next = rows.filter((r) => r.id !== id);
  if (next.length !== rows.length) {
    rows = next;
    emit();
  }
}

export function clearCallQueue() {
  if (rows.length === 0) return;
  rows = [];
  emit();
}

export function clearCompleted() {
  const next = rows.filter((r) => r.status === "pending" || r.status === "calling");
  if (next.length !== rows.length) {
    rows = next;
    emit();
  }
}

export function updateRow(id: string, patch: Partial<QueueRow>) {
  let changed = false;
  rows = rows.map((r) => {
    if (r.id !== id) return r;
    changed = true;
    return { ...r, ...patch };
  });
  if (changed) emit();
}

export function setSelectedPhone(id: string, phone: string) {
  updateRow(id, { selectedPhone: phone });
}

export function setActiveWorkspaceId(workspaceId: string | null) {
  activeWorkspaceId = workspaceId;
}

// ---------- dialing ----------
async function dialOne(rowId: string): Promise<void> {
  const row = rows.find((r) => r.id === rowId);
  if (!row || row.status !== "pending") return;

  const nextIntent = checkConditionFlow(row.customer);
  console.log("call intent flow:", nextIntent);
  if (nextIntent === "skip") {
    updateRow(rowId, {
      status: "success",
      finishedAt: Date.now(),
      callOutcome: "Call skipped",
    });
    return;
  }

  updateRow(rowId, { status: "calling", startedAt: Date.now() });

  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    /* ignore */
  }
  const workspaceId = activeWorkspaceId;

  try {
    const fullName = [row.customer.firstName, row.customer.lastName].filter(Boolean).join(" ");
    const variables = {
      name: row.customer.firstName,
      customer_name: fullName,
      policy_no: row.customer.policyNumber || "",
      next_intent: nextIntent,
      renewal_premium: row.customer.renewalPremium,
      expiry_date: formatThaiDate(row.customer.expiryDate),
    };
    const { data: resp, error: invokeErr } = await supabase.functions.invoke("dhipaya-voicebot-make-call", {
      body: {
        phone_number: row.selectedPhone,
        variables,
        interruptible: false,
      },
    });
    if (invokeErr) throw new Error(invokeErr.message);

    const outboundId: string | undefined = (resp && typeof resp === "object" && (resp as any).outbound_id) || undefined;

    if (!outboundId) {
      updateRow(rowId, {
        status: "failed",
        finishedAt: Date.now(),
        errorMessage:
          (resp && typeof resp === "object" && (resp as any).error) || "No outbound_id returned from voicebot API",
      });
      return;
    }

    // Pre-create the tracking row so the webhook can update it by botnoi_call_id.
    if (userId) {
      await supabase.from("call_records").insert({
        botnoi_call_id: outboundId,
        phone_number: row.selectedPhone,
        status: "pending",
        user_id: userId,
        workspace_id: workspaceId,
        result_data: {
          source: "dhipaya",
          airtable_id: row.customer.id,
          name: fullName,
          policy_number: row.customer.policyNumber || null,
        } as any,
      });
    }

    updateRow(rowId, { outboundId });
    // Webhook completion handled by realtime subscription.
  } catch (e) {
    updateRow(rowId, {
      status: "failed",
      finishedAt: Date.now(),
      errorMessage: e instanceof Error ? e.message : String(e),
    });
  }
}

export function startCalling(workspaceId?: string | null): {
  dispatched: number;
} {
  if (workspaceId !== undefined) activeWorkspaceId = workspaceId;
  if (isRunning) return { dispatched: 0 };
  const pendingIds = rows.filter((r) => r.status === "pending").map((r) => r.id);
  if (pendingIds.length === 0) return { dispatched: 0 };

  isRunning = true;
  stopRequested = false;
  emit();

  let cursor = 0;
  const pump = () => {
    if (stopRequested) {
      if (inFlight === 0) {
        isRunning = false;
        stopRequested = false;
        emit();
      }
      return;
    }
    while (inFlight < CONCURRENCY && cursor < pendingIds.length) {
      const id = pendingIds[cursor++];
      const row = rows.find((r) => r.id === id);
      if (!row || row.status !== "pending") continue;
      inFlight++;
      dialOne(id).finally(() => {
        inFlight--;
        pump();
      });
    }
    if (cursor >= pendingIds.length && inFlight === 0) {
      isRunning = false;
      emit();
    }
  };
  pump();

  return { dispatched: pendingIds.length };
}

export function stopCalling() {
  if (!isRunning) return;
  stopRequested = true;
  emit();
}

// ---------- webhook reconciliation ----------
function mapDbStatusToQueueStatus(status: string | null | undefined): QueueStatus | null {
  if (!status) return null;
  switch (status) {
    case "confirmed":
    case "completed":
    case "declined":
    case "no_response":
    case "not_convenient":
      return "success";
    case "no_answer":
      return "no_answer";
    case "failed":
    case "hanged_up":
    case "busy":
    case "rejected":
    case "voicemail":
      return "failed";
    case "pending":
      return null;
    default:
      return null;
  }
}

export function applyCallRecordUpdate(record: {
  botnoi_call_id: string | null;
  status: string | null;
  result_data?: any;
  call_duration?: number | null;
  appointment_date?: string | null;
  appointment_time?: string | null;
}) {
  if (!record.botnoi_call_id) return;
  const row = rows.find((r) => r.outboundId === record.botnoi_call_id);
  if (!row || row.status !== "calling") return;
  const next = mapDbStatusToQueueStatus(record.status);
  if (!next) return;
  const rd = record.result_data || {};
  const action = rd.action || rd.status;
  updateRow(row.id, {
    status: next,
    finishedAt: Date.now(),
    callOutcome: typeof action === "string" && action ? action : record.status || undefined,
    callDuration: record.call_duration ?? undefined,
    conversationLog: rd.conversation_log ?? null,
    audioUrl: rd.audio_url ?? null,
    appointmentDate: record.appointment_date ?? null,
    appointmentTime: record.appointment_time ?? null,
  });
}

export async function reconcileCallingRows() {
  const outboundIds = rows.filter((r) => r.status === "calling" && r.outboundId).map((r) => r.outboundId!) as string[];
  if (outboundIds.length === 0) return;
  const { data } = await supabase
    .from("call_records")
    .select("botnoi_call_id, status, result_data, call_duration, appointment_date, appointment_time")
    .in("botnoi_call_id", outboundIds);
  if (!data) return;
  for (const rec of data) applyCallRecordUpdate(rec as any);
}

// ---------- React hooks ----------
function useStore<T>(selector: (snap: ReturnType<typeof getSnapshot>) => T): T {
  const [value, setValue] = useState<T>(() => selector(getSnapshot()));
  useEffect(() => {
    const update = () => setValue(selector(getSnapshot()));
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

export function useQueueRows(): QueueRow[] {
  return useStore((s) => s.rows);
}

export function useIsCalling(): boolean {
  return useStore((s) => s.isRunning);
}

// Back-compat with CustomersList (returns Customer[] for "in queue" badge).
export function useCallQueue(): Customer[] {
  const r = useQueueRows();
  return r.map((row) => row.customer);
}
