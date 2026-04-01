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
};

export function emptyDebtorCustomerVariables(): Record<
  DebtorCustomerVariableKey,
  string
> {
  return Object.fromEntries(
    DEBTOR_CUSTOMER_VARIABLE_KEYS.map((k) => [k, ""])
  ) as Record<DebtorCustomerVariableKey, string>;
}

/** Parse amount for `debtors.total_debt` column from user-entered text (commas allowed). */
export function parseDebtAmountForColumn(value: string): number {
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}
