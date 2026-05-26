# Unify Dhipaya UI with Main Dashboard

Refactor `src/features/dhipaya/CallList.tsx` and `src/features/dhipaya/Analytics.tsx` to mirror the visual language of `src/components/CallList.tsx` and `src/components/reports/CallReportDashboard.tsx`. Data flow, API calls, store, types, and webhook logic stay untouched.

## Scope

In: visual structure, layout, typography, spacing, icons, buttons, cards, tabs, badges.
Out: Supabase queries, `callQueueStore`, Airtable `listCallLogs`, webhook handling, types.

## CallList.tsx — high-density action bar + stat grid

1. Header row reorganized to match main `CallList`:
   - Left: title + subtitle aligned with main dashboard typography.
   - Right action cluster: `Refresh`, `Clear completed`, `Clear all`, then primary `Start Calling (n)` / destructive `Stop`. Same `Button` sizes (`size="sm"` for secondaries, default for primary) and icon-left pattern.
   - Add a `Refresh` button that re-runs `reconcileCallingRows()` (existing function — no new data logic).

2. KPI strip rebuilt as a 5-column responsive `Card` grid (`grid-cols-2 md:grid-cols-5`) mirroring `CallReportDashboard` stat cards:
   - Each card: icon tile (10x10 rounded bg-primary/10), uppercase label, large numeric value.
   - Cards: Total, Pending (Clock), Calling (Phone, highlighted ring when active), Success (CheckCircle, success tone), Failed/No Answer (AlertCircle, destructive tone).

3. In-progress banner kept but restyled as a `Card` with `CardHeader`/`CardContent`, progress bar inside, identical to the active-session card pattern in main `CallList`.

4. Tabs + Table:
   - Wrap the `Tabs` in a `Card` shell (`Card` → `CardHeader` with `TabsList` → `CardContent` with `Table`) to match the framed look of the main dashboard tables.
   - Table density and column alignment matched to main: condensed row padding, monospaced phone, right-aligned actions, status badge + sub-label stack identical pattern.
   - Empty state inside the card uses the same `Inbox` icon + centered copy treatment as main.

5. Transcript `Dialog` already matches — keep, only adjust header spacing/typography to match main's transcript dialog (icon + title row).

## Analytics.tsx — card widgets, not a text list

1. Header row matches main dashboard analytics: title left, right-side action cluster with `Refresh` button (re-runs the existing `useQuery`'s `refetch`). Keep the small "Airtable" badge but move it next to the title in the same spot the main uses for source/period chips.

2. KPI grid: keep the 4 existing stats (Total / Answered / No Answer / Avg Duration) but render them with the exact StatCard composition from `CallReportDashboard`:
   - Icon tile, uppercase tracking-wide label, 2xl semibold value, optional sub-line.
   - Color-coded icon tiles: primary (Total), success (Answered), muted (No Answer), warning (Avg Duration).
   - Add a 5th card: Pickup Rate (`answered / total`) — derived in component, no new API call.

3. Replace the "Recent Calls" `<ul>` with a `Card` containing a proper `Table` (Outcome, Called At, Duration) styled identically to the main analytics tables. Use `Badge` for outcome with status tone, formatted timestamp, mono duration. Keep the same `listCallLogs` data — just render differently.

4. Loading state: replace centered spinner with `Skeleton` rows in the stat grid and table, matching the main dashboard's loading pattern.

5. Empty state: card with `Inbox` icon + descriptive copy, matching main pattern.

## Shared visual tokens

- Spacing: `space-y-6` page rhythm, `gap-4` between cards, `p-4`/`p-6` card padding per main usage.
- Typography: `text-2xl font-semibold tracking-tight` page title, `text-xs uppercase tracking-wide text-muted-foreground` for stat labels.
- All colors via existing semantic tokens (`primary`, `success`, `destructive`, `warning`, `muted`) — no raw hex.
- Icons from `lucide-react`, sized `w-4 h-4` in buttons, `w-5 h-5` in stat tiles.

## Files touched

- `src/features/dhipaya/CallList.tsx` — JSX/markup restructure only. `useQueueRows`, `startCalling`, `stopCalling`, `applyCallRecordUpdate`, realtime subscription, all imports from `callQueueStore` stay unchanged.
- `src/features/dhipaya/Analytics.tsx` — JSX/markup restructure only. `useQuery` + `listCallLogs` call unchanged.

## Out of scope (explicitly preserved)

- `callQueueStore.ts`, `api/airtable.ts`, `fieldMap.ts`, `types.ts`, webhooks, edge functions, DB schema, `CustomersList.tsx`, `DhipayaDashboard.tsx` step indicator (already unified in prior turn).
