## Goal
Make the Refresh button in `src/features/dhipaya/CustomersList.tsx` a true sync so the table always matches Airtable, with no stale rows or ghost selections.

## Changes (single file: `src/features/dhipaya/CustomersList.tsx`)

1. **Force sync handler**
   - Import `useQueryClient` from `@tanstack/react-query`.
   - Add `const queryClient = useQueryClient();`.
   - Create `handleSync`:
     - `await queryClient.invalidateQueries({ queryKey: ["dhipaya-customers"] })` (purges all pages of the query).
     - `await refetch()` to guarantee a fresh network call for the current page.
   - Wire Refresh button `onClick={handleSync}`.

2. **Cache freshness**
   - Add `staleTime: 0` and `gcTime: 0` to the `useQuery` config so cached pages cannot serve stale data after invalidation. `invalidateQueries` already forces a refetch of active queries, but `staleTime: 0` ensures any remount/page-change also re-hits the network. No `queryFn` change needed — `listCustomers` already calls the Airtable proxy directly.

3. **Reconciliation of `selectedIds`**
   - Add a `useEffect` that runs when `customers` changes:
     - Build `currentIds = new Set(customers.map(c => c.id))`.
     - If any `selectedIds` entry is not in `currentIds`, set `selectedIds` to the filtered subset.
   - This drops ghost selections for rows deleted in Airtable. Scoped to the current page's customers (matches how selection already works per page).

4. **UI feedback during sync**
   - Button already uses `disabled={isFetching}` and a spinning icon via `animate-spin` when `isFetching`. Keep that; it will also reflect the invalidation-triggered refetch. Update the label to "Sync" (or keep "Refresh" — see question below) and show "Syncing…" while `isFetching`.

## Out of scope
- No changes to `listCustomers` / `dhipaya-airtable` edge function.
- No changes to the call queue or other tabs.

## Open question
- Rename the button to "Sync" to match the new semantics, or keep the label "Refresh"?
