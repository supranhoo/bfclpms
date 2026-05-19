## Phase 1 — Production Hardening Validation

Read-only / low-risk validation phase per `docs/safety-integration-governance.md`. No runtime code or schema changes. All output lands under `docs/safety/phase1/` plus one memory file.

## Deliverables

### 1. `docs/safety/phase1/rls-matrix.md`

Per Safety table × Safety role (`safety_admin`, `safety_manager`, `safety_officer`, `safety_viewer`, etc. — sourced from `safety_app_role` enum), document SELECT/INSERT/UPDATE/DELETE policy outcomes. Built from `pg_policies` + `has_safety_role` checks. Flag any table with RLS disabled or with a permissive `USING (true)` policy.

### 2. `docs/safety/phase1/security-scan.md`

Run `security--run_security_scan` + `supabase--linter`, filter for `safety_*` findings, list each with severity, current disposition (accept / fix-now / defer), and link to ADR if accepted.

### 3. `docs/safety/phase1/edge-function-auth.md`

For each of `check-safety-sla`, `grant-safety-role`, `safety-analytics`:

- header inspection (`verify_jwt` in `supabase/config.toml`),
- in-function auth check (service-role vs session role assertion),
- caller allowlist,
- expected failure modes (401 / 403).
Recommend hardening only if a gap is found; defer fix to its own ticket if any.

### 4. `docs/safety/phase1/backup-coverage.md`

List Safety tables vs the project's backup engine inventory (see `mem://infrastructure/database/optimized-backup-engine`). Confirm every `safety_*` table is in scope. Flag any missing.

### 5. `docs/safety/phase1/module-isolation.md`

- Re-run `src/test/safetyShellIsolation.test.tsx` and capture pass/fail.
- Static grep: PMS files importing from `src/{pages,components,hooks,lib}/safety/*` (must be zero except module-gate plumbing).
- Static grep: Safety files importing PMS business logic (allowed: shared `ui/*`, `lib/utils`, supabase client; everything else flagged).
- Produce remediation list (no fixes applied in Phase 1).

### 6. `docs/safety/phase1/hardening-baseline.md`

Single-page summary that is the source of truth for Phase 2+ "what we must not regress".

### 7. Memory write

Create `mem://features/safety/hardening-baseline` with the locked invariants:

- RLS enabled on all `safety_*` tables;
- Stage constant `rca` is canonical;
- `client_submission_id` is the only idempotency column;
- Write paths go through the RPCs listed in `phase0/rpc-diff.md`;
- Edge-function auth posture as documented.

Update `mem://index.md` to reference it.

## Forbidden in this phase

- Any source code change.
- Any schema migration.
- Any RLS policy edit (even if a gap is found — that becomes its own ticket gated separately).
- Any edge function redeploy.

## Stop conditions

- A `safety_*` table is found with RLS off → halt, escalate, do not proceed to Phase 2.
- A write path bypassing the documented RPCs is found in production code → halt, raise as a Phase 1.5 fix request.
- Module isolation tests fail → halt; fix is its own scoped ticket.

## Risk & impact

- Data: none (read-only).
- Workflow: none.
- Auth: none.
- Regression: zero — no runtime code changed.

## Order of execution (single run)

1. Pull `pg_policies` for `safety_*` → write `rls-matrix.md`.
2. Run security scan + linter → write `security-scan.md`.
3. Read `supabase/config.toml` + the three edge functions → write `edge-function-auth.md`.
4. Cross-check backup engine config → write `backup-coverage.md`.
5. Re-run isolation test + greps → write `module-isolation.md`.
6. Roll up into `hardening-baseline.md` + memory file + index update.
7. Report results in chat, list any Stop Conditions hit, then pause for the Phase 2 approval gate (Architect + EM + PO).

## Open confirmations (carrying over from the master plan)

- Phase order after this: **3 before 4** (incident UX, then offline UX) — confirm
- Phase 6 import scope: **Assets / Training assignments / Emergency contacts** — confirm

These don't block Phase 1; answer when convenient before the Phase 2 gate.