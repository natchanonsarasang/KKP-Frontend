## Goal

Prevent the classifier from labeling calls as **"Planned More Than 3"** when the customer's stated timeframe is actually within 3 days (e.g. "อีก 3 วัน", "3 วัน", "ภายใน 3 วัน", "ไม่เกิน 3 วัน").

## Change

In `supabase/functions/voicebot-webhook/index.ts`, update the `systemPrompt` inside `classifyCall` (around lines 642–653) to make the ≤3-day vs >3-day boundary explicit and unambiguous.

### Edits to rule **3. PAYMENT CLASSIFICATION (ONLY AFTER DISCLOSURE)**

Refine the bullets so the boundary is strictly enforced:

- **"Promised to Pay"** → commitment is **within ≤ 3 days** from the call date (inclusive of exactly 3 days).
- **"Planned More Than 3"** → commitment is **strictly > 3 days** from the call date (i.e. 4 days or more).

Add an explicit sub-rule:

> **3-DAY BOUNDARY RULE (STRICT):**
> Any of these Thai phrasings MUST be treated as **≤ 3 days** and therefore classified as **"Promised to Pay"** (assuming debt details were disclosed and a commitment was made). They MUST NEVER be classified as "Planned More Than 3":
> - "อีก 3 วัน"
> - "3 วัน"
> - "ภายใน 3 วัน"
> - "ไม่เกิน 3 วัน"
> - any equivalent phrasing meaning "within / no more than / up to 3 days"
>
> Only choose **"Planned More Than 3"** when the customer explicitly commits to a date that is **4 or more days** after the call date (e.g. "อีก 5 วัน", "อาทิตย์หน้า", "สิ้นเดือน", a specific date > 3 days out).

### Edits to rule **4. CLASSIFICATION LOGIC SUMMARY**

Update the second bullet for clarity:

- IF (Debt details disclosed AND payment committed) → **"Promised to Pay"** (≤ 3 days, inclusive) or **"Planned More Than 3"** (> 3 days, i.e. ≥ 4 days).

## Files

- `supabase/functions/voicebot-webhook/index.ts` — prompt text only, no logic changes.

## Out of scope

No DB, UI, or status-taxonomy changes. `src/lib/callStatuses.ts` is unchanged.
