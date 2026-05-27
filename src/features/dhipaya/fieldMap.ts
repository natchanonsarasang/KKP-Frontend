// Centralised mapping between UI fields and Airtable column names.
// Change a value here when an Airtable column is renamed.

export const CUSTOMER_FIELDS = {
  customerId: "Customer_ID",
  firstName: "First_Name",
  lastName: "Last_Name",
  phone1: "Phone_Number1",
  phone2: "Phone_Number2",
  phone3: "Phone_Number3",
  duplicateFlag: "Duplicate_Flag",
  routingGroup: "Routing_Group",
  campaign: "Campaign",
  consentStatus: "Consent_Status (from Consents)",
  policyNumber: "Policy_Number (from Policy)",
  policyStatus: "Policy_Status (from Policy)",
  renewalPremium: "Renewal_Premium (from Policy)",
  outstandingBalance: "Outstanding_Balance (from Policy)",
  planCode: "Plan_Code (from Policy)",
  noticeSent: "Notice_Sent (from Policy)",
  paymentDate: "Payment_Date (from Policy)",
  policy: "Policy",
} as const;

export const CONSENT_FIELDS = {
  customer: "Customer",
  consentStatus: "Consent_Status",
} as const;

export const POLICY_FIELDS = {
  policyNumber: "Policy_number",
  policyStatus: "Policy_Status",
  renewalPremium: "Renewal_Rremium",
  outstanding: "Outstanding_Balance",
  customer: "Customer",
  expiryDate: "Expiry_date",
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
