## Add `date_con` (callback date) to Debtors

Extract a callback date from each call's `conversation_log` via Lovable AI, save as ISO `YYYY-MM-DD` on `debtors.date_con`, and show it in the Debtors List as a Thai Buddhist-era date.

### 1. Database migration

Add a nullable `date_con` (type `date`) column to `public.debtors`. No RLS or trigger changes needed (existing policies cover it).

```sql
ALTER TABLE public.debtors ADD COLUMN date_con date;
```

### 2. Webhook extraction — `supabase/functions/voicebot-webhook/index.ts`

Add a helper `extractCallbackDate(conversationLog, referenceDate, apiKey)` that:

- Returns `null` if no `conversation_log` or no `LOVABLE_API_KEY`.
- Uses **reference date** = the first timestamp parsed from the log (lines start with `YYYY-MM-DD HH:MM:SS`); falls back to `new Date()` if none found.
- Calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with structured JSON output (`{ "date_con": "YYYY-MM-DD" | null }`) and a Thai-aware system prompt covering:
  - Exact date stated by customer → use as-is (convert Buddhist year if given).
  - `พรุ่งนี้` → +1 day, `มะรืน(นี้)` → +2 days.
  - `อีก X วัน` → +X days.
  - `สัปดาห์หน้า` / `อาทิตย์หน้า` → +7 days.
  - `เดือนหน้า` → +30 days.
  - Anything vague / no date → `null`.
  - All math is performed relative to `referenceDate` in Asia/Bangkok.
- Validates the model's output with a `YYYY-MM-DD` regex; otherwise returns `null`.
- Handles `429` / `402` gracefully (log + return `null`, do not throw — webhook must always succeed).

Call site (inside the debtor-update block around line 404, right after `updateData` is built):

```ts
const dateCon = await extractCallbackDate(conversationLog, payload, LOVABLE_API_KEY);
if (dateCon !== undefined) updateData.date_con = dateCon; // null clears, string sets
```

We always write `date_con` (including `null`) so a later call without a callback resets the previous value.

### 3. Frontend — `src/components/DebtorsList.tsx`

- Extend the `Debtor` type (~line 144) with `date_con: string | null`.
- Include `date_con` in the `select(...)` used by the debtors query.
- Add a new sortable column **"Callback Date"** in the table header right after **Last Contact** (before the Action column).
- Render the cell using a new helper `formatThaiBuddhistDate(iso)` in `src/lib/debtorVariables.ts`:

```ts
// → "วันจันทร์ที่ 13 เมษายน 2568"
export function formatThaiBuddhistDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(`${iso}T00:00:00+07:00`);
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    timeZone: "Asia/Bangkok",
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(d).replace(/(\S+)\s/, "$1ที่ ");
}
```

Cell shows `-` when `date_con` is null; otherwise the Thai-formatted string.

### Out of scope (not touched)

- `supabase/functions/voicebot-make-call/index.ts`, other edge functions.
- RLS policies, triggers.
- Any other UI surface (CallList, Reports, Analytics).
- Auto-scheduling future calls based on `date_con` (storage + display only for now).
