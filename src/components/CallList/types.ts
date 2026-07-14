export interface Debtor {
  id: string;
  phone_number: string;
  name: string | null;
  last_name: string | null;
  total_debt: number;
  due_date: string | null;
  status: string;
  contact_attempts: number;
  picked_up_count: number;
  not_picked_up_count: number;
  accept_count: number;
  reject_count: number;
  other_count: number;
  last_contact_at: string | null;
  call_outcome?: string | null;
  variables: Record<string, string> | null;
  user_id?: string;
}

export interface CallListItem {
  id: string;
  debtor_id: string;
  user_id: string;
  template_id: string | null;
  scheduled_at: string | null;
  called_at: string | null;
  status: string;
  call_record_id: string | null;
  call_outcome: string | null;
  picked_up: boolean | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  ai_category?: string | null;
  // Debtor snapshot captured at creation (backend), so completed history stays
  // readable after the debtor is deleted. Used as a fallback in the debtor join.
  debtor_phone?: string;
  debtor_name?: string;
  debtor_amount?: number;
  debtor?: Debtor;
}

export interface Template {
  id: string;
  template_id: string | null;
  org_name: string;
  message: string;
  is_system_default: boolean;
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
  tokens_used: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export interface AutoDialSettings {
  maxRetries: number;
  dailyLimit: number;
  businessHoursOnly: boolean;
  businessHoursStart: string;
  businessHoursEnd: string;
  businessDays: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  delayBetweenCalls: number;
  concurrentCalls: number;
  testMode: boolean; // Mock mode - simulates calls without hitting real API
  timezoneOffset: number; // UTC offset in minutes (e.g., +7 hours = 420)
  interruptible: boolean; // Whether the bot can be interrupted
}

export type SortField = "phone" | "status" | "picked_up" | "call_outcome" | "called_at" | "created_at";
export type SortDirection = "asc" | "desc";

export interface PreviewPayload {
  phone: string;
  templateId: string;
  message: string;
  item: CallListItem;
}

export interface TranscriptData {
  conversationLog: string | null;
  audioUrl: string | null;
}
