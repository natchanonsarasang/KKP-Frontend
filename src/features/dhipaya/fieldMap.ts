// Centralised mapping between UI fields and Airtable column names.
// Change a value here when an Airtable column is renamed.

export const CUSTOMER_FIELDS = {
  firstName: "First_Name",
  lastName: "Last_Name",
  phone1: "Phone_Number1",
  phone2: "Phone_Number2",
  phone3: "Phone_Number3",
  duplicateFlag: "Duplicate_Flag",
  routingGroup: "Routing_Group",
  campaign: "Campaign",
  consentStatus: "Consent_Status",
} as const;

export const POLICY_FIELDS = {
  policyNumber: "policy_number",
  policyStatus: "policy_status",
  renewalPremium: "renewal_premium",
  outstanding: "outstanding_balance",
  customer: "customer",
} as const;

export const CALL_LOG_FIELDS = {
  customer: "customer",
  policy: "policy",
  outcome: "outcome",
  duration: "duration",
  transcript: "transcript",
  audioUrl: "audio_url",
  calledAt: "called_at",
} as const;
