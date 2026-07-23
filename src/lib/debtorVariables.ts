/** Template / customer fields stored in `debtors.variables`. */
export const DEBTOR_CUSTOMER_VARIABLE_KEYS = [
  "name",
  "car_detail",
  "total_debt",
  "total_interest",
  "total_fine",
  "overdue_installment",
] as const;

export type DebtorCustomerVariableKey =
  (typeof DEBTOR_CUSTOMER_VARIABLE_KEYS)[number];

export const DEBTOR_CUSTOMER_VARIABLE_LABELS: Record<
  DebtorCustomerVariableKey,
  string
> = {
  name: "Customer Name",
  car_detail: "Car detail",
  total_debt: "Total debt",
  total_interest: "Total interest",
  total_fine: "Total fine",
  overdue_installment: "Overdue Installments",
};

/** Text fields in `variables`. */
export function emptyDebtorCustomerVariables(): Record<string, string> {
  return Object.fromEntries(
    DEBTOR_CUSTOMER_VARIABLE_KEYS.map((k) => [k, ""])
  );
}

/**
 * Maps the column headers users actually upload (the Thai labels from the
 * standard import sheet, plus common English aliases) onto the internal debtor
 * variable keys. Note: the vehicle plate + province arrive as one combined
 * "car_detail" column — the backend splits it into car_detail + province when
 * building the call, so we keep it combined here.
 */
const DEBTOR_IMPORT_HEADER_ALIASES: Record<string, string> = {
  // phone number
  phone_number: "phone_number",
  phone: "phone_number",
  "tel. number": "phone_number",
  เบอร์โทร: "phone_number",
  เบอร์โทรศัพท์: "phone_number",
  // customer name
  name: "name",
  "ชื่อ-นามสกุล": "name",
  "ชื่อ - นามสกุล": "name",
  ชื่อนามสกุล: "name",
  // vehicle plate + province (kept combined; backend splits it)
  car_detail: "car_detail",
  "หมายเลขทะเบียนรถ จังหวัด": "car_detail",
  หมายเลขทะเบียนรถ: "car_detail",
  ทะเบียนรถ: "car_detail",
  // overdue installments
  overdue_installment: "overdue_installment",
  จำนวนงวดที่ค้าง: "overdue_installment",
  // amounts
  total_debt: "total_debt",
  จำนวนเงินที่ค้าง: "total_debt",
  total_interest: "total_interest",
  จำนวนเงินดอกเบี้ยที่ค้าง: "total_interest",
  total_fine: "total_fine",
  จำนวนเงินค่าปรับ: "total_fine",
};

/** Columns from the standard sheet we intentionally drop on import. */
const DEBTOR_IMPORT_IGNORED_HEADERS = new Set<string>([
  "id",
  "no",
  "ลำดับ",
  "จำนวนเงินค่าใช้จ่ายอื่น", // "other expenses" — not supported yet
]);

/** Reverse map: canonical key -> Thai label, used for the download template + hints. */
export const DEBTOR_IMPORT_THAI_HEADERS: Record<string, string> = {
  phone_number: "เบอร์โทร",
  name: "ชื่อ-นามสกุล",
  car_detail: "หมายเลขทะเบียนรถ จังหวัด",
  overdue_installment: "จำนวนงวดที่ค้าง",
  total_debt: "จำนวนเงินที่ค้าง",
  total_interest: "จำนวนเงินดอกเบี้ยที่ค้าง",
  total_fine: "จำนวนเงินค่าปรับ",
};

/** Human-friendly (Thai) label for a canonical debtor column key. */
export function debtorImportHeaderLabel(key: string): string {
  return DEBTOR_IMPORT_THAI_HEADERS[key] ?? key;
}

function normalizeHeaderText(raw: string): string {
  return String(raw ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export type ResolvedDebtorHeader =
  | { kind: "key"; key: string }
  | { kind: "ignore" };

/**
 * Resolve an uploaded Excel header to either a canonical debtor variable key or
 * an "ignore" marker. Unknown headers pass through as-is so custom workspace
 * columns keep working.
 */
export function resolveDebtorImportHeader(raw: string): ResolvedDebtorHeader {
  const norm = normalizeHeaderText(raw);
  if (!norm) return { kind: "ignore" };
  if (DEBTOR_IMPORT_IGNORED_HEADERS.has(norm)) return { kind: "ignore" };
  const alias = DEBTOR_IMPORT_HEADER_ALIASES[norm];
  if (alias) return { kind: "key", key: alias };
  return { kind: "key", key: String(raw).trim() };
}

/**
 * Thai mobile numbers uploaded via Excel often lose their leading "0" when the
 * cell is stored as a number (10-digit "0812345678" becomes 9-digit
 * "812345678"). Restore it so the dialer receives a valid number.
 */
export function normalizeThaiPhone(raw: string): string {
  const s = String(raw ?? "").trim();
  return /^\d{9}$/.test(s) ? `0${s}` : s;
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

/**
 * Widen a date-only string ("2026-06-24") to RFC3339 ("2026-06-24T00:00:00Z").
 * The Go API's date fields are `time.Time`, which only unmarshals RFC3339; a bare
 * date makes the whole request body fail to parse (HTTP 422). Full timestamps and
 * empty values are passed through unchanged.
 */
export function toApiDate(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  if (dateStr.includes("T")) return dateStr;
  return `${dateStr}T00:00:00Z`;
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


/** Format ISO date (YYYY-MM-DD) as Thai Buddhist date, e.g. "วันจันทร์ที่ 13 เมษายน 2568". */
export function formatThaiBuddhistDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(`${iso}T00:00:00+07:00`);
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    timeZone: "Asia/Bangkok",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(d)
    .replace(/(\S+)\s/, "$1ที่ ");
}

/** Format date as DD/MM/YYYY in Buddhist Era, e.g. "22/05/2569". */
export function formatThaiBuddhistDateShort(value: string | null | undefined): string {
  if (!value) return "-";
  const iso = String(value).slice(0, 10);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T00:00:00+07:00`)
    : new Date(value);
  if (isNaN(d.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear() + 543;
  return `${day}/${month}/${year}`;
}
