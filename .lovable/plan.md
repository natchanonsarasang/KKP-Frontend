## Goals

Bring the Dhipaya Call List to parity with the default `src/components/CallList.tsx` in behavior, persistence, and look — minus workspace/template UI which the Dhipaya flow doesn't use.

## Changes

### 1. Auto-navigate after "Send to Call List" (CustomersList)

In `src/features/dhipaya/CustomersList.tsx`, after a successful `addToCallQueue(...)`:
- Call the existing `onNextStep()` prop to switch the Dhipaya dashboard tab from **Customers** → **Call List**.
- Keep the toast confirmation. Drop the now-redundant "Next: Call List" button (or keep it as a secondary affordance — recommend removing to avoid duplication).

### 2. Transition to "Calling" tab when calls start (CallList)

In `src/features/dhipaya/CallList.tsx`:
- Replace `defaultValue` on `<Tabs>` with a controlled `value` + `onValueChange` driven by local state.
- In `handleStart()`, after `startCalling()` dispatches successfully, set the active tab to `"calling"`.
- Also auto-switch to `"calling"` whenever `counts.calling` transitions from 0 → >0 (covers the brief gap before `dialOne` updates status).
- When the queue finishes (no calling, no pending, completed > 0), auto-switch to `"completed"`.

### 3. Persist completed call data like the default page (queue store)

The default page persists every call via three tables: `call_records` (we already write), plus richer fields the webhook fills in (`result_data`, `call_duration`, `appointment_*`, conversation log / audio URL stored in notes).

Update `src/features/dhipaya/lib/callQueueStore.ts`:

- **Pre-insert with full context** in `dialOne`:
  - Include `phone_number`, `botnoi_call_id`, `user_id`, `workspace_id`, `status: 'pending'`.
  - Add a minimal `result_data` seed with the customer reference (Airtable record id, name, policy_number) so completed rows can be traced back to a Dhipaya customer in reports.
- **Capture webhook completion fully** in `applyCallRecordUpdate`:
  - Pull `result_data.conversation_log`, `result_data.audio_url`, `call_duration`, `appointment_date`, `appointment_time` from the updated `call_records` row and store on the queue row (extend `QueueRow` with `audioUrl?`, `conversationLog?`, `callDuration?`).
  - Keep the existing status mapping; ensure `hanged_up`, `voicemail`, `busy`, `rejected` are surfaced as failed (already done) and `confirmed` / `declined` / `no_response` / `completed` are surfaced as success with `callOutcome` set from `action || status`.
- **Reconcile fetches the same extra fields** (`select` list extended).
- **Resolve `workspace_id` properly** — replace the `localStorage.getItem("currentWorkspaceId")` hack by accepting an optional `workspaceId` parameter on `startCalling`/`dialOne` (passed from the component, which already has it via `useWorkspace()`).

This gives the same long-term persistence guarantee as the default page: every dispatched call has a `call_records` row that the webhook completes with transcript, audio, duration and outcome, queryable later by workspace.

### 4. UI/UX parity with default CallList

Refactor `src/features/dhipaya/CallList.tsx` to mirror the default page structure, minus workspace/template controls:

- **Header**: title + subtitle, action cluster on the right with Start / Stop / Clear completed / Clear all (already present, restyle to match).
- **Stat strip**: reuse the same labels/order as default — Total, Pending, Calling (highlight when active), Success, Failed/No Answer. Match card density and typography.
- **Progress card**: keep the in-progress banner + Progress bar + "you can leave this page" hint (already present, ensure same spacing/typography as default).
- **Tabs**: Pending / Calling / Completed (controlled, see #2).
- **Table columns**: Name, Phone (with per-row dropdown when pending), Policy, Status (+ outcome subtext), Duration, Actions. For completed rows, show a **View transcript** button (opens a Dialog with conversation log + audio player) — mirrors `handleViewTranscript` in default.
- **Transcript dialog**: lightweight version of the default page's dialog — render `conversationLog` as preformatted text and `audioUrl` in an `<audio controls>` element. No need to support legacy notes formats since Dhipaya rows always come from the JSON `result_data`.
- **Omit on purpose** (per request): workspace switcher, template selector, scheduled time picker, settings dialog, filter dialog, Excel/import buttons, token coin badge, retry-pending UI, admin impersonation controls.

Keep all styling on semantic tokens (`bg-primary`, `text-muted-foreground`, etc.) — no raw colors.

## Files touched

- `src/features/dhipaya/CustomersList.tsx` — auto-navigate on Send.
- `src/features/dhipaya/CallList.tsx` — controlled tabs, auto-switch logic, parity layout, transcript dialog, render new fields.
- `src/features/dhipaya/lib/callQueueStore.ts` — accept workspaceId param, richer pre-insert, capture webhook fields, extend `QueueRow`.

## Out of scope

- No DB migrations (existing `call_records` columns + `result_data` JSON cover all new fields).
- No changes to `voicebot-webhook` (already writes everything we now read).
- No changes to Analytics tab.
