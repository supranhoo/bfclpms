# Safety Phase 8 — Regression Checklist

**Status:** Active · **Owner:** Platform Engineering · **Last updated:** 2026-06-04

Low-risk validation checklist for Safety Phases 2–7. Run before every Safety
release. All items are read-only and do not mutate prod state unless the
"Rollback drill" row is exercised on a non-prod copy.

## 0. Pre-flight gate

- [ ] `bunx vitest run src/test/menu src/test/menu-setting-capa.test.ts` → **24/24 green** (Menu CAPA I1–I4 invariants).
- [ ] `bunx vitest run src/test/safety` → green (Phase 1–7 suites).
- [ ] `bunx vitest run src/test/safety/phase8` → green (Phase 8 SSOT suite, ≥33 tests).

If any of the above fails: **STOP**. Do not proceed with the release.

## 1. Phase 2–7 happy paths

| # | Flow | Steps | Expected |
|---|------|-------|----------|
| 1 | Incident create → close | Reporter submits → safety_officer triages → investigates → closes | Status timeline shows each stage; final state `closed`; analytics MV reflects within next refresh |
| 2 | PTW issue → close | Permit applicant requests → approver approves → executor logs LOTO → closes | Permit moves through stages; HIRA/LOTO rows persist; closure timestamp set |
| 3 | Training assign → pass → overdue sweep | Admin assigns SOP+quiz → worker passes quiz → run overdue cron | Assignment marked `completed`; overdue worker (no pass) flagged `overdue` on next sweep |
| 4 | Audit cycle | Auditor opens template → captures responses → finalizes run | Score computed; non-compliances generate findings |
| 5 | Calibration alert | Asset with due calibration crosses SLA | Notification fires; asset flagged on dashboard |
| 6 | Emergency drill ack / stand-down | Drill triggered → participants acknowledge → admin stands down | Participant rows recorded; findings capture-able |
| 7 | Analytics MV refresh + TRIR reconciliation | Run `refresh_safety_analytics()` RPC | All 7 MVs refresh atomically; TRIR matches manual `(recordable * 200000 / hours_worked)` |

## 2. RLS smoke (per role)

For each role (admin, safety_head, safety_officer, worker, auditor), verify
the role can read the rows it should and **cannot** read rows outside its
scope. Quick spot-check:

- [ ] `safety_incidents` — worker sees only own org BU; safety_officer sees assigned BUs.
- [ ] `safety_permits` — same scoping as incidents.
- [ ] `safety_settings` — admin/safety_head only.
- [ ] `safety_module_access` — admin/safety_head only.

## 3. Module Hub kill switch

- [ ] Toggle `modules.is_enabled = false` for Safety in DB → confirm Hub card disappears within one realtime tick (no manual refresh).
- [ ] Restore `is_enabled = true` → card reappears.
- [ ] Revoke `safety_module_access` for a specific user → that user loses access within one tick.

## 4. Rollback drill (non-prod only)

- [ ] On a staging/dev copy, apply the inverse of the last Safety migration. Confirm app still boots.
- [ ] Re-apply the migration. Confirm idempotency.

## 5. Menu CAPA re-validation (final gate)

- [ ] Re-run the Menu CAPA suite at the end of the release window. Must still be **24/24 green**.
- [ ] Admin sidebar non-empty (I1). Auditor pages render (I2). Flag-off short-circuits (I3). Access fail-open (I4).

## 6. Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Engineering Manager | | | |
| QA Lead | | | |
| Release Manager | | | |
