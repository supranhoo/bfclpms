## Wave G — Restrict `SECURITY DEFINER` function execution

### Finding
Linter reports ~521 instances of "Public Can Execute SECURITY DEFINER Function". Live DB check confirms:
- 261 `SECURITY DEFINER` functions in `public`
- 260 of them have `EXECUTE` granted to `anon` (the default `PUBLIC`/`anon` grant)
- 261 also granted to `authenticated` (intended)

`SECURITY DEFINER` runs with the owner's (postgres) privileges, bypassing RLS. Leaving `anon` `EXECUTE` means an unauthenticated request can invoke any of these and read/mutate data the policies were meant to gate on `auth.uid()`.

### Risk & Impact Report
- **Data impact**: None to stored rows. Only changes who may *invoke* server-side functions.
- **Workflow impact**: All logged-in flows continue (we keep `authenticated` + `service_role`). Anon (logged-out) flows that legitimately need a definer call must be kept on an explicit allowlist.
- **Allowlist of anon-callable definer functions** (must keep `anon EXECUTE`):
  1. `public.get_public_branding()` — login screen branding before sign-in
  2. `public.lookup_synthetic_email_by_code(text, text)` — employee-code → email resolution for login (per `mem/architecture/security/employee-code-login`)
  3. `public.get_public_registry_view(text, uuid)` — public KPI registry view, currently exposed unauthenticated
- **Regression risk**: Low. Trigger functions (`send_email_on_notification`, `notify_*`, `repercolate_*`, etc.) execute via triggers as `postgres`, not via the API — revoking from `anon` does not affect them. The only behavioural change is that unauthenticated `rpc()` calls to non-allowlisted functions will return `permission denied`.
- **Mitigation**: Use a single set-based migration that loops `pg_proc` and revokes from `PUBLIC` + `anon`, skipping the allowlist. Re-grant `EXECUTE` to `authenticated` + `service_role` to be explicit (idempotent). Re-run the linter to confirm count drops to 0.

### Plan
1. Single migration:
   - `DO` block iterating every `pg_proc` row where `pronamespace = 'public'::regnamespace AND prosecdef AND proname NOT IN (<allowlist>)`.
   - For each: `REVOKE EXECUTE ON FUNCTION public.<name>(<args>) FROM PUBLIC, anon;` and `GRANT EXECUTE ... TO authenticated, service_role;`
   - For the 3 allowlisted functions: leave `anon EXECUTE` intact (no-op), but still ensure `authenticated`/`service_role` are granted.
2. Re-run `supabase--linter`; expect ~521 → 0 for this finding (and overall ~525 → ~4).
3. Smoke-check (post-migration):
   - Logged-out: login page still loads branding; employee-code login still resolves email.
   - Logged-in: open a review, run a KPI scoring action, open Safety Analytics — all RPCs continue to succeed under `authenticated`.

### Not changing
- The current-view findings (`email_logs public read`, `clients`, `realtime.messages`, `review-evidence` bucket, `safety_incident_routing_rules`) — those are separate from the Wave G batch and out of scope for this step.

### Test / verify
- `supabase--linter` re-run, expect Wave G cleared.
- Manual smoke of login + 1 review action + Safety Analytics page.

### Rollback
- A single inverse migration: `GRANT EXECUTE ON FUNCTION public.<name>(<args>) TO PUBLIC;` over the same set. Trivial because no schema or data changed.

### Documentation / Policy
- Append Wave G entry to `docs/safety/phase1/security-scan.md` Phase 1 disposition table.
- Record the anon-callable definer-function allowlist as a memory under `mem://security/anon-callable-definer-allowlist` so future migrations don't accidentally re-revoke it.
