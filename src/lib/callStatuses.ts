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
    key: "convenient_to_pay",
    label: "Convenient to Pay",
    thai: "สะดวกจ่าย",
    color: "#10b981",
    tone: "done",
    // Willing/able to pay. Guarded so the "not/ไม่" variants never fall here.
    match: (c) =>
      (c.includes("convenient to pay") ||
        c.includes("convenient_to_pay") ||
        c.includes("able to pay") ||
        c.includes("สะดวกจ่าย") ||
        // Legacy "will pay / promised / already paid" outcomes collapse here.
        c.includes("promise") ||
        c.includes("already paid") ||
        c.includes("รับปาก") ||
        c.includes("ชำระเรียบร้อย")) &&
      !c.includes("not convenient") &&
      !c.includes("unable") &&
      !c.includes("ไม่สะดวก"),
  },
  {
    key: "not_convenient_to_pay",
    label: "Not Convenient to Pay",
    thai: "ไม่สะดวกจ่าย",
    color: "#f43f5e",
    tone: "skip",
    // Cannot / will not pay now — folds in legacy refused & restructure outcomes.
    match: (c) =>
      c.includes("not convenient to pay") ||
      c.includes("not_convenient_to_pay") ||
      c.includes("unable to pay") ||
      c.includes("ไม่สะดวกจ่าย") ||
      c.includes("refuse") ||
      c.includes("declined") ||
      c.includes("rejected") ||
      c.includes("restructure") ||
      c.includes("ปฏิเสธ") ||
      c.includes("ปรับโครงสร้าง"),
  },
  {
    key: "not_convenient_to_talk",
    label: "Not Convenient to Talk",
    thai: "ไม่สะดวกคุย",
    color: "#f59e0b",
    tone: "soft-callback",
    // Picked up but cannot talk now (busy / call back later / audio problems).
    match: (c) =>
      c.includes("not convenient to talk") ||
      c.includes("not_convenient_to_talk") ||
      c.includes("ไม่สะดวกคุย") ||
      c.includes("not convenient") ||
      // Legacy "Inconvenient (With/Without Date)" outcomes collapse here.
      c.includes("inconvenient") ||
      c.includes("call later") ||
      c.includes("background noise") ||
      c.includes("ไม่สะดวก"),
  },
  {
    key: "silent",
    label: "Silent",
    thai: "เงียบ",
    color: "#71717a",
    tone: "other",
    match: (c) => c.includes("silent") || c.includes("silence") || c.includes("เงียบ"),
  },
  {
    key: "off_topic",
    label: "Off Topic",
    thai: "พูดเรื่องอื่น นอกเรื่อง",
    color: "#22c55e",
    tone: "other",
    match: (c) =>
      c.includes("off topic") ||
      c.includes("off-topic") ||
      c.includes("out of topic") ||
      c.includes("พูดเรื่องอื่น") ||
      c.includes("นอกเรื่อง"),
  },
  {
    key: "wrong_number",
    label: "Wrong Number",
    thai: "โทรผิด",
    color: "#ef4444",
    tone: "skip",
    match: (c) =>
      c.includes("wrong number") ||
      c.includes("wrong person") ||
      c.includes("โทรผิด") ||
      c.includes("ไม่ใช่ผู้"),
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
];

// ---------------------------------------------------------------------
// 2. SUB STATUSES — the taxonomy is now flat (all outcomes live in
// MAIN_STATUSES), so there are no secondary conversation behaviors.
// Kept as an (empty) export so downstream imports/resolvers still work.
// ---------------------------------------------------------------------
export const SUB_STATUSES: StatusDef[] = [];

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
