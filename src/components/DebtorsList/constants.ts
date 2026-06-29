import type { CallStatusTone } from "@/lib/callStatuses";

export const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "bg-primary/10 text-primary" },
  paid: { label: "Paid", color: "bg-success/10 text-success" },
  defaulted: { label: "Defaulted", color: "bg-destructive/10 text-destructive" },
  negotiating: { label: "Negotiating", color: "bg-warning/10 text-warning" },
  pending: { label: "Pending", color: "bg-muted text-muted-foreground" },
};

export const STATUS_TONE_CLASS: Record<CallStatusTone, string> = {
  callback: "bg-warning/15 text-warning border-warning/40",
  transfer: "bg-warning/15 text-warning border-warning/40",
  "soft-callback": "bg-warning/10 text-warning border-warning/25",
  done: "bg-success/15 text-success border-success/30",
  skip: "bg-destructive/10 text-destructive border-destructive/30",
  other: "bg-muted text-muted-foreground border-border",
  none: "",
};

// Pinned keys are rendered as dedicated fixed columns and excluded from the
// dynamic variable-column list. Hidden keys are internal/legacy and never shown.
export const PINNED_VARIABLE_KEYS = ["name", "policy_no", "outstanding_amount", "overdue_installments"] as const;
export const HIDDEN_VARIABLE_KEYS = ["due_date_iso", "paid_date_iso", "policy_number", "price"] as const;

export const PAGE_SIZE = 50;
