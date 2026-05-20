## Goal

Stop discarding `hanged_up` webhook events, count them as incomplete on the Start Calling page, and surface them as a dedicated yellow "HANG UP" card on the Analytics page.

## Changes

### 1. `supabase/functions/voicebot-webhook/index.ts`
- Remove the early-return block (around lines 51–60) that short-circuits when `status` is `hanged_up` / `hangup` / `hung_up`. The webhook will fall through into the normal mapping pipeline.
- In the status mapping block (around lines 82–107), add a branch:
  - `if (rawStatus === "hanged_up" || rawStatus === "hangup" || rawStatus === "hung_up") mappedStatus = "hanged_up";`
- Remove the stale "NOTE: hanged_up ... are filtered out" comment.
- No other mapping, AI-categorization, or persistence logic is touched — the row will now be written to `call_list_items` / `call_attempts` / `call_records` with `status = "hanged_up"` like any other outcome.

### 2. `src/components/CallList.tsx` (Start Calling page)
Scope: the stats block around lines 1485–1530 only.
- Stop excluding `hanged_up` from `visibleCallListItems` so those rows are counted. Drop the `s !== "hanged_up"` / `r !== "hanged_up"` / `!o.includes("hanged")` checks (keep `"incomplete"` filtering untouched).
- Also remove the matching `.not("status", "in", '("hanged_up","incomplete")')` filter and the defensive client-side `it.status !== "hanged_up"` filter from the `call_list_items` fetch (lines 332–349) so the rows reach the page. Leave the `call_records` query at line 453 alone (it doesn't feed the stats).
- In the categorization map, add: `else if (rawStatus === "hanged up" || rawOutcome === "hanged up") resolved = "hanged_up";`
- Add `const hangupCount = categorizedStats.filter(i => i.resolved === "hanged_up").length;`
- Update: `const incompleteCount = noAnswerCount + busyCount + failedCount + rejectedCount + voicemailCount + hangupCount;`
- No UI card is added here — `hangupCount` only feeds the existing Incomplete total displayed at line 1752.

### 3. `src/components/analytics/AnalyticsStats.tsx` (Analytics page)
- Remove the `hanged_up` exclusion from `visibleItems` (lines 18–26); keep the `incomplete` exclusion as-is.
- In the categorization map, add: `else if (rawStatus === "hanged up" || rawOutcome === "hanged up") resolved = "hanged_up";`
- Add `const hangup = categorized.filter(i => i.resolved === "hanged_up");`
- Include it in the incomplete total: `const totalIncomplete = noAnswer.length + busy.length + failed.length + rejected.length + voicemail.length + hangup.length;`
- Add a new card in the breakdown grid (lines 110–127), matching the existing card structure but with a yellow background (e.g. `bg-yellow-100` card + `text-yellow-700` text, following the existing amber/destructive pattern with semantic-friendly Tailwind classes):
  - `{ label: "HANG UP", value: hangup.length, icon: PhoneOff }`
- All other cards, styles, and counters remain unchanged.

## Out of scope

- The other `hanged_up` exclusions in `CallList.tsx` (lines 1485-style filter in unrelated sections, and the `call_records` query filter) are left untouched unless they sit in the stats path described above.
- No changes to `callStatuses.ts`, edge function deployment of unrelated functions, or DB schema.
- No changes to AI categorization prompt logic.

## Verification

- Deploy `voicebot-webhook` and confirm a synthetic `hanged_up` payload now persists to `call_list_items` with `status = "hanged_up"`.
- Start Calling page: `Incomplete` total increases by 1 per hangup row; no new card appears.
- Analytics page: new yellow "HANG UP" card shows the correct count and is included in the Incomplete total.