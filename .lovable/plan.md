
## Goal

Give Dhipaya its own status taxonomy focused on a consent-collection flow (not debt collection), update the webhook AI classifier to match, and surface the AI result as a new "Result" column in the Dhipaya Call List.

## 1. New file: `src/features/dhipaya/lib/dhipaya-callStatuses.ts`

Copy the shape of `src/lib/callStatuses.ts` (`StatusDef`, `CallStatusTone`, resolvers) but replace `MAIN_STATUSES` with the Dhipaya-specific set:

| key | label | thai | tone |
|---|---|---|---|
| `transfer` | Transfer to Agent | โอนสายให้เจ้าหน้าที่ | transfer |
| `consent_given` | Consent Given | ให้ความยินยอม | done |
| `consent_denied` | Consent Denied | ปฏิเสธการให้ความยินยอม | skip |
| `callback_scheduled` | Callback Scheduled | นัดติดต่อกลับ | callback |
| `not_reached` | Not Reached | ติดต่อไม่ได้ | other |
| `completed` | Completed | สนทนาสำเร็จ | done |

Keep `SUB_STATUSES` minimal (reuse: `not_convenient`, `dropped_call`, `silence`, `wrong_person`, `background_noise`) so `Dropped Call` / `Not Reached` fallback rules still work.

Re-export `resolveMainStatus`, `resolveSubStatus`, `resolveLatestStatusLabel`, `resolveLatestStatusTone`, `ALL_STATUSES` — same signatures as the original, just using the new arrays. `resolveMainStatus` keeps the "picked_up=false / no_answer / busy / failed → not_reached" short-circuit.

## 2. Webhook: `supabase/functions/dhipaya-voicebot-webhook/index.ts`

**Sync `CONVERSATION_CATEGORIES`** to exactly the 6 main statuses above + the kept sub statuses (Not Convenient, Wrong Person, Background Noise, Silence, Dropped Call). Remove debt-collection categories (Promised to Pay, Planned More Than 3, Restructure, Inconvenient With/Without Date, Already Paid, Refused, Call Later, Out of Topic).

**Update `SYSTEM_STATUS_MAP`** so all telephony-level statuses still map to `Not Reached` (label stays the same).

**Rewrite `classifyCall` prompt** around the new consent flow:

Decision tree the prompt enforces (in order):
1. System status (no_answer/busy/voicemail/failed/unreachable/rejected) → `Not Reached`.
2. Empty/too-short log → `Not Reached`.
3. All User turns are TIMEOUT → `Silence` (kept) → still maps to `Not Reached` at the main-status level via `resolveMainStatus`.
4. Customer asks to be transferred to a human agent → `Transfer to Agent`.
5. Customer says it is not convenient to talk (no consent ask reached, or before/after consent ask without consent decision) → `Not Convenient` (sub) — main resolver falls back to `Not Reached`. Per the user's note: "if user said they is not convenient to talk → not_convenient".
6. The bot actually asked the consent question (retrieve data / analyze / offer product) AND the customer responded:
   - Affirmative → `Consent Given`
   - Refusal → `Consent Denied`
7. Customer agrees to a callback at a specific or vague later time → `Callback Scheduled`.
8. Any other topic with a normal hang-up after a real exchange → `Completed`.

**Strict rule baked into the prompt**: `Consent Given` / `Consent Denied` / `Callback Scheduled` require evidence in the transcript that the relevant question was reached. Hang-ups or silence before the consent ask must fall back to `Dropped Call` (sub) or `Not Reached`.

`makeResult` default fallback changes from `"Planned More Than 3"` to `"Completed"`. Update both fallback sites (`Unmatched AI category` and `Classifier exception`).

Outcome map / mappedStatus logic, debtor stats updates, token deduction, session updates — **unchanged** (still business-agnostic).

## 3. UI: `src/features/dhipaya/CallList.tsx`

- Import `resolveMainStatus` and `MAIN_STATUSES` from `./lib/dhipaya-callStatuses`.
- Extend `QueueRow` consumption to show `aiCategory` (already on call_list_items / call_attempts — verify it surfaces via the queue store; if missing, add it to the store row in a minimal pass).
- Add a new **Result** column between `Status` and `Duration` in the Completed tab table:
  - Empty `—` for pending/calling.
  - Otherwise render a badge using `resolveMainStatus(aiCategory, { picked_up, status, call_outcome })`, label from the matched `StatusDef`, color via `tone` mapped through existing `statusConfig`-style tone class (add a small `mainToneClass` map: done → success, skip → destructive, callback → warning, transfer → primary, other → muted).
- Header column label: `Result`.

## Technical notes

- No DB migrations: `ai_category` already lives on `call_list_items` and `call_attempts` as free-text.
- `src/lib/callStatuses.ts` and the global botnoi webhook are **not** modified — Dhipaya gets its own parallel taxonomy.
- `callQueueStore.ts` must expose `aiCategory` on `QueueRow` for the new column to work; will be confirmed and patched if needed during implementation.
