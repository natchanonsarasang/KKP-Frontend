## Goal
Sync the conversation log + minimal call metadata to the Airtable `Call Logs` table on every Dhipaya webhook hit, keyed by `outbound_id`.

## Scope
Edge function only: `supabase/functions/dhipaya-voicebot-webhook/index.ts`. No DB migration, no front-end changes.

## Changes

### 1. New helper `syncCallLogToAirtable(payload, conversationLog, phone, callOutcome)`
Placed next to `syncNoticeToAirtable`. Reuses `airtableFetch`, `normalizePhone`, env `AIRTABLE_PAT` / `AIRTABLE_BASE_ID`.

Flow:
1. Resolve `callLogId = payload.outbound_id || payload.call_id`. Skip + warn if missing.
2. **Find Customer** by phone (same `OR(REGEX_REPLACE({Phone_Number1/2/3}...))` formula used by consent / notice sync). Capture `customerRec.id`. If no customer found, still create/update the log without the `Customer` link (warning logged).
3. **Search Call Logs** via `filterByFormula={Call_Log_ID}='<callLogId>'&maxRecords=1` (table name URL-encoded as `Call%20Logs`).
4. Build `fields`:
   - `Conversation_Logs`: full `conversationLog`
   - `Call_Duration`: numeric from `payload.duration || payload.call_duration` when present
   - `Call_Status`: mapped value from the **fixed enum** `Busy | No Answer | Voicemail | Completed | Transferred`. Mapping from existing `callOutcome` / payload status:
     - `Completed`, `Confirmed` → `Completed`
     - `No Answer`, `no_answer`, `no-response`, `noresponse` → `No Answer`
     - `Busy`, `busy` → `Busy`
     - `Voicemail`, `voicemail`, `machine` → `Voicemail`
     - `Transferred`, `transferred`, `transfer` → `Transferred`
     - anything else → omit `Call_Status` (don't send an invalid enum to Airtable)
5. **Update or Create**
   - If existing → `PATCH /Call%20Logs/{id}` with `fields` (do NOT overwrite `Call_Log_ID` / `Customer`). Log `Airtable call log updated for Call_Log_ID <id>`.
   - Else → `POST /Call%20Logs` with `fields + { Call_Log_ID: callLogId, Customer: customerRec ? [customerRec.id] : undefined }`. Log `Airtable call log created for Customer <customerRec.id ?? 'unknown'>`.

### 2. Trigger in `serve` handler
After the consent + notice sync blocks, gated only by presence of `callLogId`, wrapped in `EdgeRuntime.waitUntil(...)` (with fallback to `await`). Runs on every webhook so create-then-patch works.

### 3. Out of scope
- No change to consent / notice sync, AI prompt, retry, token, or Supabase storage logic.
- No new Airtable fields beyond `Call_Log_ID`, `Customer`, `Conversation_Logs`, `Call_Duration`, `Call_Status`.

## Verification
- Redeploy `dhipaya-voicebot-webhook`.
- First webhook for a new `outbound_id` → new `Call Logs` row appears, linked to matching Customer, transcript in `Conversation_Logs`, `Call_Status` set only when it maps to one of the 5 allowed enum values.
- Subsequent webhook for same `outbound_id` → same row patched in-place, no duplicates.
- Webhook with unknown phone → row still created/patched without the `Customer` link (warning logged).
- Webhook with an unmapped outcome → row created/patched with `Call_Status` omitted (no Airtable enum error).
