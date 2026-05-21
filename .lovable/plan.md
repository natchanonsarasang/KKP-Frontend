## Changes to `src/components/DebtorsList.tsx`

### 1. Move "Callback Date" column

Move the column to appear immediately after "Latest Call Status".

- **Header**: move the `<TableHead>` for Callback Date (lines 1346–1354) to right after the "Latest Call Status" head (line 1269).
- **Body**: move the matching `<TableCell>` for `formatThaiBuddhistDate(debtor.date_con)` (lines 1486–1490) to right after the Latest Call Status cell so column order stays aligned.

Resulting order: `# → Contact → Latest Call Status → Callback Date → [variable columns] → Status → Picked → No Pick → Accept → Reject → Other → Calls → Last Contact → Action`.

### 2. Relocate date range calendar filter

- Remove the `<Popover>` date range picker block from the top search/filter bar (lines 1119–1173).
- Insert the same picker into the "Debtor List" card header (around line 1197), placed between the `All Call Statuses` Select and the `Send to Call List` button.

Final header control order: `All Call Statuses → Calendar filter → Send to Call List → Select All`.

State, filter logic, and `dateRange` behavior are unchanged — only the JSX location moves.

### Out of scope

No business logic, query, or styling-system changes beyond minor sizing tweaks (e.g. `h-8` to match the other header controls) so the calendar button fits the compact header row.
