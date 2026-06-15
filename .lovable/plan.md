## Problem

In `supabase/functions/dhipaya-voicebot-webhook/index.ts`, `syncCallLogToAirtable` decides the `Campaign 1/2/3` header using three priority sources:

1. `payload.variables.*` / `payload.*`
2. `result_data.*` from `call_records`
3. Airtable Customer lookup of `Consent_Status (from Consents)` + `Policy_Status (from Policy)`

Two issues with priority 3:

- **Timing**: by the time the call-log task runs, `syncConsentToAirtable` has already written the new Consents row, so the Airtable lookup reflects the **post-call** state — not the state the bot actually ran with. The Airtable branch then overrides the (correct) bot-type signal from the payload and tags the row with the wrong campaign.
- **Aggregation**: `Consent_Status (from Consents)` is a rollup array containing every consent ever recorded for the customer. The current code reads `cStatusRaw[0]`, which is not guaranteed to be the most recent one.

## Fix (single file: `supabase/functions/dhipaya-voicebot-webhook/index.ts`)

### 1. Extract campaign resolution into its own function

Move the campaign-detection logic currently inlined inside `syncCallLogToAirtable` (~lines 1331–1395) into a new helper:

```ts
async function resolveCampaignHeader(
  payload: any,
  phone: string | null,
  pat: string,
  baseId: string,
): Promise<{ campaignHeader: string; normalizedBotType: string; customerRec: any; resultData: any }>
```

Responsibilities:
- Load `result_data` from `call_records` (same query that's there today).
- Look up the Customer via the existing `findCustomerRecord` helper.
- Run the existing `rawBotType` chain + `normalizeBot()` cleanup.
- Resolve the customer's **latest** consent status (see step 2).
- Apply the existing priority tree (Airtable consent/policy → bot-type fallback) and return `campaignHeader`.
- Return `customerRec` and `resultData` too so `syncCallLogToAirtable` does not have to repeat the same two network calls.

### 2. Use the latest Consents row, not the rollup's first element

Inside `resolveCampaignHeader`, replace the `cStatusRaw[0]` read with an explicit lookup:

- Read the linked `Consents` array on the Customer record (list of `recXXXX` ids).
- If non-empty, fetch the linked rows via `GET v0/{baseId}/Consents?filterByFormula=OR(RECORD_ID()='rec1',...)&fields[]=Consent_Status&fields[]=Created_Time` (or whichever timestamp field is already on the table — fall back to Airtable's built-in `createdTime` from each record envelope).
- Pick the row with the most recent timestamp and use its `Consent_Status` as `consentStatus` for the priority tree.
- If the Customer has no Consents linked yet, treat `consentStatus` as empty (current "blank → Campaign 1" rule still applies).
- Keep the same lowercase/trim normalization that's there today.

Log the resolved latest consent next to the existing `DEBUG Airtable Raw:` line: `Latest Consent picked: { id, status, createdTime }`.

### 3. Call the resolver **before** consent sync in `handleWebhook`

In the `consentThenCallLogTask` IIFE (~lines 255–289):

- **Before** the `if (consentSyncEnabled)` block, call `resolveCampaignHeader(...)` once (only when `callId && checkCallAllowed`, matching the existing call-log gate). Capture the result.
- Keep the consent sync exactly as is — it still runs next and still feeds `consentRecordId` to the call-log step.
- Pass the pre-computed `{ campaignHeader, customerRec, resultData }` into `syncCallLogToAirtable` as new arguments so the Airtable lookup happens with the **pre-update** consent state.

### 4. Slim down `syncCallLogToAirtable`

Update its signature to accept the pre-computed bundle:

```ts
async function syncCallLogToAirtable(
  payload, conversationLog, phone, callOutcome, callDuration, audioUrl,
  consentRecordId,
  precomputed: { campaignHeader: string; customerRec: any; resultData: any },
)
```

- Remove the inlined `result_data` fetch, `findCustomerRecord` call, and the campaign decision tree (now in the resolver).
- Use `precomputed.campaignHeader` directly when building `Conversation_Logs`.
- Use `precomputed.customerRec` for the existing `Customer: [customerRec.id]` link and the orphan-row guard.
- If `precomputed` is missing (e.g. resolver threw), fall back to recomputing inline so behavior degrades gracefully rather than failing the call-log write.

### 5. Logging

Keep the existing `Campaign detection (primary):` and `DEBUG Airtable Raw:` logs inside the new resolver so the debug surface is unchanged, plus the new `Latest Consent picked:` line from step 2. Add one line in `handleWebhook` after the resolver runs: `Campaign resolved before consent sync: ${campaignHeader}`.

## Out of scope

- `syncConsentToAirtable`, `syncNoticeToAirtable`, AI categorization, retry logic, edge gating (`CheckCall`).
- Frontend, Airtable schema, other edge functions.
- Changing the priority rules themselves — only the **timing** of priority 3 and the **latest-row** selection within it.

## Why this works

Priority 3 still uses Airtable, but it now reads the Customer's consent/policy state **before** the new Consents row is created, and it picks the most recent existing Consents row instead of the rollup's first element. That matches what the bot actually used to drive the conversation, so the campaign label on the new Call Logs row stays consistent with the conversation it describes. No new race is introduced: the consent → call-log ordering inside `consentThenCallLogTask` is preserved, and the call-log create still receives the freshly-minted `consentRecordId`.
