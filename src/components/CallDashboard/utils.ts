import * as XLSX from "xlsx";
import { toast } from "sonner";
import type { Debtor, EnrichedCallRecord } from "./types";

// Resolve a debtor's due date from their custom variables (day/month/year split
// fields), falling back to a raw ISO date converted to the Thai Buddhist year.
export function formatDueDate(
  phone: string,
  fallback: string,
  debtorByPhone: Map<string, Debtor>,
): string {
  const debtor = debtorByPhone.get(phone);
  const vars = (debtor?.variables || {}) as Record<string, string>;
  const thaiMonths: Record<string, string> = {
    "มกราคม": "01", "กุมภาพันธ์": "02", "มีนาคม": "03", "เมษายน": "04",
    "พฤษภาคม": "05", "มิถุนายน": "06", "กรกฎาคม": "07", "สิงหาคม": "08",
    "กันยายน": "09", "ตุลาคม": "10", "พฤศจิกายน": "11", "ธันวาคม": "12",
  };
  const engMonths: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04", may: "05",
    june: "06", july: "07", august: "08", september: "09", october: "10",
    november: "11", december: "12",
    jan: "01", feb: "02", mar: "03", apr: "04", jun: "06", jul: "07",
    aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
  };
  const normalizeMonth = (m: string): string => {
    const s = String(m || "").trim();
    if (!s) return "";
    if (/^\d{1,2}$/.test(s)) return s.padStart(2, "0");
    if (thaiMonths[s]) return thaiMonths[s];
    const lower = s.toLowerCase();
    return engMonths[lower] || "";
  };

  const dayRaw = String(vars.due_date || "").trim();
  const monthRaw = String(vars.due_month || "").trim();
  const yearRaw = String(vars.due_year || "").trim();

  if (dayRaw && monthRaw && yearRaw) {
    const dd = /^\d{1,2}$/.test(dayRaw) ? dayRaw.padStart(2, "0") : dayRaw;
    const mm = normalizeMonth(monthRaw);
    if (mm) return `${dd}/${mm}/${yearRaw}`;
  }

  const iso = vars.due_date_iso || fallback || debtor?.due_date || "";
  if (iso && /^\d{4}-\d{2}-\d{2}/.test(iso)) {
    const [y, m, d] = iso.slice(0, 10).split("-");
    const buddhistYear = String(parseInt(y, 10) + 543);
    return `${d}/${m}/${buddhistYear}`;
  }
  return fallback || "-";
}

export function exportCallHistoryToExcel(
  records: EnrichedCallRecord[],
  debtorByPhone: Map<string, Debtor>,
): void {
  const rows = records.map((r) => ({
    "เบอร์โทร": r.phone_number,
    "ชื่อ": r.debtor_name || "-",
    "วันครบกำหนด": formatDueDate(r.phone_number, r.due_date || "", debtorByPhone),
    "จำนวนเงิน": r.amount || "-",
    "สถานะ": r.status || "pending",
    "รับสาย": r.picked_up === true ? "ใช่" : r.picked_up === false ? "ไม่" : "-",
    "ผลการโทร": r.call_outcome || "-",
    "วันที่โทร": new Date(r.created_at).toLocaleString("th-TH"),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Call History");
  XLSX.writeFile(wb, `call-history-${new Date().toISOString().split("T")[0]}.xlsx`);
  toast.success("ส่งออก Excel เรียบร้อย");
}
