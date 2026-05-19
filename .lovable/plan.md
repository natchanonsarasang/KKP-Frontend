## Goal
Make the two call-status domains — **Main Status** (7 outcomes) and **SubStatus** (8 behaviors) — a single global source of truth so any future change happens in one file and propagates everywhere (analytics charts, debtor list column, filter dropdown, badge tones).

## Two domains (final list)

**Main Status** (collection outcome)
1. Acknowledged
2. Promised to Pay
3. Restructure Requested
4. Callback Scheduled
5. Already Paid
6. Not Reached
7. Refused

**SubStatus** (conversation behavior)
1. Not Convenient
2. Wrong Person
3. Call Later
4. Transfer
5. Background Noise
6. Silence
7. Dropped Call
8. Out of Topic

## Implementation

### 1. Refactor `src/lib/callStatuses.ts` — single source of truth

Add two exported constant arrays with all metadata needed by every consumer:

```ts
export interface StatusDef {
  key: string;            // stable id (e.g. "acknowledged")
  label: string;          // English UI label
  thai: string;           // Thai label
  color: string;          // hex for charts
  tone: CallStatusTone;   // badge tone for DebtorsList
  match: (cat: string) => boolean;  // keyword matcher (EN + TH)
}

export const MAIN_STATUSES: StatusDef[] = [ /* 7 items */ ];
export const SUB_STATUSES:  StatusDef[] = [ /* 8 items */ ];
```

Plus helpers, all driven off these two arrays:
- `resolveMainStatus(rawCategory, ctx?) → StatusDef | null` (ctx carries `picked_up` / call status so "Not Reached" can be inferred).
- `resolveSubStatus(rawCategory) → StatusDef | null`.
- Update `resolveLatestStatusLabel` and `resolveLatestStatusTone` to read from these arrays instead of hard-coded sets/switches.
- Keep `CALL_STATUS_CATEGORIES` for backward compatibility (legacy 12-category list still used by the existing filter dropdown), but mark it as legacy in a comment.

### 2. `src/components/analytics/CallAnalyticsCharts.tsx`

- Delete the local `MAIN_STATUSES` (lines ~580) and `SUB_STATUSES` (lines ~746) arrays.
- Import the new globals from `@/lib/callStatuses`.
- `MainStatusOverview` and `SubStatusOverview` iterate the imported arrays unchanged. Visual layout untouched.
- Remove the older bilingual `categories` block (lines ~470–525) that hard-codes the 9 Thai/English strings, and rebuild it from `SUB_STATUSES` so the legacy outcome chart also picks up new entries automatically.

### 3. `src/components/DebtorsList.tsx`

- Latest Call Status column: replace the bespoke 5-name allow-list with `resolveMainStatus(...)` so the badge reflects the new 7-main domain (with fallback "Other" / "-" preserved). Tone map also driven from `MAIN_STATUSES[i].tone`.
- Status filter dropdown: build options from `[...MAIN_STATUSES, ...SUB_STATUSES]` instead of `CALL_STATUS_CATEGORIES`, so the dropdown stays in sync with the new global lists.

### 4. Out of scope

- No backend / webhook / SQL changes. The webhook keeps writing whatever category string it already writes; only the frontend mapping changes.
- No design changes to charts, cards, or the badge component beyond pulling colors/tones from the constants.
- No new columns, no new filter logic.

## Result
After the refactor, changing a status name, adding a new one, or swapping a color is a one-line edit in `src/lib/callStatuses.ts`. Analytics dashboard, debtor list column, badge color, and filter dropdown all update automatically.
