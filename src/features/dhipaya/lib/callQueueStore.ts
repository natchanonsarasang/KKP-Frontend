import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeThaiPhone } from "./phone";
import type { Customer } from "../types";

// Concurrency limit applied across the whole page (mirrored in process-call-session settings).
export const CONCURRENCY = 5;

export type QueueStatus = "pending" | "calling" | "success" | "failed" | "no_answer";

export interface PhoneOption {
  label: string;
  raw: string;
  phone: string;
}

export interface QueueRow {
  id: string; // call_list_items.id
  debtorId: string;
  customer: Customer;
  phoneOptions: PhoneOption[];
  selectedPhone: string;
  status: QueueStatus;
  rawStatus?: string;
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

// Shared Dhipaya workspace — every authenticated user is a member (see migration).
export const DHIPAYA_WORKSPACE_ID = "d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1";

// ---------- module state ----------
let activeWorkspaceId: string | null = DHIPAYA_WORKSPACE_ID;
let activeUserId: string | null = null;
let rows: QueueRow[] = [];
let sessionRunning = false;
let activeSessionId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

// ---------- helpers ----------
function buildPhoneOptionsFromVariables(
  vars: Record<string, unknown> | null | undefined,
): PhoneOption[] {
  const v = vars || {};
  const candidates: Array<{ label: string; raw?: string }> = [
    { label: "Phone 1", raw: (v as any).phone1 as string | undefined },
    { label: "Phone 2", raw: (v as any).phone2 as string | undefined },
    { label: "Phone 3", raw: (v as any).phone3 as string | undefined },
  ];
  const opts: PhoneOption[] = [];
  for (const { label, raw } of candidates) {
    if (!raw) continue;
    const phone = normalizeThaiPhone(raw);
    if (phone) opts.push({ label, raw, phone });
  }
  return opts;
}

function buildPhoneOptionsFromCustomer(c: Customer): PhoneOption[] {
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

function mapDbStatus(s: string | null | undefined): QueueStatus {
  switch (s) {
    case "calling":
      return "calling";
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
    case "pending_retry":
    case "retry_pending":
    default:
      return "pending";
  }
}

// ---------- workspace setter ----------
export function setActiveWorkspaceId(workspaceId: string | null) {
  if (activeWorkspaceId === workspaceId) return;
  activeWorkspaceId = workspaceId;
  rows = [];
  emit();
  void refreshFromDb();
  setupRealtime();
}

let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
function setupRealtime() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  if (!activeWorkspaceId) return;
  realtimeChannel = supabase
    .channel(`dhipaya-queue-${activeWorkspaceId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "call_list_items",
        filter: `workspace_id=eq.${activeWorkspaceId}`,
      },
      () => void refreshFromDb(),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "call_records",
        filter: `workspace_id=eq.${activeWorkspaceId}`,
      },
      () => void refreshFromDb(),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "call_sessions",
        filter: `workspace_id=eq.${activeWorkspaceId}`,
      },
      () => void refreshSessionState(),
    )
    .subscribe();
}

async function getUserId(): Promise<string | null> {
  if (activeUserId) return activeUserId;
  const { data } = await supabase.auth.getUser();
  activeUserId = data.user?.id ?? null;
  return activeUserId;
}

// ---------- DB sync ----------
export async function refreshFromDb() {
  if (!activeWorkspaceId) {
    rows = [];
    emit();
    return;
  }
  const userId = await getUserId();
  if (!userId) return;

  // Fetch call_list_items for this workspace (Dhipaya items are tagged via debtors.variables.source='dhipaya')
  const { data: items } = await supabase
    .from("call_list_items")
    .select("id, debtor_id, status, phone_number, call_record_id, created_at, updated_at, called_at")
    .eq("workspace_id", activeWorkspaceId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (!items || items.length === 0) {
    rows = [];
    emit();
    return;
  }

  const debtorIds = Array.from(new Set(items.map((i) => i.debtor_id)));
  const { data: debtors } = await supabase
    .from("debtors")
    .select("id, phone_number, name, last_name, variables")
    .in("id", debtorIds);
  const debtorMap = new Map((debtors || []).map((d) => [d.id, d]));

  // Only keep items whose debtor was created by Dhipaya
  const dhipayaItems = items.filter((it) => {
    const d = debtorMap.get(it.debtor_id) as any;
    return d?.variables?.source === "dhipaya";
  });

  const recordIds = dhipayaItems.map((i) => i.call_record_id).filter(Boolean) as string[];
  const recordMap = new Map<string, any>();
  if (recordIds.length > 0) {
    const { data: recs } = await supabase
      .from("call_records")
      .select(
        "id, botnoi_call_id, status, call_duration, appointment_date, appointment_time, result_data",
      )
      .in("id", recordIds);
    for (const r of recs || []) recordMap.set(r.id, r);
  }

  rows = dhipayaItems.map((it) => {
    const d = debtorMap.get(it.debtor_id) as any;
    const vars = (d?.variables || {}) as Record<string, unknown>;
    const customer: Customer = {
      id: (vars.airtable_id as string) || it.debtor_id,
      firstName: (vars.firstName as string) || d?.name || "",
      lastName: (vars.lastName as string) || d?.last_name || "",
      phone1: vars.phone1 as string | undefined,
      phone2: vars.phone2 as string | undefined,
      phone3: vars.phone3 as string | undefined,
      policyNumber: vars.policy_no as string | undefined,
      consentStatus: vars.consent_status as string | undefined,
    };
    const phoneOptions = buildPhoneOptionsFromVariables(vars);
    const rec = it.call_record_id ? recordMap.get(it.call_record_id) : null;
    const rd = (rec?.result_data || {}) as any;
    return {
      id: it.id,
      debtorId: it.debtor_id,
      customer,
      phoneOptions: phoneOptions.length > 0
        ? phoneOptions
        : [{ label: "Phone", raw: it.phone_number || d?.phone_number || "", phone: it.phone_number || d?.phone_number || "" }],
      selectedPhone: it.phone_number || d?.phone_number || "",
      status: mapDbStatus(it.status),
      rawStatus: it.status || undefined,
      outboundId: rec?.botnoi_call_id || undefined,
      startedAt: it.called_at ? new Date(it.called_at).getTime() : undefined,
      finishedAt: rec ? new Date(rec.updated_at || rec.created_at || Date.now()).getTime() : undefined,
      callOutcome: rd.action || rd.status || rec?.status || undefined,
      callDuration: rec?.call_duration ?? undefined,
      conversationLog: rd.conversation_log ?? null,
      audioUrl: rd.audio_url ?? null,
      appointmentDate: rec?.appointment_date ?? null,
      appointmentTime: rec?.appointment_time ?? null,
    } as QueueRow;
  });
  emit();
}

async function refreshSessionState() {
  if (!activeWorkspaceId) {
    sessionRunning = false;
    activeSessionId = null;
    emit();
    return;
  }
  const userId = await getUserId();
  if (!userId) return;
  const { data } = await supabase
    .from("call_sessions")
    .select("id, status")
    .eq("workspace_id", activeWorkspaceId)
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const wasRunning = sessionRunning;
  const prevId = activeSessionId;
  sessionRunning = data?.status === "running";
  activeSessionId = data?.id ?? null;
  if (wasRunning !== sessionRunning || prevId !== activeSessionId) emit();
}

// ---------- mutations ----------
export async function addToCallQueue(customers: Customer[]): Promise<number> {
  if (!activeWorkspaceId) {
    return 0;
  }
  const userId = await getUserId();
  if (!userId) return 0;

  let added = 0;
  for (const c of customers) {
    const opts = buildPhoneOptionsFromCustomer(c);
    if (opts.length === 0) continue;
    const selectedPhone = opts[0].phone;
    const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown";

    // Always insert a new debtor row — duplicates allowed by design.
    const { data: debtorRow, error: debtorErr } = await supabase
      .from("debtors")
      .insert({
        user_id: userId,
        workspace_id: activeWorkspaceId,
        phone_number: selectedPhone,
        name: c.firstName || fullName,
        last_name: c.lastName || null,
        status: "active",
        variables: {
          source: "dhipaya",
          airtable_id: c.id,
          firstName: c.firstName || "",
          lastName: c.lastName || "",
          customer_name: fullName,
          name: c.firstName || fullName,
          policy_no: c.policyNumber || "",
          consent_status: c.consentStatus || "",
          next_intent: c.consentStatus === "Consent Given" ? "check_policy" : "consent",
          phone1: c.phone1 || "",
          phone2: c.phone2 || "",
          phone3: c.phone3 || "",
        },
      })
      .select("id")
      .single();
    if (debtorErr || !debtorRow) continue;

    const { error: itemErr } = await supabase.from("call_list_items").insert({
      user_id: userId,
      workspace_id: activeWorkspaceId,
      debtor_id: debtorRow.id,
      phone_number: selectedPhone,
      status: "pending",
    });
    if (!itemErr) added++;
  }

  if (added > 0) await refreshFromDb();
  return added;
}

export async function removeFromCallQueue(itemId: string) {
  const row = rows.find((r) => r.id === itemId);
  await supabase.from("call_list_items").delete().eq("id", itemId);
  if (row) {
    // Remove the orphaned debtor row created for this queue item.
    await supabase.from("debtors").delete().eq("id", row.debtorId);
  }
  await refreshFromDb();
}

export async function clearCallQueue() {
  if (!activeWorkspaceId) return;
  const userId = await getUserId();
  if (!userId) return;
  const debtorIds = rows.map((r) => r.debtorId);
  const itemIds = rows.map((r) => r.id);
  if (itemIds.length === 0) return;
  await supabase.from("call_list_items").delete().in("id", itemIds);
  if (debtorIds.length > 0) {
    await supabase.from("debtors").delete().in("id", debtorIds);
  }
  await refreshFromDb();
}

export async function clearCompleted() {
  const finished = rows.filter(
    (r) => r.status === "success" || r.status === "failed" || r.status === "no_answer",
  );
  if (finished.length === 0) return;
  const itemIds = finished.map((r) => r.id);
  const debtorIds = finished.map((r) => r.debtorId);
  await supabase.from("call_list_items").delete().in("id", itemIds);
  await supabase.from("debtors").delete().in("id", debtorIds);
  await refreshFromDb();
}

export async function setSelectedPhone(itemId: string, phone: string) {
  const row = rows.find((r) => r.id === itemId);
  if (!row) return;
  // Optimistic local update
  rows = rows.map((r) => (r.id === itemId ? { ...r, selectedPhone: phone } : r));
  emit();
  await supabase.from("call_list_items").update({ phone_number: phone }).eq("id", itemId);
  await supabase.from("debtors").update({ phone_number: phone }).eq("id", row.debtorId);
}

// ---------- session control ----------
export async function startCalling(
  workspaceId?: string | null,
): Promise<{ dispatched: number }> {
  if (workspaceId !== undefined) activeWorkspaceId = workspaceId;
  if (!activeWorkspaceId) return { dispatched: 0 };
  const userId = await getUserId();
  if (!userId) return { dispatched: 0 };

  const pendingCount = rows.filter((r) => r.status === "pending").length;
  if (pendingCount === 0) return { dispatched: 0 };

  // Reuse an existing running/paused session for this workspace if present; otherwise create one.
  const { data: existing } = await supabase
    .from("call_sessions")
    .select("id, status")
    .eq("workspace_id", activeWorkspaceId)
    .eq("user_id", userId)
    .in("status", ["running", "paused"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let sessionId = existing?.id as string | undefined;
  if (sessionId) {
    await supabase
      .from("call_sessions")
      .update({ status: "running", error_message: null })
      .eq("id", sessionId);
  } else {
    const { data: created, error: createErr } = await supabase
      .from("call_sessions")
      .insert({
        user_id: userId,
        workspace_id: activeWorkspaceId,
        status: "running",
        total_calls: pendingCount,
        settings: {
          maxRetries: 2,
          delayBetweenCalls: 0,
          concurrentCalls: CONCURRENCY,
          businessHoursOnly: false,
          businessHoursStart: "00:00",
          businessHoursEnd: "23:59",
          businessDays: [0, 1, 2, 3, 4, 5, 6],
          testMode: false,
          interruptible: false,
        },
      })
      .select("id")
      .single();
    if (createErr || !created) return { dispatched: 0 };
    sessionId = created.id as string;
  }

  activeSessionId = sessionId;
  sessionRunning = true;
  emit();

  // Fire & forget — process-call-session continues in the background even after refresh.
  void supabase.functions
    .invoke("process-call-session", { body: { session_id: sessionId } })
    .catch((e) => console.warn("[dhipaya] process-call-session invoke failed", e));

  return { dispatched: pendingCount };
}

export async function stopCalling() {
  if (!activeSessionId) return;
  await supabase
    .from("call_sessions")
    .update({ status: "paused", error_message: "Paused by user" })
    .eq("id", activeSessionId);
  sessionRunning = false;
  emit();
}

// ---------- React hooks ----------
function useStore<T>(selector: () => T): T {
  const [value, setValue] = useState<T>(() => selector());
  useEffect(() => {
    const update = () => setValue(selector());
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
  return useStore(() => rows);
}

export function useIsCalling(): boolean {
  return useStore(() => sessionRunning);
}

// Back-compat for CustomersList "in queue" badge.
export function useCallQueue(): Customer[] {
  const r = useQueueRows();
  return r.map((row) => row.customer);
}

// Back-compat shims (no-ops; updates now come from realtime).
export function reconcileCallingRows() {
  void refreshFromDb();
  void refreshSessionState();
}

export function applyCallRecordUpdate(_record: unknown) {
  void refreshFromDb();
}
