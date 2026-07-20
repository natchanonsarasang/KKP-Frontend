export interface Debtor {
  id: string;
  phone_number: string;
  name: string | null;
  last_name: string | null;
  total_debt: number;
  due_date: string | null;
  status: string;
  contact_attempts: number;
  successful_contacts: number;
  last_contact_at: string | null;
  last_response: string | null;
  notes: string | null;
  created_at: string;
  picked_up_count: number;
  not_picked_up_count: number;
  accept_count: number;
  reject_count: number;
  other_count: number;
  variables: Record<string, string> | null;
  date_con: string | null;
  user_id?: string;
  is_blocked?: boolean;
  call_outcome?: string | null;
}

export interface DebtorFormData {
  phone_number: string;
  status: string;
  notes: string;
  due_date: string;
}

export interface DebtorsListProps {
  onNextStep?: () => void;
}

export type SortDirection = "asc" | "desc";

export interface PhoneCallStats {
  total: number;
  confirmed: number;
  declined: number;
  no_response: number;
  picked_up: number;
  not_picked_up: number;
}
