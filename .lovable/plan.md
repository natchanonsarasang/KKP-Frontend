## Add Export Excel button to DebtorsList

Add an **Export Excel** button placed immediately after the existing **Import Excel** button in the DebtorsList header. Clicking it exports all debtor rows matching the current filters (across all pages) as a `.xlsx` file with UTF-8 BOM for proper Thai text rendering.

### UI change
- File: `src/components/DebtorsList.tsx` (header actions, around line 1104)
- Add `<Button variant="outline">` with a `Download` icon labeled **Export Excel**, inserted directly after the Import Excel button.
- Disable while exporting; show a spinner + "Exporting..." label during the fetch.

### Data fetching (all filtered rows, all pages)
On click, run a paged Supabase query that mirrors the existing list query in `debtorsData` but **ignores the current page** and pulls every matching row:

- Reuse the same filter logic already in the file: workspace/user scope, `searchQuery`, `statusFilter`, `callStatusFilter` (with `calledIds` from `latestStatusByDebtor`), and the active sort.
- Loop in batches of 1000 using `.range(from, to)` until fewer than 1000 rows return (same pattern used in `statsData` around lines 856-880).
- Also fetch `callStats` and `latestStatusByDebtor` for the full result set — `latestStatusByDebtor` is already a workspace-wide map, and `callStats` is keyed by phone number, so existing in-memory maps can be reused; only `debtors` itself needs paged fetching.

### Columns (in order)
1. **Contact** — `phone_number` (raw, unmasked for export)
2. **Name** — `variables.name`
3. **Latest Call Status** — English label from `resolveLatestStatusLabel(latestStatusByDebtor.get(debtor.id))`
4. **Callback Date** — `formatThaiBuddhistDate(debtor.date_con)`
5. **Policy Number** — `variables.policy_no`
6. **Outstanding Amount** — `variables.outstanding_amount`
7. **Overdue Installments** — `variables.overdue_installments`
8. **Due Date** — `[due_date, due_month, due_year]` joined by space, empties skipped
9. **Picked** — `picked_up_count`
10. **No Pick** — `not_picked_up_count`
11. **Calls** — `contact_attempts`
12. **Last Contact** — formatted from `last_contact_at` (Thai locale, same as table cell)

Empty values rendered as `"-"`.

### File generation
- Use the already-imported `xlsx` package (no new deps).
- Build sheet via `XLSX.utils.json_to_sheet(rows)`, append to a new workbook as `"Debtors"`.
- Serialize with `XLSX.write(wb, { bookType: 'xlsx', type: 'array' })`.
- Wrap output in a `Blob` whose first chunk is the UTF-8 BOM (`\uFEFF`) so downstream tools detect UTF-8 and render Thai characters correctly.
- Trigger download via temporary anchor; filename: `debtors-YYYY-MM-DD.xlsx`.
- `toast.success("Exported N debtors")` on completion, `toast.error(...)` on failure.

### Scope
- Frontend/presentation only. No schema, RLS, or edge-function changes.
- No new packages.
