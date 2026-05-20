## Goal
Treat silent pickups (`User: TIMEOUT`) as `completed` instead of `no_answer` in the webhook's status mapping.

## Change
In `supabase/functions/voicebot-webhook/index.ts`, inside the `mappedStatus` block (the `else if (rawStatus === "completed")` branch), replace:

```ts
mappedStatus = hasUserSpoken ? "completed" : "no_answer";
```

with:

```ts
mappedStatus =
  (hasUserSpoken || isSilence)
    ? "completed"
    : "no_answer";
```

`isSilence` is already defined just above this block, so no other code changes are required.

## Deploy
Redeploy the `voicebot-webhook` edge function.

## Out of scope
No changes to AI categorization (Silence rule still applies), no UI changes, no other branches in the mapping block.