## Goal

Add an API that, given a phone number, looks up the matching Customer row in Airtable, reads the `CheckCall` column, and returns the intent the caller should run next.

## New edge function: `dhipaya-check-intent`

Path: `supabase/functions/dhipaya-check-intent/index.ts`

- POST (also accept GET via `?phone=`) with JSON body `{ "phone": "+6690862213438" }`
- CORS enabled, `verify_jwt = false` (matches existing dhipaya functions).
- Uses existing secrets `AIRTABLE_PAT` and `AIRTABLE_BASE_ID`.

### Flow

1. Validate input with Zod (`phone: string, min 6`).
2. Normalize phone via the same logic as `normalizeThaiPhone` (`+66` / `66` → `0`, strip non-digits, expect 10 digits). On failure → fallback response.
3. Query Airtable `Customer` table:
   ```
   filterByFormula = REGEX_REPLACE({Phone_Number1}&"",'[^0-9]','')='<normalized>'
   maxRecords=1
   fields[]=CheckCall, Phone_Number1
   ```
4. Read `record.fields.CheckCall` (string, trimmed, case-insensitive compare).

### Intent routing

```ts
switch (check) {
  case "N":          return { intent: "consent" };          // Do Not Call → run consent flow
  case "Y":                                                  // generic “OK to call” → default consent
  case "CAMPAIGN2":
  case "2":          return { intent: "campaign2" };
  case "CAMPAIGN3":
  case "3":          return { intent: "campaign3" };
  default:           return { intent: "consent" };           // unknown value → safest default
}
```

Not found / Airtable error:
```json
{ "intent": "consent", "fallback": true, "reason": "not_found" | "airtable_error" }
```
HTTP 200 in all matched cases; 400 only for missing/invalid `phone` input.

### Response shape

```json
{
  "intent": "consent" | "campaign2" | "campaign3",
  "phone": "0908622134",
  "checkCall": "N",
  "matched": true
}
```

## Notes / assumptions

- The exact `CheckCall` values for Campaign 2 / Campaign 3 weren't specified; the switch above accepts the most likely formats (`"campaign2"`, `"2"`, etc.). Easy to tweak once confirmed — single switch block.
- Fallback intent is `consent` (safe: starts with PDPA consent flow) rather than erroring, so the calling client always gets a usable intent.
- No DB migrations; no frontend changes. Pure new edge function.

## Verification

- Deploy `dhipaya-check-intent`.
- `curl_edge_functions` with a known phone to confirm `{ intent: "consent" }` for `CheckCall=N`, and fallback path for an unknown number.
