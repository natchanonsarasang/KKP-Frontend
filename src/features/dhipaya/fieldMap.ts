// Centralised mapping between UI fields and Airtable column names.
// Change a value here when an Airtable column is renamed.

export const CUSTOMER_FIELDS = {
  firstName: "first_name",
  lastName: "last_name",
  phone1: "phone_number1",
  phone2: "phone_number2",
  phone3: "phone_number3",
  duplicateFlag: "duplicate_flag",
  routingGroup: "routing_group",
  campaign: "campaign",
  consentStatus: "consent_status",
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
