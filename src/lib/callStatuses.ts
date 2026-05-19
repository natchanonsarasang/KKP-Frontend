// Single source of truth for call outcome categories used across UI.
// Keep this in sync with CONVERSATION_CATEGORIES in supabase/functions/voicebot-webhook/index.ts

export interface CallStatusDef {
  id: number;
  name: string;          // canonical value stored in DB (call_list_items.ai_category)
  label: string;         // user-facing English label
  thai: string;
}

export const CALL_STATUS_CATEGORIES: CallStatusDef[] = [
  { id: 5,  name: "Not Convenient",   label: "Not Convenient",          thai: "ลูกค้าไม่สะดวกคุย" },
  { id: 6,  name: "Already Paid",     label: "Already Paid",            thai: "ลูกค้าแจ้งว่าชำระเรียบร้อยแล้ว" },
  { id: 7,  name: "Normal Flow",      label: "Appointment Scheduled",   thai: "นัดหมายชำระแล้ว" },
  { id: 8,  name: "Wrong Person",     label: "Wrong Person",            thai: "ลูกค้าแจ้งไม่ใช่ผู้เอาประกัน" },
  { id: 9,  name: "Transfer",         label: "Requested Agent Transfer", thai: "ลูกค้าขอคุยกับเจ้าหน้าที่" },
  { id: 10, name: "Call Later",       label: "Call Back Later",         thai: "ลูกค้านัดหมายให้ติดต่อใหม่" },
  { id: 11, name: "Barge-in",         label: "Barge-in",                thai: "ลูกค้าสอบถามข้อมูลระหว่างสนทนา" },
  { id: 12, name: "Background Noise", label: "Background Noise",        thai: "เสียงแทรก/เสียงรบกวน" },
  { id: 13, name: "Out of Topic",     label: "Out of Topic",            thai: "ลูกค้าพูดเรื่องอื่น" },
  { id: 14, name: "Silence",          label: "Silence",                 thai: "ลูกค้าเงียบ" },
  { id: 15, name: "Dropped Call",     label: "Dropped Call",            thai: "สายหลุดระหว่างสนทนา" },
  { id: 16, name: "Repeat Request",   label: "Repeat Request",          thai: "ลูกค้าแจ้งให้ทวนประโยคเดิม" },
];

// The 5 "main" statuses that get a custom display label; anything else → "Other"
const MAIN_STATUS_NAMES = new Set([
  "Normal Flow",
  "Call Later",
  "Not Convenient",
  "Wrong Person",
  "Transfer",
]);

const LABEL_BY_NAME: Record<string, string> = CALL_STATUS_CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.name]: c.label }),
  {} as Record<string, string>
);

/**
 * Resolve the display label for a debtor's latest call outcome.
 *  - null/empty (never called) → "-"
 *  - one of the 5 main statuses → mapped label
 *  - any other recorded status → "Other"
 */
export function resolveLatestStatusLabel(rawCategory: string | null | undefined): string {
  if (!rawCategory) return "-";
  if (MAIN_STATUS_NAMES.has(rawCategory)) return LABEL_BY_NAME[rawCategory] ?? rawCategory;
  return "Other";
}
