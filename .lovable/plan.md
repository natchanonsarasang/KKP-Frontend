# Add Date Range Filter for Last Contact Date

Add a date range picker filter to `src/components/DebtorsList.tsx` that filters debtors by `last_contact_at`.

## Scope

Only `src/components/DebtorsList.tsx` is modified. No changes to table columns, existing Status/Call Status filters, sort logic, or other files.

## UI

Placement: header row immediately after the "All Status" `<Select>` (after line 1099), before the loader/results count.

A single shadcn `<Popover>` whose trigger is a `<Button variant="outline">` styled to match the adjacent dropdown height/width:

- Empty state label: `"Filter by date"` with a `CalendarIcon`
- Set state label: `"<from> - <to>"` formatted as `d MMM yyyy` via `date-fns/format` (e.g. `21 May 2026 - 21 May 2026`); if `from === to`, still render the same `"<date> - <date>"` pattern per spec
- When a range is set, show a small `×` button inside the trigger area that clears the range and stops propagation so the popover does not open

Popover content uses shadcn `<Calendar mode="range" numberOfMonths={2} />` with `className="p-3 pointer-events-auto"`, `selected={dateRange}`, `onSelect={setDateRange}`, and `initialFocus`.

## State

```ts
const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
// DateRange from "react-day-picker": { from?: Date; to?: Date }
```

Reset `page` to 1 whenever the range changes (same pattern used by `handleStatusChange`).

## Filter logic

Extend the existing `debtors` query (around line 239):

- Add `dateRange?.from?.toISOString()` and `dateRange?.to?.toISOString()` to the `queryKey`
- Inside the query builder, when `dateRange?.from` is set: `query = query.gte("last_contact_at", startOfDay(from).toISOString())`
- When `dateRange?.to` is set: `query = query.lte("last_contact_at", endOfDay(to).toISOString())`
- If only `from` is set (single-day selection in progress), apply just the `gte`. Single-day filter = `from === to`, both bounds applied.

`startOfDay` / `endOfDay` come from `date-fns` (already a transitive dep via shadcn calendar; will import explicitly).

## Imports to add

- `Popover, PopoverContent, PopoverTrigger` from `@/components/ui/popover`
- `Calendar` from `@/components/ui/calendar`
- `CalendarIcon`, `X` from `lucide-react`
- `format, startOfDay, endOfDay` from `date-fns`
- `type DateRange` from `react-day-picker`

## Out of scope

- No DB schema changes
- No edits to other files
- No changes to existing Status / Call Status filters, sorting, columns, or row rendering
