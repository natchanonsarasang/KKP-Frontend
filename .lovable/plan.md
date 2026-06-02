## Goal

When the webhook creates a new Airtable **Consents** record, the new **Call Logs** row created right after should link back to it via a `Consents` foreign-key field. Today, both syncs are kicked off in parallel as fire-and-forget promises, so the Call Log can be created before (or without knowing) the Consent record id — we need to remove that race.

## Changes (single file: `supabase/functions/dhipaya-voicebot-webhook/index.ts`)

### 1. `syncConsentToAirtable` returns the new record id

- Change signature from `Promise<void>` to `Promise<string | null>`.
- After the `POST ${baseId}/Consents` call (~line 1226), capture the response and `return created?.id ?? null`.
- All early-return branches (missing creds, no customer match) return `null`.

### 2. `syncCallLogToAirtable` accepts an optional consent record id

- Add new parameter `consentRecordId?: string | null` (last arg).
- In the `createFields` block (~line 1411), if `consentRecordId` is a string starting with `rec`, add `Consents: [consentRecordId]` to `createFields`. Field name is exactly `Consents` (matching the Airtable column the user is adding) — confirm in QA log.
- No other logic changes; campaign/customer logic stays as-is.

### 3. `handleWebhook` — sequence consent → call log to avoid the race

Current flow (lines ~246–307): consent, notice, and call log are each wrapped in `EdgeRuntime.waitUntil` and effectively run in parallel.

New flow:

- Build a single background task that:
  1. `await`s `syncConsentToAirtable(...)` when `consentValue` is set and gating passes, capturing `consentRecordId` (or `null` if skipped/failed).
  2. Then `await`s `syncCallLogToAirtable(..., consentRecordId)` when `callId && checkCallAllowed`.
- Keep `syncNoticeToAirtable` independent — it can stay parallel (still wrapped in its own `waitUntil`), since notice writes to `Customer`, not to `Call Logs`.
- Wrap the new combined consent→callLog task in `EdgeRuntime.waitUntil` (with the existing `if (typeof EdgeRuntime !== "undefined")` fallback to `await`). All `try/catch` per step preserved so a consent failure still allows the call log to be created (just without the `Consents` link).
- If consent sync is skipped (no `consentValue`, not picked up, or CheckCall denied), `consentRecordId` stays `null` and the call log is created without the link — same as today.

### 4. Logging

- On call-log create, log whether `Consents` link was attached: `Airtable call log CREATED for Customer ${customerRec.id}${consentRecordId ? ` linked to Consent ${consentRecordId}` : ""}`.

## Out of scope

- Airtable schema work (user is adding the `Consents` column on the Call Logs table themselves).
- Notice flow, AI categorization, campaign header logic, retry/backoff, frontend.
- Back-filling existing Call Logs rows with consent links.

## Race-condition note

By awaiting the Consent POST before the Call Log POST inside the same background task, the Call Log create always sees a definitive `consentRecordId` (string or `null`) — no read-after-write lookup against Airtable is needed, which also avoids Airtable's eventual-consistency window on freshly created records.