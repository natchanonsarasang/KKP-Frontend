import { format, startOfDay, endOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { listDebtorsByWorkspace } from "@/api/debtors";
import { listCallRecords } from "@/api/callRecords";
import { isLicensePlateField, maskLicensePlate } from "@/lib/formatPhone";
import { resolveLatestStatusLabel } from "@/lib/callStatuses";
import { DEBTOR_CUSTOMER_VARIABLE_KEYS, formatThaiBuddhistDateShort } from "@/lib/debtorVariables";
import type { Debtor } from "./types";

export function buildVariablesToSave(
  tv: Record<string, string>,
  preserveTemplateFrom?: Record<string, unknown> | null,
  dueDateIso?: string,
): Record<string, string> {
  const out: Record<string, string> = {};

  for (const k of DEBTOR_CUSTOMER_VARIABLE_KEYS) {
    out[k] = tv[k] ?? "";
  }
  // Store ISO version to restore the date picker when editing
  if (dueDateIso) out.due_date_iso = dueDateIso;

  const mt = preserveTemplateFrom?.message_template;
  if (typeof mt === "string" && mt.length > 0) {
    out.message_template = mt;
  }
  return out;
}

// Format a variable value for display (numeric formatting + license-plate mask)
export function formatVariableValue(varKey: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  const str = String(value);
  const isNumeric = !isNaN(Number(str.replace(/,/g, "")));
  const isYearField = varKey.toLowerCase().includes("year");
  let display = isNumeric && !isYearField ? Number(str.replace(/,/g, "")).toLocaleString("th-TH") : str;
  if (isLicensePlateField(varKey)) display = maskLicensePlate(str);
  return display;
}

export interface DebtorFilterArgs {
  effectiveUserId: string | null | undefined;
  statusFilter: string;
  callStatusFilter: string;
  latestStatusByDebtor: Map<string, string | null> | undefined;
  filteredDebtorIds: string[] | null;
  searchQuery: string;
  dateRange: DateRange | undefined;
  sortField: string;
  sortDirection: "asc" | "desc";
}

// Helper to normalize day/month/year components to YYYY-MM-DD
function normalizeDateParts(dayRaw: string, monthRaw: string, yearRaw: string): string | null {
  const dd = /^\d{1,2}$/.test(dayRaw) ? dayRaw.padStart(2, "0") : null;
  if (!dd) return null;

  // Normalize Month
  const thaiMonths: Record<string, string> = {
    "มกราคม": "01", "กุมภาพันธ์": "02", "มีนาคม": "03", "เมษายน": "04",
    "พฤษภาคม": "05", "มิถุนายน": "06", "กรกฎาคม": "07", "สิงหาคม": "08",
    "กันยายน": "09", "ตุลาคม": "10", "พฤศจิกายน": "11", "ธันวาคม": "12",
    "ม.ค.": "01", "ก.พ.": "02", "มี.ค.": "03", "เม.ย.": "04", "พ.ค.": "05", "มิ.ย.": "06",
    "ก.ค.": "07", "ส.ค.": "08", "ก.ย.": "09", "ต.ค.": "10", "พ.ย.": "11", "ธ.ค.": "12"
  };
  const engMonths: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04", may: "05",
    june: "06", july: "07", august: "08", september: "09", october: "10",
    november: "11", december: "12",
    jan: "01", feb: "02", mar: "03", apr: "04", jun: "06", jul: "07",
    aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
  };
  
  let mm = "";
  if (/^\d{1,2}$/.test(monthRaw)) {
    mm = monthRaw.padStart(2, "0");
  } else if (thaiMonths[monthRaw]) {
    mm = thaiMonths[monthRaw];
  } else {
    mm = engMonths[monthRaw.toLowerCase()] || "";
  }
  if (!mm) return null;

  // Normalize Year
  let y = parseInt(yearRaw, 10);
  if (isNaN(y)) return null;
  if (y > 2400) {
    y -= 543; // Convert Buddhist year to Gregorian
  }
  const yyyy = String(y).padStart(4, "0");

  return `${yyyy}-${mm}-${dd}`;
}

// Helper to parse debtor due date to YYYY-MM-DD
export function parseDebtorDueDate(d: Debtor): string | null {
  if (d.due_date) {
    const match = d.due_date.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  const v = d.variables || {};

  if (v.due_date_iso) {
    const match = v.due_date_iso.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  const dayRaw = String(v.due_date || "").trim();
  const monthRaw = String(v.due_month || "").trim();
  const yearRaw = String(v.due_year || "").trim();

  if (dayRaw && monthRaw && yearRaw) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dayRaw)) return dayRaw;
    return normalizeDateParts(dayRaw, monthRaw, yearRaw);
  }

  return null;
}

// Helper to parse debtor paid date to YYYY-MM-DD
export function parseDebtorPaidDate(d: Debtor): string | null {
  const v = d.variables || {};

  if (v.paid_date_iso) {
    const match = v.paid_date_iso.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  const dayRaw = String(v.paid_date || "").trim();
  const monthRaw = String(v.paid_month || "").trim();
  const yearRaw = String(v.paid_year || "").trim();

  if (dayRaw && monthRaw && yearRaw) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dayRaw)) return dayRaw;
    return normalizeDateParts(dayRaw, monthRaw, yearRaw);
  }

  return null;
}

// The Go API returns all debtors for a workspace; filtering/sorting/pagination
// that used to run in SQL now runs client-side here (and is reused by export).
export function applyDebtorFilters(all: Debtor[], args: DebtorFilterArgs): Debtor[] {
  const { effectiveUserId, statusFilter, callStatusFilter, latestStatusByDebtor, filteredDebtorIds, searchQuery, dateRange, sortField, sortDirection } = args;
  let rows = all;

  if (effectiveUserId) rows = rows.filter((d) => d.user_id === effectiveUserId);
  if (statusFilter !== "all") rows = rows.filter((d) => d.status === statusFilter);

  if (callStatusFilter === "never") {
    const calledIds = new Set(latestStatusByDebtor?.keys() ?? []);
    rows = rows.filter((d) => !calledIds.has(d.id));
  } else if (callStatusFilter !== "all") {
    const ids = new Set(filteredDebtorIds ?? []);
    rows = rows.filter((d) => ids.has(d.id));
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    rows = rows.filter((d) => {
      const dbName = (d.name || "").toLowerCase();
      const dbLastName = (d.last_name || "").toLowerCase();
      const varName = (d.variables?.name || "").toLowerCase();
      const phone = (d.phone_number || "").toLowerCase();
      return dbName.includes(q) || dbLastName.includes(q) || varName.includes(q) || phone.includes(q);
    });
  }

  if (dateRange?.from) {
    const fromStr = format(dateRange.from, "yyyy-MM-dd");
    const toStr = dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : fromStr;
    const isSingleDay = fromStr === toStr;

    rows = rows.filter((d) => {
      const dueDate = parseDebtorDueDate(d);
      const paidDate = parseDebtorPaidDate(d);

      if (isSingleDay) {
        return dueDate === fromStr;
      } else {
        return dueDate === fromStr && paidDate === toStr;
      }
    });
  }

  const dir = sortDirection === "asc" ? 1 : -1;
  const getVal = (d: Debtor): unknown => {
    if (sortField.startsWith("var:")) return d.variables?.[sortField.slice(4)];
    return (d as unknown as Record<string, unknown>)[sortField];
  };
  rows = [...rows].sort((a, b) => {
    const va = getVal(a);
    const vb = getVal(b);
    const aNull = va === null || va === undefined || va === "";
    const bNull = vb === null || vb === undefined || vb === "";
    if (aNull && bNull) return 0;
    if (aNull) return 1; // nulls last regardless of direction
    if (bNull) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });

  return rows;
}

const fmtLastContact = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("th-TH", {
        day: "numeric",
        month: "long", // full month name
        year: "numeric", // full year number (B.E)
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

export async function exportDebtorsToExcel(
  workspaceId: string | undefined,
  filterArgs: DebtorFilterArgs,
  latestStatusByDebtor: Map<string, string | null> | undefined,
): Promise<void> {
  if (!workspaceId) {
    toast.info("No workspace selected");
    return;
  }

  // Fetch all workspace debtors, then apply the same filters/sort as the table.
  const allRaw = (await listDebtorsByWorkspace(workspaceId)) as unknown as Debtor[];
  const all = applyDebtorFilters(allRaw, filterArgs);

  if (all.length === 0) {
    toast.info("No debtors to export");
    return;
  }

  // Compute call stats from the user's call_records (scoped server-side by JWT).
  const exportStats: Record<string, { total: number; picked_up: number; not_picked_up: number }> = {};
  const recs = await listCallRecords({});
  recs.forEach((r) => {
    if (!r.phone_number) return;
    const s = (exportStats[r.phone_number] ||= { total: 0, picked_up: 0, not_picked_up: 0 });
    s.total++;
    if (r.status === "confirmed" || r.status === "declined" || r.status === "no_response" || r.status === "completed") {
      s.picked_up++;
    } else if (r.status === "no_answer" || r.status === "failed") {
      s.not_picked_up++;
    }
  });

  const rows = all.map((d) => {
    const v = (d.variables ?? {}) as Record<string, string>;
    const rawStatus = latestStatusByDebtor?.get(d.id) ?? null;
    const statusLabel = rawStatus ? resolveLatestStatusLabel(rawStatus) : "-";
    const dueDate = parseDebtorDueDate(d);
    const s = exportStats[d.phone_number];
    return {
      Contact: d.phone_number || "-",
      Name: v.name || "-",
      "Latest Call Status": statusLabel || "-",
      "Callback Date": d.date_con ? formatThaiBuddhistDateShort(d.date_con) : "-",
      "Car Detail": v.car_detail || "-",
      "Total Debt": v.total_debt || "-",
      "Total Interest": v.total_interest || "-",
      "Total Fine": v.total_fine || "-",
      "Overdue Installments": v.overdue_installment || "-",
      "Due Date": dueDate ? formatThaiBuddhistDateShort(dueDate) : "-",
      Picked: s?.picked_up ?? 0,
      "No Pick": s?.not_picked_up ?? 0,
      Calls: s?.total ?? 0,
      "Last Contact": fmtLastContact(d.last_contact_at),
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Debtors");

  // Auto-size columns
  const colWidths = Object.keys(rows[0] || {}).map((key) => ({
    wch: Math.max(key.length, ...rows.map((r) => String(r[key as keyof typeof r] ?? "").length)),
  }));
  ws["!cols"] = colWidths;

  const fileName = `debtors-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
  XLSX.writeFile(wb, fileName);

  toast.success(`Exported ${rows.length} debtors`);
}
