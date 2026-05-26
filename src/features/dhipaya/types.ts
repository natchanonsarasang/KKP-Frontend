export interface AirtableRecord<F = Record<string, unknown>> {
  id: string;
  createdTime: string;
  fields: F;
}

export interface Customer {
  id: string;
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
  outstandingBalance?: string;
}

export interface Policy {
  id: string;
  policyNumber?: string;
  policyStatus?: string;
  renewalPremium?: number;
  outstanding?: number;
  customerId?: string;
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
