// =====================================================================
// Single source of truth for ALL call-status taxonomy used across the UI.
//
// Two domains:
//   1) MAIN_STATUSES  — primary collection outcomes (what happened, business-wise)
//   2) SUB_STATUSES   — secondary conversation behaviors (what happened, mechanically)
//
// Change a label / color / matcher here and it propagates to:
//   - Analytics dashboard (Main Status Overview + SubStatus Overview charts)
//   - Debtor List "Latest Call Status" badge column
//   - Debtor List call-status filter dropdown
// =====================================================================

export type CallStatusTone =
  | "callback"
  | "transfer"
  | "soft-callback"
  | "done"
  | "skip"
  | "other"
  | "none";

export interface StatusDef {
  /** Stable id used as React key / filter value */
  key: string;
  /** English UI label */
  label: string;
  /** Thai display label */
  thai: string;
  /** Hex color used in charts and badge dots */
  color: string;
  /** Tailwind tone bucket used for badge styling */
  tone: CallStatusTone;
  /** Returns true if a raw ai_category (lower-cased) belongs to this status */
  match: (lowerCat: string) => boolean;
}

// ---------------------------------------------------------------------
// 1. MAIN STATUSES — primary collection outcomes
// ---------------------------------------------------------------------
export const MAIN_STATUSES: StatusDef[] = [
  {
    key: "planned_more_than_3",
    label: "Planned (>3 days)",
    thai: "วางแผนชำระเกิน 3 วัน",
    color: "#10b981",
    tone: "soft-callback",
    match: (c) =>
      c.includes("planned more than 3") ||
      c.includes("planned_more_than_3") ||
      c.includes("plan more than 3") ||
      c.includes("วางแผนชำระเกิน") ||
      // Legacy "Acknowledged" records collapse here for backward compatibility.
      c.includes("acknowledge") ||
      c.includes("normal flow") ||
      c.includes("แจ้งข้อมูลครบกำหนด") ||
      c.includes("รับทราบ"),
  },
  {
    key: "promised",
    label: "Promised to Pay",
    thai: "รับปากชำระ",
    color: "#3b82f6",
    tone: "done",
    match: (c) => c.includes("promise") || c.includes("ยืนยันชำระ") || c.includes("รับปาก"),
  },
  {
    key: "restructure",
    label: "Restructure Requested",
    thai: "ขอปรับโครงสร้างหนี้",
    color: "#8b5cf6",
    tone: "soft-callback",
    match: (c) => c.includes("restructure") || c.includes("ปรับโครงสร้าง"),
  },
  {
    key: "inconvenient_with_date",
    label: "Inconvenient (With Date)",
    thai: "ไม่สะดวก (มีนัดหมาย)",
    color: "#f59e0b",
    tone: "callback",
    match: (c) =>
      c.includes("inconvenient with date") ||
      c.includes("inconvenient (with date)") ||
      c.includes("ไม่สะดวก (มีนัดหมาย)") ||
      c.includes("ไม่สะดวกมีนัดหมาย") ||
      c.includes("callback scheduled") ||
      c.includes("scheduled callback") ||
      c.includes("นัดติดต่อ"),
  },
  {
    key: "inconvenient_without_date",
    label: "Inconvenient (Without Date)",
    thai: "ไม่สะดวก (ไม่มีนัดหมาย)",
    color: "#f97316",
    tone: "soft-callback",
    match: (c) =>
      c.includes("inconvenient without date") ||
      c.includes("inconvenient (without date)") ||
      c.includes("ไม่สะดวก (ไม่มีนัดหมาย)") ||
      c.includes("ไม่สะดวกไม่มีนัดหมาย"),
  },
  {
    key: "already_paid",
    label: "Already Paid",
    thai: "ชำระเรียบร้อยแล้ว",
    color: "#14b8a6",
    tone: "done",
    match: (c) => c.includes("already paid") || c.includes("ชำระเรียบร้อย"),
  },
  {
    key: "not_reached",
    label: "Not Reached",
    thai: "ติดต่อไม่ได้",
    color: "#64748b",
    tone: "other",
    // Usually inferred from call-level signals (picked_up=false, busy, failed, no answer),
    // but also match when ai_category itself was written as a "not reached"-style label.
    match: (c) =>
      c.includes("not reached") ||
      c.includes("not_reached") ||
      c.includes("no answer") ||
      c.includes("no_answer") ||
      c === "busy" ||
      c === "failed" ||
      c === "unreachable" ||
      c.includes("voicemail") ||
      c.includes("ติดต่อไม่ได้") ||
      c.includes("ไม่รับสาย"),
  },
  {
    key: "refused",
    label: "Refused",
    thai: "ปฏิเสธ",
    color: "#f43f5e",
    tone: "skip",
    match: (c) => c.includes("refuse") || c.includes("declined") || c.includes("rejected") || c.includes("ปฏิเสธ"),
  },
  // --- Dhipaya consent / PDPA / renewal-specific outcomes ---
  {
    key: "consent_granted",
    label: "Consent Granted",
    thai: "ให้ความยินยอม PDPA",
    color: "#22c55e",
    tone: "done",
    match: (c) => c.includes("consent granted") || c.includes("ให้ความยินยอม"),
  },
  {
    key: "consent_refused",
    label: "Consent Refused",
    thai: "ปฏิเสธความยินยอม PDPA",
    color: "#dc2626",
    tone: "skip",
    match: (c) => c.includes("consent refused") || c.includes("ปฏิเสธความยินยอม"),
  },
  {
    key: "recording_refused",
    label: "Recording Refused",
    thai: "ปฏิเสธการบันทึกเสียง",
    color: "#e11d48",
    tone: "skip",
    match: (c) => c.includes("recording refused") || c.includes("ปฏิเสธการบันทึก"),
  },
  {
    key: "transfer_requested",
    label: "Transfer Requested",
    thai: "ขอโอนสายให้เจ้าหน้าที่",
    color: "#a855f7",
    tone: "transfer",
    match: (c) => c.includes("transfer requested") || c.includes("ขอโอนสาย"),
  },
  {
    key: "renewal_not_convenient",
    label: "Renewal Not Convenient",
    thai: "ไม่สะดวกต่ออายุกรมธรรม์",
    color: "#fb923c",
    tone: "soft-callback",
    match: (c) =>
      c.includes("renewal not convenient") ||
      c.includes("ไม่สะดวกต่ออายุ"),
  },
];

// ---------------------------------------------------------------------
// 2. SUB STATUSES — secondary conversation behaviors
// ---------------------------------------------------------------------
export const SUB_STATUSES: StatusDef[] = [
  {
    key: "not_convenient",
    label: "Not Convenient",
    thai: "ไม่สะดวกคุย",
    color: "#f59e0b",
    tone: "soft-callback",
    match: (c) => c.includes("not convenient") || c.includes("ไม่สะดวก"),
  },
  {
    key: "wrong_person",
    label: "Wrong Person",
    thai: "ไม่ใช่ผู้เอาประกัน",
    color: "#ef4444",
    tone: "skip",
    match: (c) => c.includes("wrong person") || c.includes("ไม่ใช่ผู้"),
  },
  {
    key: "call_later",
    label: "Call Later",
    thai: "นัดหมายให้ติดต่อใหม่",
    color: "#f97316",
    tone: "callback",
    match: (c) => c.includes("call later") || c.includes("นัดหมายให้ติดต่อใหม่"),
  },
  {
    key: "transfer",
    label: "Transfer",
    thai: "ขอคุยกับเจ้าหน้าที่",
    color: "#a855f7",
    tone: "transfer",
    match: (c) => c.includes("transfer") || c.includes("ขอคุยกับเจ้าหน้าที่"),
  },
  {
    key: "background_noise",
    label: "Background Noise",
    thai: "เสียงแทรก/เสียงรบกวน",
    color: "#06b6d4",
    tone: "other",
    match: (c) => c.includes("background noise") || c.includes("เสียงแทรก") || c.includes("เสียงรบกวน"),
  },
  {
    key: "silence",
    label: "Silence",
    thai: "ลูกค้าเงียบ",
    color: "#71717a",
    tone: "other",
    match: (c) => c.includes("silence") || c.includes("เงียบ"),
  },
  {
    key: "dropped_call",
    label: "Dropped Call",
    thai: "สายหลุดระหว่างสนทนา",
    color: "#ec4899",
    tone: "other",
    match: (c) => c.includes("dropped") || c.includes("สายหลุด"),
  },
  {
    key: "out_of_topic",
    label: "Out of Topic",
    thai: "พูดเรื่องอื่น",
    color: "#22c55e",
    tone: "other",
    match: (c) => c.includes("out of topic") || c.includes("พูดเรื่องอื่น"),
  },
];

// Convenience union for places that don't care about the domain.
export const ALL_STATUSES: StatusDef[] = [...MAIN_STATUSES, ...SUB_STATUSES];

// ---------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------
export interface ResolveContext {
  picked_up?: boolean | null;
  status?: string | null;
  call_outcome?: string | null;
  result_status?: string | null;
}

/**
 * Resolve the MAIN status for a raw ai_category, optionally factoring in
 * call-level signals so unanswered calls land in "Not Reached".
 */
export function resolveMainStatus(
  rawCategory: string | null | undefined,
  ctx?: ResolveContext,
): StatusDef | null {
  if (ctx) {
    const s = (ctx.status || "").toLowerCase();
    const o = (ctx.call_outcome || "").toLowerCase();
    const r = (ctx.result_status || "").toLowerCase();
    if (
      ctx.picked_up === false ||
      o === "no answer" || o === "no_answer" || o === "busy" || o === "failed" ||
      r === "no answer" || r === "busy" || r === "failed" ||
      s === "no_answer" || s === "busy" || s === "failed"
    ) {
      return MAIN_STATUSES.find((m) => m.key === "not_reached") ?? null;
    }
  }
  if (!rawCategory) return null;
  const cat = rawCategory.toLowerCase();
  return MAIN_STATUSES.find((m) => m.match(cat)) ?? null;
}

/** Resolve the SUB status (conversation behavior) for a raw ai_category. */
export function resolveSubStatus(rawCategory: string | null | undefined): StatusDef | null {
  if (!rawCategory) return null;
  const cat = rawCategory.toLowerCase();
  return SUB_STATUSES.find((s) => s.match(cat)) ?? null;
}

/**
 * For the Debtor List "Latest Call Status" badge column.
 *   - never called  → "-"
 *   - matches main  → main label
 *   - matches sub   → sub label
 *   - otherwise     → "Other"
 */
export function resolveLatestStatusLabel(rawCategory: string | null | undefined): string {
  if (!rawCategory) return "-";
  const main = resolveMainStatus(rawCategory);
  if (main) return main.label;
  const sub = resolveSubStatus(rawCategory);
  if (sub) return sub.label;
  return "Other";
}

export function resolveLatestStatusTone(rawCategory: string | null | undefined): CallStatusTone {
  if (!rawCategory) return "none";
  const main = resolveMainStatus(rawCategory);
  if (main) return main.tone;
  const sub = resolveSubStatus(rawCategory);
  if (sub) return sub.tone;
  return "other";
}

// ---------------------------------------------------------------------
// LEGACY — kept for backward-compatibility with any older imports.
// Prefer MAIN_STATUSES / SUB_STATUSES for all new code.
// ---------------------------------------------------------------------
export interface CallStatusDef {
  id: number;
  name: string;
  label: string;
  thai: string;
}

export const CALL_STATUS_CATEGORIES: CallStatusDef[] = ALL_STATUSES.map((s, i) => ({
  id: i + 1,
  name: s.label,   // value stored as filter selection
  label: s.label,
  thai: s.thai,
}));
