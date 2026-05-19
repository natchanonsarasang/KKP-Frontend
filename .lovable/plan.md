## Goal
Turn the "Latest Call Status" cell from plain text into a colored **badge** that visually signals whether the debtor should be called back, so reps can scan the list and immediately spot priority follow-ups.

## Priority / color mapping

Map each of the 6 possible labels (5 main statuses + "Other" + "-") to a badge variant with semantic colors from the design system (`success`, `warning`, `destructive`, `muted`, `secondary`). Color encodes call-back urgency, not the status itself.

| Label | Should call back? | Badge style | Intent |
|---|---|---|---|
| Call Back Later | **YES — high priority** | solid `warning` (amber) + subtle pulse/ring | Strongest visual pull |
| Requested Agent Transfer | **YES — high priority** | solid `warning` | Needs human follow-up |
| Not Convenient | YES — medium | `secondary` with warning text | Try again later |
| Appointment Scheduled | No (already handled) | `success` (green, soft) | Done — de-emphasized |
| Wrong Person | No (do not call) | `destructive` outline (red, soft) | Skip / clean data |
| Other | Neutral | `outline` / muted | No clear signal |
| – (never called) | Neutral | muted dash, no badge chrome | Keep visually quiet |

## Implementation

1. **Extend `src/lib/callStatuses.ts`** — add a small helper:
   ```ts
   export type CallStatusTone = "callback" | "transfer" | "soft-callback" | "done" | "skip" | "other" | "none";
   export function resolveLatestStatusTone(rawCategory): CallStatusTone
   ```
   so the tone logic lives next to the label logic (single source of truth).

2. **Update `src/components/DebtorsList.tsx`** (around lines 1253–1257):
   - Replace the plain `<span>` with a `<Badge>` whose `className` is chosen from a tone→class map using semantic tokens (`bg-warning/15 text-warning border-warning/30`, `bg-success/15 text-success`, etc. — all HSL via existing tokens).
   - For "Call Back Later" / "Transfer" add a small leading dot (`<span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />`) inside the badge to make priority pop.
   - For "-" (never called) keep a plain muted dash — no badge — so the eye is drawn only to actionable rows.

3. **Header tweak (optional, minor)**: keep column title as-is; ensure cell has `whitespace-nowrap` so badges don't wrap on narrow viewports.

## Out of scope
- No data-model, query, filter, or backend changes.
- No changes to the filter dropdown in the card header.
- No new columns or reordering.
