## Goal

Change `syncCallLogToAirtable` in `supabase/functions/dhipaya-voicebot-webhook/index.ts` so that every webhook invocation creates a **new** Call Logs record in Airtable, instead of updating an existing one when found.

## Changes

In `supabase/functions/dhipaya-voicebot-webhook/index.ts` (around lines 1327–1452):

1. **Remove the existing-record lookup (Step C, lines 1327–1343).** The `{Customer}=...` search and `existing` variable are no longer needed.

2. **Remove the PATCH branch (lines 1434–1440).** Always run the POST/create path.

3. **Keep the customer guard.** Still bail out with the existing warning if `customerRec?.id` is missing, to avoid orphan rows.

4. **Keep everything else intact:**
   - Customer lookup via `customer_rec_id` then phone (`phoneCheckCallFormula`).
   - Campaign header determination logic.
   - `fields` payload (Conversation_Logs, audio_url, Call_Duration, Call_Status).
   - Linking the new row via `Customer: [customerRec.id]` and attaching `Call_Log_ID` when present.
   - 429-aware retry via `airtableFetch`.

5. **Logging:** replace the PATCH/created log lines with a single `console.log("Airtable call log CREATED for Customer ...")` after the POST.

## Out of scope

- No changes to consent/notice sync, intent routing, or campaign header logic.
- No frontend changes.
