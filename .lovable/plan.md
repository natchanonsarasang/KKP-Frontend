# Dhipaya voicebot — consent-based flow refactor

## Goal

Split the call flow into two top-level branches driven by the customer's `consent_status`:

- **Consent Obtained** → Greeting + PDPA recording disclosure → Fire Insurance Renewal → Convenient (transfer) / Not convenient (close). If recording is refused → advise alternate channels & end.
- **Consent Needed** → Greeting (by name) + request PDPA consent → Agree (record consent) / Disagree (reassure, end).

Branching lives in two layers (matching today's architecture):
1. **Frontend** picks the entry intent from `consent_status` before invoking the voicebot.
2. **Webhook** classifies the final transcript into the new outcome set and, where applicable, persists side-effects (update Airtable consent, surface transfer request).

The Botnoi bot itself owns mid-call turn-by-turn branching (already its job).

---

## Changes

### 1. `src/features/dhipaya/types.ts` — add normalized consent enum

Add:
```ts
export type ConsentStatus = "obtained" | "needed" | "denied";
```

Add helper (co-located or in `lib/`):
```ts
export function normalizeConsentStatus(raw?: string | null): ConsentStatus {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "consent given") return "obtained";
  if (s === "consent denied") return "denied";
  return "needed"; // empty / unknown defaults to needed
}
```

Customer keeps the raw `consentStatus` string (sourced from Airtable); the enum is derived where needed.

### 2. `src/features/dhipaya/lib/callQueueStore.ts` — route entry intent

Extend `NextIntent` to the new flow set:
```ts
export type NextIntent =
  | "skip"
  | "consent_request"          // Consent Needed branch
  | "pdpa_then_renewal"        // Consent Obtained branch (default)
  | "campaign2" | "campaign3"; // keep existing for backward compat
```

Rewrite `checkConditionFlow` to use `normalizeConsentStatus`:
- `policyStatus` not in {overdue, prospect} → `skip`
- `consent === "denied"` → `skip`
- `consent === "needed"` → `consent_request`
- `consent === "obtained"` → `pdpa_then_renewal` (preserve prospect/notice-sent sub-routing if still required — confirm if `campaign2`/`campaign3` are still distinct bot flows or fold into `pdpa_then_renewal`)

Pass both `next_intent` AND raw `consent_status` in `variables`:
```ts
const variables = {
  ...existing,
  next_intent: nextIntent,
  consent_status: normalizeConsentStatus(row.customer.consentStatus),
};
```

### 3. `supabase/functions/dhipaya-voicebot-webhook/index.ts` — new outcome categories + side-effects

#### 3a. Extend the 15-status taxonomy

Add five new conversation outcomes (keep IDs contiguous after 16):
| id  | name (EN)              | thai                            | group |
| --- | ---------------------- | ------------------------------- | ----- |
| 17  | Consent Granted        | ให้ความยินยอม PDPA              | main  |
| 18  | Consent Refused        | ปฏิเสธความยินยอม PDPA            | main  |
| 19  | Recording Refused      | ปฏิเสธการบันทึกเสียง             | main  |
| 20  | Transfer Requested     | ขอโอนสายให้เจ้าหน้าที่           | main  |
| 21  | Renewal Not Convenient | ไม่สะดวกต่ออายุกรมธรรม์          | main  |

Add them to `CONVERSATION_CATEGORIES`.

> Keep `src/lib/callStatuses.ts` in sync (same labels/ids) so Analytics + UI render correctly.

#### 3b. Branch-aware prompt

Extract `consent_status` and `next_intent` from `payload.variables` (they round-trip via Botnoi). Prepend a branch hint to the classifier system prompt so Gemini chooses from the relevant subset:

- If `next_intent === "consent_request"` → valid outcomes: `Consent Granted`, `Consent Refused`, `Wrong Person`, `Not Convenient`, `Silence`, `Dropped Call`, `Not Reached`.
- If `next_intent === "pdpa_then_renewal"` → valid outcomes: `Recording Refused`, `Transfer Requested` (= "convenient"), `Renewal Not Convenient`, `Promised to Pay`, `Planned More Than 3`, `Already Paid`, `Refused`, plus behavior categories.

Add explicit definitions + Thai phrase cues (e.g. "โอเค/ตกลง" after PDPA disclosure → continue to renewal, "ไม่สะดวก" in renewal context → `Renewal Not Convenient`, "ขอคุยกับเจ้าหน้าที่/โอนสาย" → `Transfer Requested`, "ไม่ยินยอมให้บันทึก" → `Recording Refused`, "ยินยอม/ตกลง" in consent ask → `Consent Granted`, "ไม่ยินยอม/ไม่ตกลง" → `Consent Refused`).

Keep rule-based pre-checks (system status, silence, audio quality) untouched.

#### 3c. Side-effects after classification

After `aiCategory` is resolved, before updating `call_list_items`:

- `Consent Granted` → call existing Airtable helper `setCustomerConsent(customerId, "Consent Given")`. Look up `customerId` via `payload.variables.airtable_id` or by phone in the Customer table (reuse pattern in `src/features/dhipaya/api/airtable.ts`).
- `Consent Refused` → `setCustomerConsent(customerId, "Consent Denied")`.
- `Transfer Requested` → no live transfer (per decision). Persist outcome only; UI surfaces it in the Call List for an agent to follow up.
- `Recording Refused` / `Renewal Not Convenient` → no extra side-effect; outcome alone drives the dashboard.

Implement Airtable writes via a small `dhipaya-airtable` edge-function call (it already supports `update`/`create` on `Consents`) — invoke it from the webhook with the service-role key.

#### 3d. Outcome → finalStatus mapping

Add to the existing English `outcomeMap` and finalStatus logic:
- `Consent Granted`, `Transfer Requested`, `Renewal Not Convenient` → `success` + `pickedUp = true`.
- `Consent Refused`, `Recording Refused` → `success` + `pickedUp = true` (they DID engage; not a failure).
- Keep current mapping for everything else.

### 4. `src/lib/callStatuses.ts`

Mirror the 5 new statuses (id, EN/TH label, group, color) so the Call List badges, Analytics charts, and Reports show them. Reuse the existing `MAIN_STATUSES` pattern.

### 5. (Optional, recommended) Analytics tile

Add a tile or filter chip for the new outcomes in `src/features/dhipaya/Analytics.tsx` — only if you want consent-conversion stats visible. Skip if out of scope.

---

## Files touched

- `src/features/dhipaya/types.ts` — add `ConsentStatus` + `normalizeConsentStatus`
- `src/features/dhipaya/lib/callQueueStore.ts` — new `NextIntent` values, rewritten `checkConditionFlow`, pass `consent_status` in variables
- `src/lib/callStatuses.ts` — add 5 new statuses
- `supabase/functions/dhipaya-voicebot-webhook/index.ts` — extended taxonomy, branch-aware prompt, consent side-effects, updated outcome/finalStatus map

## Out of scope

- Botnoi bot flow editing (the bot must be configured separately to honor `next_intent = "consent_request" | "pdpa_then_renewal"` and emit transcripts the classifier can read).
- Live agent transfer via voicebot API.

## Open questions to confirm during implementation

1. Should existing `campaign2` / `campaign3` intents be deprecated, or kept alongside the new two? (Current `checkConditionFlow` still uses them for notice-sent routing under "consent given".)
2. Exact Airtable values for `Consent_Status` writes — "Consent Given" / "Consent Denied" matches today's strings; confirm casing with the Consents table.
