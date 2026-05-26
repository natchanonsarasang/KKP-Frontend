# Dhipaya Insurance System — Isolated `/dhipaya` Module

A complete clone of the current Dashboard flow, living at `/dhipaya`, backed by **Airtable** (Base `appERiu56nzFnX26r`) instead of Supabase. Shares Lovable Cloud login but gated by a new `dhipaya` role. Zero coupling to the Finlution data layer.

## 1. Architecture

```text
/dhipaya  ──►  DhipayaDashboard (cloned UI shell)
                ├── Customers  (was: Debtors)
                ├── Call List  (calling queue, voicebot)
                └── Analytics  (call_logs / call_quality_evaluations)
                         │
                         ▼
                Supabase Edge Function: `dhipaya-airtable`
                         │  (auth-checked + role-checked proxy)
                         ▼
                Airtable Connector Gateway
                  Base: appERiu56nzFnX26r
                  Tables: customers, policies, installment_plans,
                          campaigns, consents, call_logs,
                          call_quality_evaluations, bot_sessions,
                          installment_kbs, agents
```

Key isolation guarantees:
- No reads/writes to the existing `debtors`, `call_list_items`, `call_attempts`, `workspaces` tables from any `/dhipaya/*` code.
- Airtable credentials live only in the edge function (gateway pattern).
- A new `app_role` value `'dhipaya'` gates route access.

## 2. Setup steps

1. **Connect Airtable** via `standard_connectors--connect` (Lovable Airtable connector).
2. **DB migration**: extend `app_role` enum with `'dhipaya'`; admin panel can assign it.
3. **Edge function** `dhipaya-airtable`:
   - Verifies JWT, checks caller has `dhipaya` (or `admin`) role.
   - Generic actions: `list`, `get`, `create`, `update`, `delete` against any allow-listed table.
   - Maps Airtable fields ↔ JSON shape used by the UI.
4. **Route + guard**: `/dhipaya` mounted in `App.tsx`, wrapped in `DhipayaGuard` that calls `has_role(uid, 'dhipaya')`.

## 3. Folder layout (all new, no edits to existing components)

```text
src/
  pages/
    Dhipaya.tsx                       # entry route, auth + role guard
  features/dhipaya/
    DhipayaDashboard.tsx              # 3-step shell (cloned from Dashboard.tsx)
    CustomersList.tsx                 # list, filter, import (cloned DebtorsList)
    CallList.tsx                      # calling queue (cloned CallList)
    Analytics.tsx                     # KPI cards + charts (cloned CallDashboard)
    api/airtable.ts                   # typed client → calls dhipaya-airtable fn
    types.ts                          # Customer, Policy, CallLog, ...
    fieldMap.ts                       # Airtable field ↔ UI field mapping
supabase/functions/
  dhipaya-airtable/index.ts           # gateway proxy
```

## 4. Field mapping (initial)

| UI field        | Airtable table.field                  |
|-----------------|----------------------------------------|
| id              | record id                              |
| firstName       | customers.first_name                   |
| lastName        | customers.last_name                    |
| phone1/2/3      | customers.phone_number1/2/3            |
| consentStatus   | consents.consent_status                |
| policyNumber    | policies.policy_number                 |
| policyStatus    | policies.policy_status                 |
| renewalPremium  | policies.renewal_premium               |
| outstanding     | policies.outstanding_balance           |
| campaign        | campaigns (linked)                     |
| routingGroup    | customers.routing_group                |
| duplicateFlag   | customers.duplicate_flag               |

`fieldMap.ts` centralises this so renaming an Airtable column is a one-line change.

## 5. Out of scope (this round)
- Excel import for Dhipaya (Airtable is source of truth; we can add CSV→Airtable later).
- Webhooks writing call results back into Airtable (call_logs sync) — designed but built next iteration.
- New design language; reuses existing tokens/components.

## 6. Open question
You listed tables but I will only wire **customers + policies + consents + call_logs** in v1 so we can validate the gateway end-to-end. Confirm or tell me which other tables you need rendered immediately.
