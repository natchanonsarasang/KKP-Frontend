/** Template / customer fields stored in `debtors.variables` (plus DB column `total_debt` from `total_debt` text). */
export const DEBTOR_CUSTOMER_VARIABLE_KEYS = [
  "agent_name",
  "customer_name",
  "car_detail",
  "overdue_installment",
  "total_debt",
  "total_interest",
  "total_fine",
  "other_expense",
  "due_date",
] as const;

export type DebtorCustomerVariableKey =
  (typeof DEBTOR_CUSTOMER_VARIABLE_KEYS)[number];

export const DEBTOR_CUSTOMER_VARIABLE_LABELS: Record<
  DebtorCustomerVariableKey,
  string
> = {
  agent_name: "Agent name",
  customer_name: "Customer name",
  car_detail: "Car detail",
  overdue_installment: "Overdue installment",
  total_debt: "Total debt",
  total_interest: "Total interest",
  total_fine: "Total fine",
  other_expense: "Other expense",
  due_date: "Due date",
};

/** Text fields in `variables`; `due_date` is kept on the row + mirrored into variables at save. */
export function emptyDebtorCustomerVariables(): Record<string, string> {
  return Object.fromEntries(
    DEBTOR_CUSTOMER_VARIABLE_KEYS.filter((k) => k !== "due_date").map((k) => [
      k,
      "",
    ])
  );
}

/** Parse amount for `debtors.total_debt` column from user-entered text (commas allowed). */
export function parseDebtAmountForColumn(value: string): number {
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

/** Normalize Excel / pasted dates to YYYY-MM-DD for Postgres `date` and `variables.due_date`. */
export function parseDueDateForColumn(
  raw: string | undefined | null
): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
