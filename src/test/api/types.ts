// Domain types mirroring the Callecto Go API JSON wire format
// (callecto-api/domain/entities/*.go). Field names match the Go `json:"..."` tags.

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface Debtor {
  id: string;
  phone_number: string;
  name: string;
  last_name: string;
  total_debt: number;
  status: string; // active/paid/defaulted/negotiating/pending
  contact_attempts: number;
  successful_contacts: number;
  last_contact_at: string;
  last_response: string;
  next_follow_up: string;
  notes: string;
  created_at: string;
  updated_at: string;
  auto_call_enabled: boolean;
  due_date: string;
  call_answered: boolean;
  call_outcome: string;
  picked_up_count: number;
  not_picked_up_count: number;
  accept_count: number;
  reject_count: number;
  other_count: number;
  variables: Record<string, string> | null;
  user_id: string;
  workspace_id: string;
  is_blocked: boolean;
  date_con: string;
}

export interface CallListItem {
  id: string;
  user_id: string;
  debtor_id: string;
  workspace_id: string;
  template_id: string;
  scheduled_at: string;
  called_at: string;
  status: string; // pending/completed/failed/calling
  call_record_id: string;
  call_outcome: string;
  picked_up: boolean;
  ai_category: string;
  next_retry_at: string | null;
  retry_count: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CallAttempt {
  id: string;
  user_id: string;
  call_list_item_id: string;
  call_record_id: string;
  workspace_id: string;
  attempt_number: number;
  status: string; // calling/finished
  call_outcome: string;
  picked_up: boolean;
  ai_category: string;
  conversation_log: string;
  audio_url: string;
  call_duration: number;
  error_reason: string;
  created_at: string;
  updated_at: string;
}

export type CallStatus =
  | "confirmed"
  | "declined"
  | "no_response"
  | "no_answer"
  | "hanged_up"
  | "pending"
  | "completed"
  | "busy"
  | "failed"
  | "rejected"
  | "voicemail"
  | "calling"
  | "not_convenient";

export interface CallRecord {
  id: string;
  template_id: string | null;
  phone_number: string;
  appointment_date: string;
  appointment_time: string;
  status: CallStatus;
  botnoi_call_id: string;
  result_data: unknown;
  due_date: string;
  amount: number;
  user_id: string;
  workspace_id: string;
  call_duration: number;
  created_at: string;
  updated_at: string;
}

export interface CallSessionSettings {
  maxRetries: number;
  delayBetweenCalls: number;
  concurrentCalls: number;
  businessHoursOnly: boolean;
  businessHoursStart: string;
  businessHoursEnd: string;
  businessDays: number[];
  testMode: boolean;
  timezoneOffset: number;
  interruptible: boolean;
}

export interface CallSession {
  id: string;
  user_id: string;
  workspace_id: string;
  status: string;
  total_calls: number;
  completed_calls: number;
  failed_calls: number;
  confirmed_calls: number;
  token_used: number;
  settings: CallSessionSettings;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
