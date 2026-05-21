## Add `date_today` to voicebot call variables

**File:** `supabase/functions/voicebot-make-call/index.ts`

**Change:** Inject a Thai-formatted current date (Bangkok timezone, Buddhist Era) into the `variables` payload sent to the voicebot API, so the bot can reference today's date in its script.

### Implementation

Inside `prepareVoicebotVariables(input)`, after the existing `policy_no` handling, compute and assign `date_today`:

```ts
const date_today = new Intl.DateTimeFormat('th-TH', {
  timeZone: 'Asia/Bangkok',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  calendar: 'buddhist',
}).format(new Date()).replace(/(\S+)\s/, '$1 ที่ ');

vars.date_today = date_today;
```

Result: `vars` returned by `prepareVoicebotVariables` now includes `date_today` (e.g. `"วันจันทร์ ที่ 16 พฤษภาคม 2569"`), which then flows into `callPayload.variables` unchanged.

### Not touched

- `BOT_ID`, `CALL_API_URL`, bearer token
- ASR / VAD settings
- `policy_no` / `policy_no_raw` logic
- CORS, error handling, request/response shape
- `supabase/config.toml` and any other file