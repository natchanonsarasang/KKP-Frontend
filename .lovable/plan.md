## Problem

In `src/components/DebtorsList.tsx`, the Export Excel rows show `Picked = 0`, `No Pick = 0`, `Calls = 0` because they read from the `callStats` React-Query cache (line 994–996). That cache:

- can be `undefined` if the export runs before the query resolves,
- is keyed by `phone_number` and silently returns `0` when a phone isn't present,
- is refetched on a 5s interval so it can be momentarily empty.

## Fix

Compute Picked / No Pick / Calls **inside `handleExportExcel`**, directly from `call_records`, scoped to the phone numbers actually being exported. No reliance on the cached query.

### Steps (single file: `src/components/DebtorsList.tsx`, `handleExportExcel`)

1. After fetching `all` debtors, collect unique `phones = [...new Set(all.map(d => d.phone_number).filter(Boolean))]`.
2. Query `call_records` in chunks of 500 phones at a time using `.in('phone_number', slice).select('phone_number, status')`, paginated with `.range()` of 1000 rows to defeat the Supabase default cap.
3. Reduce into `exportStats: Record<phone, { total, picked_up, not_picked_up }>` using the same status mapping the on-screen `callStats` uses:
   - `confirmed | declined | no_response | completed` → `picked_up++`
   - `no_answer | failed` → `not_picked_up++`
   - every record → `total++`
4. In the row mapper, replace the three `callStats?.[d.phone_number]?.*` lookups with `exportStats[d.phone_number]?.*`.

### Why this works

- The export becomes self-contained: it always sees fresh, complete stats for exactly the exported set.
- `.in('phone_number', …)` keeps the payload small even with 5k debtors (one batched fetch per ~500 phones).
- No schema change, no new RPC, no impact on the on-screen table.

## Out of scope

- Reworking the on-screen `callStats` query.
- Backfilling the stored `picked_up_count` / `not_picked_up_count` counters on `debtors`.
