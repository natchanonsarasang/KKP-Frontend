export interface CallRecord {
  id: string;
  phone_number: string;
  due_date: string | null;
  amount: string | null;
  status: string | null;
  botnoi_call_id: string | null;
  created_at: string;
  updated_at: string;
  template_id: string | null;
  call_duration: number | null;
  result_data: Record<string, unknown> | null;
  appointment_date: string | null;
  appointment_time: string | null;
  user_id: string | null;
  workspace_id: string | null;
}

export interface CallListItem {
  id: string;
  status: string;
  picked_up: boolean | null;
  call_outcome: string | null;
  scheduled_at: string | null;
  called_at: string | null;
  created_at: string;
  updated_at?: string | null;
  template_id: string | null;
  ai_category?: string | null;
  ai_reason?: string | null;
  ai_confidence?: number | null;
  debtor_id: string;
  call_record_id?: string | null;
  user_id?: string | null;
  workspace_id?: string | null;
  // Debtor snapshot captured at creation (backend), used as the primary source
  // for the history row so it stays readable even if the debtor is deleted.
  debtor_phone?: string | null;
  debtor_name?: string | null;
  debtor_amount?: number | null;
}

export interface Debtor {
  id: string;
  name: string | null;
  last_name: string | null;
  phone_number: string;
  total_debt: number | null;
  due_date: string | null;
  variables: Record<string, string> | null;
}

export interface Template {
  id: string;
  message: string;
  org_name: string;
}

export type DateRangeType = "today" | "week" | "month" | "year" | "all" | "custom";

export interface EnrichedCallRecord extends CallRecord {
  debtor_name: string;
  picked_up: boolean | null;
  call_outcome: string | null;
  ai_category: string | null;
  ai_reason: string | null;
  ai_confidence: number | null;
  conversation_log: string | null;
  audio_url: string | null;
}
