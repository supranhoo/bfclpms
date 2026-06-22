## What I checked

- DB: Sajid Raza (`b68f5bce-…`) is active and has **13 active direct reports** — data is fine.
- Postgres logs (last 2 h) still show **two distinct errors** even after the previous auth-ready gate:
  1. `permission denied for function has_role` on `SELECT FROM public.system_settings WHERE setting_key = $1` — request is hitting PostgREST as **`anon`** (pre-JWT), and `system_settings` RLS calls `has_role()` which `anon` cannot execute.
  2. `invalid input syntax for type uuid: "null"` on `SELECT id, full_name, email FROM public.profiles WHERE id = ANY ($1)` — a `.in('id', [...])` somewhere is passing the literal string `"null"`.
- Source review: `useEntitlement`, `useEnforcementPilot`, `useMenuOverridesEnabled` (and the menu/registry queries it gates) fire **unconditionally** at app boot — no `enabled: isReady` guard. They are the source of the `system_settings` pre-auth hit.
- The previous gate only covered `useTeamMembers` / `useSkipLevelTeamMembers`; the UUID-"null" call site has **not** been identified yet.

## Risk & Impact Report

- **Data Impact:** None. No schema, RLS, or data change.
- **Workflow Impact:** None. Hooks return the same payload, just delayed by ~1 RTT until `isReady === true`.
- **UI/UX:** Sidebar/feature-flag-driven UI continues to render with the existing default-off snapshot during the pre-auth window — identical to today's first-paint.
- **Regression Risk:** Low. The gated hooks already tolerate `data === undefined` (they fall back to safe defaults). Adding `enabled: isReady` only postpones the first fetch.
- **Scalability:** Slight improvement — eliminates one wasted pre-auth round-trip per page load.
- **Mitigation:** Unit test that asserts each hook's `enabled` is `false` when `isReady === false`.

## Plan

### Step 1 — Gate the system_settings / menu hooks on auth-ready
File: `src/hooks/useEntitlement.ts`
- Import `useAuth`.
- In both `useEntitlement` and `useEnforcementPilot`, set `enabled: isReady`.

File: `src/hooks/useResolvedMenu.ts`
- In `useMenuOverridesEnabled`, set `enabled: isReady`.
- `useResolvedMenu` already chains off `useMenuOverridesEnabled` — no extra change needed.

Verification: Postgres logs should stop emitting `permission denied for function has_role` on `system_settings` once Sajid reloads.

### Step 2 — Trace the lingering `uuid: "null"` site
The failing query has the exact column shape `id, full_name, email` and uses `.in('id', …)`. None of the 17 matching call sites obviously fires on Team Reviews initial load, so I will:
- Add a **temporary** wrapper in `src/integrations/supabase/client.ts` (or a thin debug helper imported by suspects) that logs `console.error('[uuid-null-trace]', stack)` whenever a `.in('id', arr)` array contains the string `"null"` or `"undefined"`. The wrapper is dev/build-mode only — gated behind `import.meta.env.DEV`.
- Ship Step 1 immediately; ask Sajid to reload once. The console trace will pin the exact call site without another guessing round.
- Remove the trace and ship the targeted fix in a follow-up.

### Step 3 — Tests
File: `src/test/systemSettingsAuthReadyGate.test.ts` (new)
- Asserts `useEntitlement`, `useEnforcementPilot`, `useMenuOverridesEnabled` queries have `enabled === false` when `isReady === false`, and `true` otherwise. Mock `useAuth` per @workspace/test patterns.

### Step 4 — Memory + docs
- Append a line to `mem/architecture/auth-readiness-query-gate` listing the three newly gated hooks.
- Add a short `.lovable/plan.md` entry: "Sajid Team Reviews — Phase 2: gate system_settings hooks; trace uuid:null source".

## What I will NOT do (and why)

- **Not** granting `anon` EXECUTE on `public.has_role` — would silently weaken every RLS policy that uses it (rejected previously, still rejected).
- **Not** rewriting `system_settings` RLS to permit anon — feature-flag rows are mixed with sensitive admin-only keys; per-row policy carving is out of scope and unnecessary once Step 1 lands.
- **Not** blanket-gating every hook — only the three confirmed pre-auth offenders. Anything else stays untouched per the surgical-change rule.

## Technical Notes

- `enabled: isReady` is the same pattern already in use in `EmployeeSelectorGrid` and `useTeamMembers` (v2.66.11.14). No new abstraction is introduced.
- The `[uuid-null-trace]` helper is deliberately ephemeral: it lives for one diagnostic cycle, then is removed in the same PR as the real fix.

## Deliverables checklist

- [ ] Edit `useEntitlement.ts` (2 hooks gated)
- [ ] Edit `useResolvedMenu.ts` (1 hook gated)
- [ ] New `systemSettingsAuthReadyGate.test.ts`
- [ ] Temporary uuid-null trace in client wrapper (dev-only)
- [ ] Memory + plan updates
- [ ] Manual verification: Sajid reload → no more `permission denied for function has_role` in `postgres_logs`
