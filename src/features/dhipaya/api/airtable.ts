import { supabase } from "@/integrations/supabase/client";
import type { AirtableRecord, Customer, Policy, CallLog } from "../types";
import { CUSTOMER_FIELDS, POLICY_FIELDS, CALL_LOG_FIELDS } from "../fieldMap";
import { normalizeThaiPhone } from "../lib/phone";

type AnyFields = Record<string, unknown>;

interface ProxyRequest {
  action: "list" | "get" | "create" | "update" | "delete";
  table: string;
  recordId?: string;
  params?: Record<string, string | number | string[]>;
  fields?: AnyFields;
  records?: Array<{ id?: string; fields: AnyFields }>;
}

export interface ListResponse<F = AnyFields> {
  records: AirtableRecord<F>[];
  offset?: string;
}

async function call<T = unknown>(body: ProxyRequest): Promise<T> {
  const { data, error } = await supabase.functions.invoke("dhipaya-airtable", { body });
  if (error) throw new Error(error.message);
  if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
    throw new Error(String((data as { error: string }).error));
  }
  return data as T;
}

// -------- Customers --------
export async function listCustomers(opts?: {
  pageSize?: number;
  offset?: string;
}): Promise<{ customers: Customer[]; offset?: string }> {
  const params: Record<string, string | number> = { pageSize: opts?.pageSize ?? 50 };
  if (opts?.offset) params.offset = opts.offset;
  const res = await call<ListResponse>({ action: "list", table: "Customer", params });
  return {
    customers: res.records.map(mapCustomer),
    offset: res.offset,
  };
}

function mapCustomer(rec: AirtableRecord): Customer {
  const f = rec.fields as AnyFields;
  return {
    id: rec.id,
    firstName: str(f[CUSTOMER_FIELDS.firstName]),
    lastName: str(f[CUSTOMER_FIELDS.lastName]),
    phone1: phoneStr(field(f, CUSTOMER_FIELDS.phone1, "Phone_Number_1", "Phone Number 1", "Phone1", "Phone 1", "Phone_Number", "Phone Number")),
    phone2: phoneStr(field(f, CUSTOMER_FIELDS.phone2, "Phone_Number_2", "Phone Number 2", "Phone2", "Phone 2")),
    phone3: phoneStr(field(f, CUSTOMER_FIELDS.phone3, "Phone_Number_3", "Phone Number 3", "Phone3", "Phone 3")),
    duplicateFlag: Boolean(f[CUSTOMER_FIELDS.duplicateFlag]),
    routingGroup: str(f[CUSTOMER_FIELDS.routingGroup]),
    campaign: str(f[CUSTOMER_FIELDS.campaign]),
    consentStatus: str(f[CUSTOMER_FIELDS.consentStatus]),
    policyStatus: str(f[CUSTOMER_FIELDS.policyStatus]),
    outstandingBalance: str(f[CUSTOMER_FIELDS.outstandingBalance]),
  };
}

// -------- Policies --------
export async function listPolicies(opts?: {
  pageSize?: number;
  offset?: string;
}): Promise<{ policies: Policy[]; offset?: string }> {
  const params: Record<string, string | number> = { pageSize: opts?.pageSize ?? 50 };
  if (opts?.offset) params.offset = opts.offset;
  const res = await call<ListResponse>({ action: "list", table: "Policy", params });
  return {
    policies: res.records.map((r) => ({
      id: r.id,
      policyNumber: str(r.fields[POLICY_FIELDS.policyNumber]),
      policyStatus: str(r.fields[POLICY_FIELDS.policyStatus]),
      renewalPremium: num(r.fields[POLICY_FIELDS.renewalPremium]),
      outstanding: num(r.fields[POLICY_FIELDS.outstanding]),
      customerId: firstLinked(r.fields[POLICY_FIELDS.customer]),
    })),
    offset: res.offset,
  };
}

// -------- Call logs --------
export async function listCallLogs(opts?: {
  pageSize?: number;
  offset?: string;
}): Promise<{ logs: CallLog[]; offset?: string }> {
  const params: Record<string, string | number> = { pageSize: opts?.pageSize ?? 50 };
  if (opts?.offset) params.offset = opts.offset;
  const res = await call<ListResponse>({ action: "list", table: "Call Logs", params });
  return {
    logs: res.records.map((r) => ({
      id: r.id,
      customerId: firstLinked(r.fields[CALL_LOG_FIELDS.customer]),
      policyId: firstLinked(r.fields[CALL_LOG_FIELDS.policy]),
      outcome: str(r.fields[CALL_LOG_FIELDS.outcome]),
      duration: num(r.fields[CALL_LOG_FIELDS.duration]),
      transcript: str(r.fields[CALL_LOG_FIELDS.transcript]),
      audioUrl: str(r.fields[CALL_LOG_FIELDS.audioUrl]),
      calledAt: str(r.fields[CALL_LOG_FIELDS.calledAt]),
    })),
    offset: res.offset,
  };
}

// -------- helpers --------
function field(f: AnyFields, ...names: string[]): unknown {
  for (const name of names) {
    const value = f[name];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return undefined;
}

function phoneStr(v: unknown): string | undefined {
  const candidates = flatten(v).map((item) => String(item ?? "").trim()).filter(Boolean);
  for (const candidate of candidates) {
    const phone = normalizeThaiPhone(candidate);
    if (phone) return phone;
  }
  for (const candidate of candidates) {
    const chunks = candidate.match(/(?:\+?66|0)?\d(?:[\s().-]*\d){8,9}/g) ?? [];
    for (const chunk of chunks) {
      const phone = normalizeThaiPhone(chunk);
      if (phone) return phone;
    }
  }
  return undefined;
}

function flatten(v: unknown): unknown[] {
  if (Array.isArray(v)) return v.flatMap(flatten);
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).flatMap(flatten);
  return [v];
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  return String(v);
}
function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function firstLinked(v: unknown): string | undefined {
  if (Array.isArray(v) && v.length > 0) return String(v[0]);
  return undefined;
}
