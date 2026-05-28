## Goal
When the Dhipaya webhook finishes a call with `callOutcome` of `Confirmed` or `Completed` AND the AI classifies it as `Notice Received` / `Notice Not Received`, write `"Yes"` / `"No"` to the Customer table's `notice_received` column in Airtable.

## Scope
Edge function only: `supabase/functions/dhipaya-voicebot-webhook/index.ts`. No DB migration, no front-end changes.

## Changes

### 1. New helper `syncNoticeToAirtable(phone, value)`
- Mirrors `syncConsentToAirtable` (lines 897–963): same phone normalisation and `OR(REGEX_REPLACE(...))` lookup against `Customer.Phone_Number1/2/3`.
- Difference: PATCHes the Customer record itself (not Consents) with `{ "notice_received": "Yes" | "No" }` — matches `CUSTOMER_FIELDS.noticeRecieved` in `src/features/dhipaya/fieldMap.ts`.
- Skips when `AIRTABLE_PAT` / `AIRTABLE_BASE_ID` are missing or no Customer is found.

### 2. Trigger block after the consent-sync block (around line 170)
- Condition: `phoneNumber` present AND `callOutcome in ["Confirmed", "Completed"]` AND `aiCategory in ["Notice Received", "Notice Not Received"]`.
- Map: `Notice Received` → `"Yes"`, `Notice Not Received` → `"No"`.
- Wrap in `EdgeRuntime.waitUntil(...)` like the consent sync; log start/finish/skip.

### 3. Out of scope
- No change to AI prompt, categories, retry, token, or consent sync logic.
- No DB column added.

## Verification
- Redeploy `dhipaya-voicebot-webhook`.
- Sample call returning `Notice Received` + `callOutcome=Completed` → Customer `notice_received` becomes `Yes`.
- Sample with `Notice Not Received` + `Confirmed` → `No`.
- Other categories / outcomes (`No Answer`, `Failed`, ...) → sync skipped (visible in logs).
