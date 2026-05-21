## Goal
Remove the global exclusion that skips `hanged_up` records in the Analytics charts so hang-up calls are counted in the outcome/status breakdowns (matching `AnalyticsStats.tsx`, which already counts them).

## Scope
Only `src/components/analytics/CallAnalyticsCharts.tsx`. No backend, no other files. The `"incomplete"` exclusion stays in place.

## Changes

**1. `OutcomeDistributionChart` (lines ~213-220)**
Drop the `hanged` checks; keep only the `incomplete` skip:
```ts
if (rawStatus === "incomplete") return;
```
This allows hang-ups to fall through into the existing categorization (resolved as `hanged_up`/equivalent outcome).

**2. `MainStatusOverview` (line ~600)**
Replace:
```ts
if (s === "hanged_up" || s === "incomplete" || r === "hanged_up" || r === "incomplete" || o.includes("hanged")) return;
```
with:
```ts
if (s === "incomplete" || r === "incomplete") return;
```

**3. `SubStatusOverview` (line ~696)**
Same replacement as #2.

## Notes
- `AnalyticsStats.tsx` already counts `hanged_up` — no change needed there beyond optionally updating the comment, but I'll leave it untouched unless you want it cleaned up.
- The `OutcomeDistributionChart` categorization logic does not currently have an explicit `hanged_up` branch — hang-ups will resolve via `picked_up`/status fallbacks. If you want a dedicated "Hang up" slice in that pie chart, say so and I'll add it.

## Verification
- Build passes.
- Hang-up records appear in Main Status / Outcome charts alongside other completed-call outcomes.