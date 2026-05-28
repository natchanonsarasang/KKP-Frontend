## Goal
Extend the Dhipaya webhook AI classifier with a "Notice Received / Not Received" decision step after the Consent Decision, plus an INSURANCE RENEWAL CONTEXT block clarifying renewal/payment talk must NOT affect PDPA consent.

## Scope
Edge function only: `supabase/functions/dhipaya-voicebot-webhook/index.ts`. Front-end taxonomy file `src/features/dhipaya/lib/dhipaya-callStatuses.ts` is updated so the new categories render correctly in the Result column. No DB migration (log-only).

## Changes

### 1. `CONVERSATION_CATEGORIES` (webhook)
Add two new `main` categories after `Consent Denied`:
- `Notice Received` — `ได้รับเอกสารแจ้งเตือนแล้ว` — tone `done`
- `Notice Not Received` — `ยังไม่ได้รับเอกสารแจ้งเตือน` — tone `other`

IDs assigned at the end (12, 13) to avoid disturbing existing 1–11 ordering.

### 2. System prompt rewrite (`classifyCall`)
- Insert a new **INSURANCE RENEWAL CONTEXT** section before DECISION ORDER, copied from the user's text: bot may inform about expiry, confirm notice received, explain premium, payment channels (GSB, QR, MyMo, bank apps, Dhipaya Insure), installments, thank-yous. State explicitly: these renewal/payment discussions are informational only and MUST NOT be treated as debt collection, consent approval, or consent denial unless the customer explicitly answers the PDPA consent question.
- Insert a new decision step **5. NOTICE CHECK** (between current "4. CONSENT DECISION" and "5. COMPLETED" → renumber Completed to 6):
  - If the bot asked whether the renewal/notice document was received AND the customer answered:
    - Affirmative ("ได้รับแล้ว", "ได้รับเอกสารแล้ว", "yes received") → `Notice Received`
    - Negative ("ยังไม่ได้รับ", "ไม่ได้รับ", "haven't got it") → `Notice Not Received`
  - Only choose Notice Received/Not Received when no Consent Decision (step 4) was reached — Consent always wins.
- Keep "Completed" as the final fallback (becomes step 6).
- Update alias map to keep current behavior; no new aliases needed.

### 3. Fallback labels
Both fallback sites (`Unmatched AI category`, `Classifier exception`) stay at `Completed`.

### 4. Front-end taxonomy `src/features/dhipaya/lib/dhipaya-callStatuses.ts`
Append the two new entries to `MAIN_STATUSES` so the Result badge in `src/features/dhipaya/CallList.tsx` resolves their Thai label and tone correctly. No other UI change.

## Out of scope
- No DB columns / migration (storage is log-only via `ai_category`).
- No change to `outcomeMap`, token deduction, retry logic, Airtable consent sync (consent sync stays gated to `Consent Given` / `Consent Denied` only).
- No change to silence/audio-quality rule-based pre-checks.

## Verification
- Redeploy `dhipaya-voicebot-webhook`.
- Spot-check with a sample transcript containing "ได้รับเอกสารแล้ว" (no consent answer) → should classify as `Notice Received`.
- Spot-check with a transcript where customer both confirms notice AND gives consent → should still classify as `Consent Given` (step 4 wins).
