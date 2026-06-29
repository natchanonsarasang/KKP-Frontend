import * as XLSX from "xlsx";
import { toast } from "sonner";
import { toThaiPhonetic, shouldUsePhonetic } from "@/lib/thaiPhonetic";
import { resolveMainStatus, resolveSubStatus, resolveLatestStatusLabel } from "@/lib/callStatuses";
import { BOTNOI_TEMPLATE_ID } from "./constants";
import type { CallListItem, PreviewPayload, Template, TranscriptData } from "./types";

// Parse notes field (could be JSON with audio_url/conversation_log or legacy plain URL)
export function parseNotesData(notes: string | null): TranscriptData {
  if (!notes) return { audioUrl: null, conversationLog: null };

  // Try to parse as JSON first (new format)
  try {
    const parsed = JSON.parse(notes);
    return {
      audioUrl: parsed.audio_url || null,
      conversationLog: parsed.conversation_log || parsed.transcription || null,
    };
  } catch {
    // Legacy format: notes is just the audio URL
    if (notes.startsWith("http")) {
      return { audioUrl: notes, conversationLog: null };
    }
    return { audioUrl: null, conversationLog: null };
  }
}

// Convert number to Thai text
export function numberToThaiText(num: number): string {
  if (num === 0) return "ศูนย์";

  const ones = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
  const positions = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];

  let result = "";
  let position = 0;
  let tempNum = Math.floor(num);

  while (tempNum > 0) {
    const digit = tempNum % 10;

    if (digit !== 0) {
      let digitText = ones[digit];

      if (position === 1 && digit === 2) {
        digitText = "ยี่";
      } else if (position === 1 && digit === 1) {
        digitText = "";
      } else if (position === 0 && digit === 1 && tempNum > 10) {
        digitText = "เอ็ด";
      }

      result = digitText + positions[position] + result;
    }

    tempNum = Math.floor(tempNum / 10);
    position++;
  }

  return result;
}

// Build the payload for preview/call
export function buildCallPayload(item: CallListItem, templates: Template[]): PreviewPayload | null {
  const selectedTemplate = templates?.find((t) => t.id === item.template_id) || templates?.[0];
  if (!selectedTemplate?.message || !item.debtor) return null;

  const debtor = item.debtor;
  const debtorVars = debtor.variables || {};

  // Construct the full message by replacing placeholders with debtor variables
  let constructedMessage = selectedTemplate.message;

  // Replace all {placeholder} with actual values from debtor variables
  Object.entries(debtorVars).forEach(([key, value]) => {
    const placeholder = new RegExp(`\\{${key}\\}`, "gi");
    let processedValue = String(value);

    // Convert license plate fields to Thai phonetic reading
    if (shouldUsePhonetic(key)) {
      processedValue = toThaiPhonetic(processedValue);
    }

    constructedMessage = constructedMessage.replace(placeholder, processedValue);
  });

  // Also replace standard placeholders
  const debtAmount = debtor.total_debt ? numberToThaiText(debtor.total_debt) + "บาท" : "-";
  const formattedDueDate = debtor.due_date
    ? new Date(debtor.due_date).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })
    : "-";

  constructedMessage = constructedMessage.replace(/\{debt\}/gi, debtAmount);
  constructedMessage = constructedMessage.replace(/\{Debt\}/g, debtAmount);
  constructedMessage = constructedMessage.replace(/\{due_date\}/gi, formattedDueDate);

  return {
    phone: debtor.phone_number,
    templateId: BOTNOI_TEMPLATE_ID,
    message: constructedMessage,
    item,
  };
}

// Export completed calls to Excel
export function exportCompletedCallsToExcel(callListItems: CallListItem[]): void {
  const completedStatuses = new Set([
    "completed",
    "success",
    "confirmed",
    "declined",
    "no_answer",
    "no_response",
    "failed",
    "busy",
    "cancelled",
    "invalid_number",
    "timeout",
  ]);
  const completedItems = (callListItems || []).filter((item) => completedStatuses.has(item.status));

  if (completedItems.length === 0) {
    toast.error("No completed calls to export");
    return;
  }

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
    return engMonths[s.toLowerCase()] || "";
  };
  const formatDueDate = (vars: Record<string, string>, isoFallback: string | null | undefined): string => {
    const dayRaw = String(vars.due_date || "").trim();
    const monthRaw = String(vars.due_month || "").trim();
    const yearRaw = String(vars.due_year || "").trim();
    if (dayRaw && monthRaw && yearRaw) {
      const dd = /^\d{1,2}$/.test(dayRaw) ? dayRaw.padStart(2, "0") : dayRaw;
      const mm = normalizeMonth(monthRaw);
      if (mm) return `${dd}/${mm}/${yearRaw}`;
    }
    const iso = String(isoFallback || "").trim();
    if (iso && /^\d{4}-\d{2}-\d{2}/.test(iso)) {
      const [y, m, d] = iso.slice(0, 10).split("-");
      const buddhistYear = String(parseInt(y, 10) + 543);
      return `${d}/${m}/${buddhistYear}`;
    }
    return "-";
  };

  const exportData = completedItems.map((item) => {
    const debtor = item.debtor;
    const vars = (debtor?.variables || {}) as Record<string, string>;
    const rawAmount = vars.amount || vars.outstanding_amount;
    const amount = rawAmount != null && rawAmount !== ""
      ? Number(String(rawAmount).replace(/,/g, ""))
      : debtor?.total_debt;

    // AI Status label (matches table badge)
    const cat = item.ai_category;
    let aiStatus = "-";
    if (cat) {
      const def = resolveMainStatus(cat) ?? resolveSubStatus(cat);
      aiStatus = def ? def.label : resolveLatestStatusLabel(cat);
    }

    const { audioUrl, conversationLog } = parseNotesData(item.notes ?? null);

    return {
      เบอร์โทร: debtor?.phone_number || "-",
      ชื่อ: vars.name || debtor?.name || "-",
      ยอด: amount && Number.isFinite(amount) ? amount : "-",
      วันครบกำหนด: formatDueDate(vars, debtor?.due_date),
      รับสาย: item.picked_up === true ? "Yes" : item.picked_up === false ? "No" : "-",
      ผลการโทร: item.call_outcome || "-",
      สถานะ: item.status,
      "Call Status": aiStatus,
      เวลา: item.called_at ? new Date(item.called_at).toLocaleString("th-TH") : "-",
      conversationlog: conversationLog || "-",
      audio_url: audioUrl || "-",
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Completed Calls");

  // Auto-size columns
  const colWidths = Object.keys(exportData[0] || {}).map((key) => ({
    wch: Math.max(key.length, 15),
  }));
  worksheet["!cols"] = colWidths;

  const fileName = `completed_calls_${new Date().toISOString().split("T")[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
  toast.success(`Exported ${completedItems.length} completed calls`);
}
