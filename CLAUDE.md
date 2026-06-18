# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev        # Vite dev server with HMR
npm run build      # production build
npm run build:dev  # build in development mode
npm run lint       # ESLint over the repo
npm run preview    # serve the production build
```

- No test runner is configured. There is **no** automated test suite and no `test` script — see the warning about `src/test/` below.
- A `bun.lockb`/`bun.lock` exists, so `bun install` / `bun run <script>` also work, but the README documents the npm flow.
- Path alias: `@/` → `src/` (configured in `vite.config.ts` / `tsconfig`). Import as `@/components/...`, `@/lib/...`, etc.

## ⚠️ `src/test/` is NOT a test directory

`src/test/` is a **duplicated copy of `src/components/`** that powers the `/test` route (`src/pages/test-Dashboard.tsx`, the `TestDashboard` component). It is a parallel UI surface used for in-progress work, not unit tests. Treat it as production component code. When editing one, check whether the original under `src/components/` needs the same change — they drift independently.

`src/test/MockContexts.tsx` provides `useAdmin`/`useWorkspace` fallbacks so the `/test` page renders even when no user is signed in (returns a mock admin user + workspace). Note that `test-Dashboard.tsx` currently imports the *real* contexts from `@/contexts/...`, not these mocks.

## Active refactor goal

Migrate the data layer from direct Supabase table queries to the **Callecto Go external API**, with one exception: **authentication stays on Supabase**. Supabase Auth remains the identity provider — the Go API does not issue tokens; it *validates* the Supabase JWT (its JWKS points at the same Supabase project). So the frontend keeps signing in via Supabase and sends the Supabase access token as `Authorization: Bearer <token>` to the Go API. The `profiles` and `user_roles` tables read by `AdminContext` also stay on Supabase.

**Current scope (only touch these):**
- `src/test/` (the entire directory)
- `src/contexts/WorkspaceContext.tsx`
- `src/pages/test-Dashboard.tsx`

**Tables to migrate** to the Go API (move off `supabase.from(...)`):
`debtors`, `call_list_items`, `call_attempts`, `call_records`, `call_sessions`, `workspaces`, `workspace_members`.

`call_templates` and `call_tokens` are queried in `src/test/` but have no Go endpoint. **Do not read either from Supabase.** Stub them: `call_templates` → `null`, `call_tokens` → `0`. Remove their `supabase.from(...)` calls in scope and substitute these constants.

`workspaces`/`workspace_members` **do** migrate (this is why `WorkspaceContext` is in scope), even though they are workspace/membership data.

### The Go API: `C:\Users\nonss\Desktop\botnoi-work\callecto-api`

Go + Fiber + MongoDB service (`callecto_db`). See its own `CLAUDE.md` for details. Key facts for integrating from this frontend:
- Base URL: `http://localhost:1818`, all routes under `/api/v1` (port from the API repo's `.env`).
- Every data route is JWT-protected and validates the **Supabase** access token — send `Authorization: Bearer <supabase access_token>`.
- Endpoints (`callecto-api/src/gateways/route.go`), all REST-ish:
  - `/api/v1/debtors` — `POST /`, `GET /workspace/:workspace_id`, `GET /:id`, `PUT /:id`, `DELETE /:id`
  - `/api/v1/call-list-items` — same shape (`GET /workspace/:workspace_id`, CRUD by `:id`)
  - `/api/v1/call-attempts` — CRUD, plus bulk `PUT /` (update multiple), `GET /workspace/:workspace_id`
  - `/api/v1/call-sessions` — `POST /`, `GET /`, `GET /:id`, `PUT /:id`, `DELETE /:id`
  - `/api/v1/call-records` — `POST /`, `GET /`, `GET /:id`, `PUT /:id`, `DELETE /:id`
  - `/api/v1/workspaces` — `POST /`, `GET /`, `GET /:id`, `PUT /:id`, `DELETE /:id`
  - Also `POST /api/v1/voicebot/make-call`, `POST /api/v1/call-process`, and the unauthenticated `POST /api/v1/webhooks/botnoi`.

**Migration status:** `src/test/` and `WorkspaceContext` are migrated off direct Supabase table access. `src/test/api/` holds the client + typed resource modules (`workspaces`, `debtors`, `callListItems`, `callAttempts`, `callRecords`, `callSessions`, `voicebot`). Supabase remains only for **auth** (the session/token) via `client.ts`, `AdminContext`, and `WorkspaceContext`'s session listener.

Behavioral notes from the migration:
- **Stubs (no Go endpoint):** `call_templates` → `null`/`[]` (template create/save/delete are local no-ops; template editors are non-functional until a templates API exists), `call_tokens` → `0`. The `parse-debtor-query` NL filter and Botnoi template creation are disabled.
- **No bulk endpoints:** batch inserts/deletes (debtors, call-list items) are done with `Promise.all` of single-item calls. `createCallListItems` is a convenience bulk helper.
- **Create returns only `{ message }`** (no row). For `call_records`/`call_sessions` the service honors a **client-supplied `id`** (`crypto.randomUUID()`), so CallList generates ids up front to link/poll. Workspaces re-fetch the list to find the new row.
- **No realtime:** Supabase channels were replaced with react-query `refetchInterval` polling (call list 10s, active session 2s) plus invalidate-on-mutation.
- **Client-side filtering:** the Go list endpoints only filter by workspace (+ a few server filters), so status/search/date-range/sort/pagination run in JS (see `applyDebtorFilters` in `DebtorsList.tsx`).

**Transport:** `src/test/api/client.ts` reads `VITE_CALLECTO_API_URL` (`.env`, defaults to `http://localhost:1818/api/v1`), attaches the Supabase access token as `Authorization: Bearer ...`, and exposes `api.get/post/put/delete`. Resource modules unwrap the `{ message, data }` envelope.

**Architectural model to follow:** `src/features/dhipaya/api/airtable.ts` is the existing pattern for a typed external-API client — a thin module exposing async functions (`listCustomers`, `updateCustomer`, …) that wrap a single transport helper, map raw records to domain types (`src/features/dhipaya/types.ts`), and are consumed via `@tanstack/react-query`. Build each Go API resource module the same way: typed functions over `api.*` + domain types + react-query hooks, replacing inline `supabase.from(...)` calls. Keep react-query as the caching/state layer.

## Architecture

Single-page React app (Vite + React 18 + TypeScript + shadcn-ui + Tailwind). Lovable-generated — files marked "auto-generated by Lovable" (e.g. `src/integrations/supabase/client.ts`, `src/integrations/lovable/index.ts`, `src/integrations/supabase/types.ts`) should not be hand-edited.

**Routing** (`src/App.tsx`): flat route table — `/` (Landing), `/dashboard` (production dashboard), `/test` (TestDashboard, the refactor surface), `/admin`, `/dhipaya`. Providers wrap everything in this order: `QueryClientProvider` → `AdminProvider` → `WorkspaceProvider` → `TooltipProvider`.

**Data/backend layer (Supabase):**
- `src/integrations/supabase/client.ts` exports the singleton `supabase` client; components query Postgres directly via `supabase.from("table")` inside react-query `queryFn`s, and call Edge Functions via `supabase.functions.invoke(...)`.
- Auth is Supabase Auth; `src/integrations/lovable/index.ts` wraps OAuth sign-in (Google/Apple/Microsoft) and hands the resulting tokens to `supabase.auth.setSession`.
- Backend logic lives in Deno **Edge Functions** under `supabase/functions/` (voicebot webhooks, call dispatch, Airtable proxy, etc.) with SQL schema in `supabase/migrations/`. These run in Supabase, separate from the Vite frontend.

**Global contexts:**
- `AdminContext` (`src/contexts/AdminContext.tsx`): determines admin status (`user_roles` table) and exposes `effectiveUserId` — admins can impersonate another user via `selectedUserId`; **all user-scoped queries should key off `effectiveUserId`, not the raw auth user id**. Clears the entire react-query cache on any auth boundary to prevent cross-user data bleed.
- `WorkspaceContext` (`src/contexts/WorkspaceContext.tsx`): owns `workspaces`/`workspace_members`, current-workspace selection (persisted to `localStorage` under `currentWorkspaceId`), and CRUD. **In scope for the refactor** — its `supabase.from("workspaces"/"workspace_members")` calls move to the Go `/api/v1/workspaces` endpoints, while it keeps reading the Supabase session for the bearer token. Auth init uses a 3-second failsafe timeout so the UI never hangs on a loading state.

**Feature module pattern (`src/features/dhipaya/`):** self-contained vertical slice — `api/` (typed client over an edge-function proxy), `lib/`, `types.ts`, `fieldMap.ts`, and its own page-level components. This is the template for the Go-API client described above.

**Domain:** "Callecto" — an outbound debt-collection voicebot platform. Core flow surfaced in the dashboards: select **debtors** → build a **call list** → place calls (token-metered via `call_tokens`) → record outcomes in **call_records** → view **analytics/reports**. Voicebot calls are placed and their results ingested through the Edge Functions.
