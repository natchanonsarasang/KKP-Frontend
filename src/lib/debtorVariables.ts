/** Template / customer fields stored in `debtors.variables`. */
export const DEBTOR_CUSTOMER_VARIABLE_KEYS = [
  "policy_no",
  "name",
  "due_date",
  "due_month",
  "due_year",
  "outstanding_amount",
  "paid_date",
  "paid_month",
  "paid_year",
  "overdue_installments",
] as const;

export type DebtorCustomerVariableKey =
  (typeof DEBTOR_CUSTOMER_VARIABLE_KEYS)[number];

export const DEBTOR_CUSTOMER_VARIABLE_LABELS: Record<
  DebtorCustomerVariableKey,
  string
> = {
  policy_no: "Policy number",
  name: "Name",
  due_date: "Due date",
  due_month: "Due month",
  due_year: "Due year",
  outstanding_amount: "Outstanding amount",
  paid_date: "Paid date",
  paid_month: "Paid month",
  paid_year: "Paid year",
  overdue_installments: "Overdue Installments",
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
  
  // 1. If it's already YYYY-MM-DD, return it
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  
  // 2. If it's a short number (1-2 digits), it's likely just a day, not a full date.
  // We reject this to avoid JS parsing "10" as "2001-09-30" or other weird values.
  if (/^\d{1,2}$/.test(s)) return null;

  const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Construct ISO date from Thai day, month name, and Buddhist year. */
export function constructIsoDateFromThaiParts(
  day: string | undefined | null,
  monthName: string | undefined | null,
  year: string | undefined | null
): string | null {
  const d = String(day ?? "").trim();
  const m = String(monthName ?? "").trim();
  const y = String(year ?? "").trim();

  if (!d || !m || !y) return null;

  const monthNames = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];
  const monthIndex = monthNames.indexOf(m);
  if (monthIndex === -1) return null;

  let fullYear = parseInt(y);
  if (isNaN(fullYear)) return null;
  
  // Adjust Buddhist year (approx > 2400) to AD
  if (fullYear > 2400) {
    fullYear -= 543;
  }

  const dayNum = parseInt(d);
  if (isNaN(dayNum)) return null;

  try {
    // Note: Month index is 0-based in JS Date, but we want ISO string
    const date = new Date(fullYear, monthIndex, dayNum);
    if (isNaN(date.getTime())) return null;
    
    // Format manually to avoid timezone shift from toISOString()
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${fullYear}-${pad(monthIndex + 1)}-${pad(dayNum)}`;
  } catch (e) {
    return null;
  }
}

/** Split ISO date (YYYY-MM-DD) into Thai day, month name, and Buddhist year. */
export function splitThaiDate(isoDate: string | null | undefined): {
  day: string;
  month: string;
  year: string;
} {
  if (!isoDate) return { day: "", month: "", year: "" };
  
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return { day: "", month: "", year: "" };

  const day = d.getDate().toString();
  const monthNames = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];
  const month = monthNames[d.getMonth()];
  const year = (d.getFullYear() + 543).toString();

  return { day, month, year };
}

/** Today's date formatted in Thai (Bangkok TZ, Buddhist Era), e.g. "วันจันทร์ ที่ 16 พฤษภาคม 2569". */
export function getThaiDateToday(): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    calendar: "buddhist",
  })
    .format(new Date())
    .replace(/(\S+)\s/, "$1 ที่ ");
}
