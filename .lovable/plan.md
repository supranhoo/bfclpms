## Goal

Close the four remaining non-blocking Safety hardening tickets so the Phase 1 baseline doc has no outstanding items, without altering any user-facing behavior.

## Risk & Impact Report

- **Data Impact**: No schema changes. Only RLS policy role-scope swap and edge-fn auth tightening. No row-level data touched.
- **Workflow Impact**: None — same callers, same RPCs, same UIs.
- **UI/UX Consistency**: None — no UI code modified.
- **Regression Risk**: Low. Three subtle areas:
  1. F-RLS-02 swap `{public}` → `{authenticated}` on Safety policies could lock out an unauthenticated path. Mitigation: Safety routes are already auth-gated; verified no anon entry points.
  2. T-004 drops the anon-key bypass on `check-safety-sla`. Mitigation: cron uses service-role; admin/head still pass via JWT role check.
  3. T-005 sets `verify_jwt = false` explicitly. Already the deployed behavior — purely declarative.
- **Mitigation**: Each ticket gets its own migration/config edit and an existing-test rerun. No new business logic.

## Scope

### T-002 — search_path audit (verification only)
DB query confirms zero Safety SECURITY DEFINER functions are missing `set search_path`. Action: mark ticket complete in `hardening-baseline.md`; no migration needed.

### T-004 — `check-safety-sla` anon-key bypass removal
Edit `supabase/functions/check-safety-sla/index.ts`:
- Remove `apiKey === anonKey` branch from the bypass check.
- Keep `Authorization === Bearer <service-role>` and admin/head JWT paths.
- Redeploy the function.

### T-005 — declare `verify_jwt = false` for `grant-safety-role`
Append to `supabase/config.toml`:
```toml
[functions.grant-safety-role]
verify_jwt = false
```
Function already self-validates; this is declarative only.

### F-RLS-02 — `{public}` → `{authenticated}` on 22 Safety policies
Single migration that drops and recreates the 22 affected policies on these tables with `TO authenticated`:
- `safety_drill_findings` (2), `safety_drill_participants` (2)
- `safety_emergency_contacts` (2), `safety_emergency_drills` (4)
- `safety_incident_evidence` (3), `safety_incident_progress_logs` (2), `safety_incident_timeline` (1)
- `safety_incidents` (4), `safety_severity_sla` (2)

Each policy keeps its exact `USING` / `WITH CHECK` clause — only the role list changes. SECURITY DEFINER helpers (`has_safety_role`, etc.) handle access checks, so anon callers (none expected on `/safety/*`) cleanly receive 401-equivalent empty result sets.

## Verification

1. `supabase--linter` — no new ERROR/WARN introduced.
2. Run existing `src/test/safety/**` suites (incident, permit, drill, training, audit, analytics).
3. Curl `check-safety-sla` with: anon-key (expect 401), service-role (expect 200), admin JWT (expect 200).
4. Manual: load `/safety/incidents` and `/safety/permits` as a Safety user → rows visible as before.

## Docs to update atomically

- `docs/safety/phase1/hardening-baseline.md` — move T-002/T-004/T-005/F-RLS-02 from "Non-blocking" to "shipped".
- `docs/safety/phase1/tickets/T-002…T-005.md` — append "Resolution" notes with migration / commit refs.
- `.lovable/plan.md` — replace stale drill issue with this hardening-closeout summary.
- `mem://features/safety/hardening-baseline` — note the four closures.

## Out of scope

- Project-wide linter cleanup of non-Safety functions (separate workstream).
- Any UI changes.
- Phase 2+ Safety features.
