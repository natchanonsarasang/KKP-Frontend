export type ConsentStatus = "obtained" | "needed" | "denied";

/** Normalize the raw Airtable Consent_Status string to a stable enum. */
export function normalizeConsentStatus(raw?: string | null): ConsentStatus {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "consent given" || s === "consent obtained" || s === "obtained") return "obtained";
  if (s === "consent denied" || s === "denied" || s === "refused") return "denied";
  return "needed";
}

export interface AirtableRecord<F = Record<string, unknown>> {
  id: string;
  createdTime: string;
  fields: F;
}

export interface Customer {
  id: string;
  customerId?: number;
  firstName?: string;
  lastName?: string;
  phone1?: string;
  phone2?: string;
  phone3?: string;
  duplicateFlag?: boolean;
  routingGroup?: string;
  campaign?: string;
  consentStatus?: string;
  policyNumber?: string;
  policyStatus?: string;
  renewalPremium?: string;
  outstandingBalance?: string;
  planCodeId?: string;
  noticeSent?: string;
  paymentDate?: string;
  policy?: string;
  expiryDate?: string;
}

export interface Policy {
  id: string;
  policyNumber?: string;
  policyStatus?: string;
  renewalPremium?: number;
  outstanding?: number;
  customerId?: string;
  expiryDate?: string;
}

export interface CallLog {
  id: string;
  customerId?: string;
  policyId?: string;
  outcome?: string;
  duration?: number;
  transcript?: string;
  audioUrl?: string;
  calledAt?: string;
}

export interface InstallmentKb {
  id: string;
  planCode?: string;
  planNameTh?: string;
  planNameEn?: string;
  productType?: string;
  installmentMonths?: number;
  paymentMethod?: string;
  bankName?: string;
  premiumMin?: number;
  premiumMax?: number;
  interestRate?: number;
  isZeroInterest?: boolean;
  conditionTh?: string;
  conditionEn?: string;
  isActive?: boolean;
  policyIds?: string[];
}
