// =====================================================================
// Dhipaya-specific call-status taxonomy (consent collection flow).
// Parallel to src/lib/callStatuses.ts but tuned for the consent-to-share-
// data conversation rather than debt collection.
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
  key: string;
  label: string;
  thai: string;
  color: string;
  tone: CallStatusTone;
  match: (lowerCat: string) => boolean;
}

// ---------------------------------------------------------------------
// 1. MAIN STATUSES — Dhipaya consent-flow outcomes
// ---------------------------------------------------------------------
export const MAIN_STATUSES: StatusDef[] = [
  {
    key: "consent_given",
    label: "Consent Given",
    thai: "ให้ความยินยอม",
    color: "#10b981",
    tone: "done",
    match: (c) =>
      c.includes("consent given") ||
      c.includes("consent_given") ||
      c.includes("ให้ความยินยอม"),
  },
  {
    key: "consent_denied",
    label: "Consent Denied",
    thai: "ปฏิเสธการให้ความยินยอม",
    color: "#f43f5e",
    tone: "skip",
    match: (c) =>
      c.includes("consent denied") ||
      c.includes("consent_denied") ||
      c.includes("ปฏิเสธการให้ความยินยอม") ||
      c.includes("ไม่ยินยอม"),
  },
  {
    key: "callback_scheduled",
    label: "Callback Scheduled",
    thai: "นัดติดต่อกลับ",
    color: "#f59e0b",
    tone: "callback",
    match: (c) =>
      c.includes("callback scheduled") ||
      c.includes("callback_scheduled") ||
      c.includes("scheduled callback") ||
      c.includes("นัดติดต่อกลับ") ||
      c.includes("นัดหมาย"),
  },
  {
    key: "transfer",
    label: "Transfer to Agent",
    thai: "โอนสายให้เจ้าหน้าที่",
    color: "#a855f7",
    tone: "transfer",
    match: (c) =>
      c.includes("transfer to agent") ||
      c.includes("transfer") ||
      c.includes("โอนสาย") ||
      c.includes("ขอคุยกับเจ้าหน้าที่"),
  },
  {
    key: "not_reached",
    label: "Not Reached",
    thai: "ติดต่อไม่ได้",
    color: "#64748b",
    tone: "other",
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
    key: "completed",
    label: "Completed",
    thai: "สนทนาสำเร็จ",
    color: "#3b82f6",
    tone: "done",
    match: (c) =>
      c === "completed" ||
      c.includes("completed") ||
      c.includes("สนทนาสำเร็จ") ||
      c.includes("สำเร็จ"),
  },
];

// ---------------------------------------------------------------------
// 2. SUB STATUSES — secondary conversation behaviors (Dhipaya subset)
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
    key: "background_noise",
    label: "Background Noise",
    thai: "เสียงแทรก/เสียงรบกวน",
    color: "#06b6d4",
    tone: "other",
    match: (c) =>
      c.includes("background noise") ||
      c.includes("เสียงแทรก") ||
      c.includes("เสียงรบกวน"),
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
];

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

export function resolveSubStatus(rawCategory: string | null | undefined): StatusDef | null {
  if (!rawCategory) return null;
  const cat = rawCategory.toLowerCase();
  return SUB_STATUSES.find((s) => s.match(cat)) ?? null;
}

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
