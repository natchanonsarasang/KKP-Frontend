import { format, startOfDay, endOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { listDebtorsByWorkspace } from "@/api/debtors";
import { listCallRecords } from "@/api/callRecords";
import { isLicensePlateField, maskLicensePlate } from "@/lib/formatPhone";
import { resolveLatestStatusLabel } from "@/lib/callStatuses";
import { DEBTOR_CUSTOMER_VARIABLE_KEYS, formatThaiBuddhistDateShort, splitThaiDate } from "@/lib/debtorVariables";
import type { Debtor } from "./types";

export function buildVariablesToSave(
  tv: Record<string, string>,
  preserveTemplateFrom?: Record<string, unknown> | null,
  dueDateIso?: string,
  paidDateIso?: string,
): Record<string, string> {
  const out: Record<string, string> = {};

  const dueParts = splitThaiDate(dueDateIso);
  const paidParts = splitThaiDate(paidDateIso);

  for (const k of DEBTOR_CUSTOMER_VARIABLE_KEYS) {
    if (k === "due_date") {
      out[k] = dueParts.day;
    } else if (k === "due_month") {
      out[k] = dueParts.month;
    } else if (k === "due_year") {
      out[k] = dueParts.year;
    } else if (k === "paid_date") {
      out[k] = paidParts.day;
    } else if (k === "paid_month") {
      out[k] = paidParts.month;
    } else if (k === "paid_year") {
      out[k] = paidParts.year;
    } else {
      out[k] = tv[k] ?? "";
    }
  }
  // Store ISO versions to restore date pickers when editing
  if (dueDateIso) out.due_date_iso = dueDateIso;
  if (paidDateIso) out.paid_date_iso = paidDateIso;

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
    rows = rows.filter(
      (d) => (d.phone_number || "").toLowerCase().includes(q) || (d.name || "").toLowerCase().includes(q),
    );
  }

  if (dateRange?.from) {
    const fromStr = format(startOfDay(dateRange.from), "yyyy-MM-dd");
    rows = rows.filter((d) => d.date_con && d.date_con >= fromStr);
  }
  if (dateRange?.to || dateRange?.from) {
    const toStr = format(endOfDay(dateRange.to ?? dateRange.from!), "yyyy-MM-dd");
    rows = rows.filter((d) => d.date_con && d.date_con <= toStr);
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
    const dueParts = [v.due_date, v.due_month, v.due_year].filter((p) => p && String(p).trim());
    const s = exportStats[d.phone_number];
    return {
      Contact: d.phone_number || "-",
      Name: v.name || "-",
      "Latest Call Status": statusLabel || "-",
      "Callback Date": d.date_con ? formatThaiBuddhistDateShort(d.date_con) : "-",
      "Policy Number": v.policy_no || "-",
      "Outstanding Amount": v.outstanding_amount || "-",
      "Overdue Installments": v.overdue_installments || "-",
      "Due Date": dueParts.length > 0 ? dueParts.join(" ") : "-",
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
