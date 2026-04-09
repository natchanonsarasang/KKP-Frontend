/** Template / customer fields stored in `debtors.variables`. */
export const DEBTOR_CUSTOMER_VARIABLE_KEYS = [
  "policy_number",
  "name",
  "due_date",
  "due_month",
  "due_year",
  "price",
  "paid_date",
  "paid_month",
  "paid_year",
] as const;

export type DebtorCustomerVariableKey =
  (typeof DEBTOR_CUSTOMER_VARIABLE_KEYS)[number];

export const DEBTOR_CUSTOMER_VARIABLE_LABELS: Record<
  DebtorCustomerVariableKey,
  string
> = {
  policy_number: "Policy number",
  name: "Name",
  due_date: "Due date",
  due_month: "Due month",
  due_year: "Due year",
  price: "Price",
  paid_date: "Paid date",
  paid_month: "Paid month",
  paid_year: "Paid year",
};

/** Text fields in `variables`. */
export function emptyDebtorCustomerVariables(): Record<string, string> {
  return Object.fromEntries(
    DEBTOR_CUSTOMER_VARIABLE_KEYS.map((k) => [k, ""])
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
