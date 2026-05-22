## Goal
Add a new "AI Status" column in the Call Queue Completed table (CallList.tsx), positioned immediately after the existing "สถานะ" (Status) column. The column displays `item.ai_category` rendered as a colored badge.

## Changes (src/components/CallList.tsx)

1. **Header row** (around line 2154): Insert a new `<TableHead className="text-xs">AI Status</TableHead>` right after the "สถานะ" `<TableHead>`.

2. **Body row** (around line 2250): Insert a new `<TableCell>` right after `{getStatusBadge(item.status)}` that renders the AI category as a badge.
   - Use the existing taxonomy helpers from `src/lib/callStatuses.ts`:
     - `resolveLatestStatusLabel(item.ai_category)` for the label text (returns "-" when null, Thai/EN label when matched, "Other" otherwise).
     - `resolveMainStatus` / `resolveSubStatus` to pick up the matching `StatusDef.color` so the badge color matches the analytics dashboard taxonomy.
   - When `ai_category` is null/empty → render a muted `-`.
   - When matched → render a `<Badge variant="outline">` with inline color styling driven by the resolved `StatusDef.color` (border + tinted background + text color) so badges stay consistent with the dashboard color scheme.
   - When unmatched (label = "Other") → fall back to a neutral muted badge.

3. **Imports**: Add `resolveMainStatus`, `resolveSubStatus`, `resolveLatestStatusLabel` from `@/lib/callStatuses` (Badge is already imported).

## Out of scope
- Excel export columns (not requested).
- Pending / Calling tabs (they share the same table; ai_category is mostly null there, but the cell will just render "-" — no behavior change needed).
- No changes to data fetching: `ai_category` already exists on `call_list_items` and is selected by current queries.
