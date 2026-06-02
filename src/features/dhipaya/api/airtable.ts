import { supabase } from "@/integrations/supabase/client";
import type { AirtableRecord, Customer, Policy, CallLog, InstallmentKb } from "../types";
import { CUSTOMER_FIELDS, POLICY_FIELDS, CALL_LOG_FIELDS, CONSENT_FIELDS, INSTALLMENT_KB_FIELDS } from "../fieldMap";

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

export async function updateCustomer(
  recordId: string,
  patch: Partial<Pick<Customer, "firstName" | "lastName" | "phone1">>,
): Promise<Customer> {
  const fields: AnyFields = {};
  if (patch.firstName !== undefined) fields[CUSTOMER_FIELDS.firstName] = patch.firstName;
  if (patch.lastName !== undefined) fields[CUSTOMER_FIELDS.lastName] = patch.lastName;
  if (patch.phone1 !== undefined) fields[CUSTOMER_FIELDS.phone1] = patch.phone1;
  if (Object.keys(fields).length === 0) {
    // Nothing to patch on Customer; just return the existing record.
    const rec = await call<AirtableRecord>({ action: "get", table: "Customer", recordId });
    return mapCustomer(rec);
  }
  const rec = await call<AirtableRecord>({
    action: "update",
    table: "Customer",
    recordId,
    fields,
  });
  return mapCustomer(rec);
}

/**
 * Update the linked Consents record for a customer.
 * Consent is a separate Airtable table joined via a linked-record field
 * (`Customer`). We cannot write directly to the lookup column on Customer.
 * If a Consents row already exists for the customer it is patched; otherwise
 * a new row is created and linked.
 */
export async function setCustomerConsent(customerId: number, consentStatus: string): Promise<void> {
  // Find an existing Consents row by Customer_ID (numeric foreign key).
  const formula = `{${CONSENT_FIELDS.customer}} = ${customerId}`;
  const found = await call<ListResponse>({
    action: "list",
    table: "Consents",
    params: { filterByFormula: formula, maxRecords: 1 },
  });

  const existing = found.records?.[0];
  const fields: AnyFields = {
    [CONSENT_FIELDS.consentStatus]: consentStatus || "",
  };

  if (existing) {
    await call({
      action: "update",
      table: "Consents",
      recordId: existing.id,
      fields,
    });
  } else {
    await call({
      action: "create",
      table: "Consents",
      fields: {
        ...fields,
        [CONSENT_FIELDS.customer]: customerId,
      },
    });
  }
}

export async function deleteCustomer(recordId: string): Promise<void> {
  await call({ action: "delete", table: "Customer", recordId });
}

function mapCustomer(rec: AirtableRecord): Customer {
  const f = rec.fields as AnyFields;
  console.log("Customer Record Fields:", f);
  return {
    id: rec.id,
    customerId:
      typeof f[CUSTOMER_FIELDS.customerId] === "number"
        ? (f[CUSTOMER_FIELDS.customerId] as number)
        : f[CUSTOMER_FIELDS.customerId] != null
          ? Number(f[CUSTOMER_FIELDS.customerId])
          : undefined,
    firstName: str(f[CUSTOMER_FIELDS.firstName]),
    lastName: str(f[CUSTOMER_FIELDS.lastName]),
    phone1: str(f[CUSTOMER_FIELDS.phone1]),
    phone2: str(f[CUSTOMER_FIELDS.phone2]),
    phone3: str(f[CUSTOMER_FIELDS.phone3]),
    duplicateFlag: Boolean(f[CUSTOMER_FIELDS.duplicateFlag]),
    routingGroup: str(f[CUSTOMER_FIELDS.routingGroup]),
    campaign: str(f[CUSTOMER_FIELDS.campaign]),
    consentStatus: str(f[CUSTOMER_FIELDS.consentStatus]),
    policyNumber: str(f[CUSTOMER_FIELDS.policyNumber]),
    policyStatus: str(f[CUSTOMER_FIELDS.policyStatus]),
    renewalPremium: str(f[CUSTOMER_FIELDS.renewalPremium]),
    outstandingBalance: str(f[CUSTOMER_FIELDS.outstandingBalance]),
    planCodeId: firstLinked(f[CUSTOMER_FIELDS.planCode]),
    noticeSent: str(f[CUSTOMER_FIELDS.noticeSent]),
    noticeRecieved: str(f[CUSTOMER_FIELDS.noticeRecieved]),
    paymentDate: str(f[CUSTOMER_FIELDS.paymentDate]),
    policy: firstLinked(f[CUSTOMER_FIELDS.policy]),
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
  console.log("ตรวจสอบข้อมูล Policy ดิบ:", res.records.length > 0 ? res.records[0].fields : "ไม่พบข้อมูล");
  return {
    policies: res.records.map((r) => ({
      id: r.id,
      policyNumber: str(r.fields[POLICY_FIELDS.policyNumber]),
      policyStatus: str(r.fields[POLICY_FIELDS.policyStatus]),
      renewalPremium: num(r.fields[POLICY_FIELDS.renewalPremium]),
      outstanding: num(r.fields[POLICY_FIELDS.outstanding]),
      customerId: firstLinked(r.fields[POLICY_FIELDS.customer]),
      expiryDate: str(r.fields[POLICY_FIELDS.expiryDate]),
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
      callLogId: str(r.fields[CALL_LOG_FIELDS.callLogId]),
      customerId: firstLinked(r.fields[CALL_LOG_FIELDS.customer]),
      consentId: firstLinked(r.fields[CALL_LOG_FIELDS.consent]),
      duration: num(r.fields[CALL_LOG_FIELDS.duration]),
      conversationLogs: str(r.fields[CALL_LOG_FIELDS.conversationLogs]),
      audioUrl: str(r.fields[CALL_LOG_FIELDS.audioUrl]),
      calledAt: str(r.fields[CALL_LOG_FIELDS.calledAt]),
    })),
    offset: res.offset,
  };
}

// -------- Installment KB --------
export async function listInstallmentKb(opts?: {
  pageSize?: number;
  offset?: string;
}): Promise<{ items: InstallmentKb[]; offset?: string }> {
  const params: Record<string, string | number> = { pageSize: opts?.pageSize ?? 50 };
  if (opts?.offset) params.offset = opts.offset;
  const res = await call<ListResponse>({ action: "list", table: "INSTALLMENT_KB", params });
  return {
    items: res.records.map((r) => {
      const f = r.fields;
      const policyLinks = f[INSTALLMENT_KB_FIELDS.policy];
      return {
        id: r.id,
        planCode: str(f[INSTALLMENT_KB_FIELDS.planCode]),
        planNameTh: str(f[INSTALLMENT_KB_FIELDS.planNameTh]),
        planNameEn: str(f[INSTALLMENT_KB_FIELDS.planNameEn]),
        productType: str(f[INSTALLMENT_KB_FIELDS.productType]),
        installmentMonths: num(f[INSTALLMENT_KB_FIELDS.installmentMonths]),
        paymentMethod: str(f[INSTALLMENT_KB_FIELDS.paymentMethod]),
        bankName: str(f[INSTALLMENT_KB_FIELDS.bankName]),
        premiumMin: num(f[INSTALLMENT_KB_FIELDS.premiumMin]),
        premiumMax: num(f[INSTALLMENT_KB_FIELDS.premiumMax]),
        interestRate: num(f[INSTALLMENT_KB_FIELDS.interestRate]),
        isZeroInterest: Boolean(f[INSTALLMENT_KB_FIELDS.isZeroInterest]),
        conditionTh: str(f[INSTALLMENT_KB_FIELDS.conditionTh]),
        conditionEn: str(f[INSTALLMENT_KB_FIELDS.conditionEn]),
        isActive: Boolean(f[INSTALLMENT_KB_FIELDS.isActive]),
        policyIds: Array.isArray(policyLinks) ? (policyLinks as unknown[]).map(String) : undefined,
      };
    }),
    offset: res.offset,
  };
}

export async function getInstallmentKbConditionTh(recordId: string): Promise<string | undefined> {
  try {
    const rec = await call<AirtableRecord>({ action: "get", table: "INSTALLMENT_KB", recordId });
    return str(rec.fields[INSTALLMENT_KB_FIELDS.conditionTh]);
  } catch (e) {
    console.warn("getInstallmentKbConditionTh failed:", e);
    return undefined;
  }
}

// -------- helpers --------
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
