# Safety Phase 8 — Final Stabilization & Regression Protection (revised)

## Pre-flight gate (already validated this turn)
- `bunx vitest run src/test/menu src/test/menu-setting-capa.test.ts` → **24/24 green**.
- I1 admin sidebar non-empty ✓ · I2 auditor no-crash ✓ · I3 flag-off short-circuit ✓ · I4 access fail-open ✓.
- Gate passes. The same suite will be re-run as the **final gate** at the end of the phase (see Step 6).

## Scope (authoritative: `docs/safety-integration-governance.md` §Phase 8)
Phase 8 is **docs + tests + stabilization only**. No new runtime route, no new RPC, no new edge fn, no MV change, no behavior change in any Safety module.

The roadmap's deferred items are preserved, not silently dropped:
- **Included now:** regression checklist, release-readiness document, read-only SSOT tests, dead-column cleanup (conditional on pre-flight), docs/memory/changelog updates.
- **Deferred, explicitly tracked (not removed):** `/safety/settings/release-readiness` **runtime page** is recorded as an **optional, flag-gated subtask** in the release-readiness doc and in `mem/features/safety/phase8-stabilization.md`. It will be proposed as a separate approval before any runtime work.

## Assumptions
- Phases 2–7 complete (125/125 Safety SSOT tests per roadmap version history).
- Safety remains gated by `useModules` Module-Hub kill switch; Phase 8 does not change that.
- `menu_overrides_enabled` stays `false` in production.
- No PMS workflow / scoring / RLS / enforcement change.
- No Menu Setting / Custom Tabs change.

## Risk & Impact Report
| Dimension | Impact |
|---|---|
| Data | One **destructive cleanup** migration: `ALTER TABLE public.safety_settings DROP COLUMN ui_incident_v2, DROP COLUMN incident_stage_copy`. Both columns are verified-dead per `mem/features/safety/incident-ux-v2.md` (added 2026-05-30, NULL on every row, read by no code). Drop is gated by a pre-flight assertion that aborts the transaction if any non-NULL value exists, and by a code grep confirming no reader references. Backup coverage automatic via `get_backup_table_order()`. |
| Workflow | None. |
| UI/UX | **None.** No new route, no menu link, no flag flip. The deferred release-readiness page is documented as an optional follow-up subtask only. |
| Regression | Low. Tests are additive, read-only. Migration touches verified-dead columns. Menu CAPA suite gates the change. |
| Scalability | None. |
| Mitigation | Pre-flight NULL assertion + reader grep + pre-prepared inverse migration (re-add nullable columns). Phase aborts if Menu CAPA or any existing Safety/PMS test regresses. |

## Deliverables (approved core only)

### 1. Phase 8 regression checklist — `docs/safety/phase8-regression-checklist.md`
- Phase 2–7 happy-path walkthroughs: incident create→close, PTW issue→close, training assign→pass→overdue sweep, audit cycle, calibration alert, emergency drill ack/stand-down, analytics MV refresh + TRIR reconciliation.
- RLS smoke per role (admin, safety_head, safety_officer, worker, auditor).
- Module Hub disable → Safety disappears within one realtime tick.
- Rollback drill: revert the dead-column migration on a non-prod copy.

### 2. Phase 8 release readiness — `docs/safety/phase8-release-readiness.md`
- Test counts (PMS, Safety, Menu CAPA, Phase 8 new).
- MV refresh cadence + cron status.
- Edge-fn auth posture summary (links to `docs/safety/phase1/edge-function-auth.md`).
- Known deferrals (incl. release-readiness runtime page marked **Deferred — optional, requires separate approval**).
- Sign-off table: EM / QA Lead / Release Manager (per §Manual Approval Gates).

### 3. Read-only automated SSOT tests — `src/test/safety/phase8/`
All tests mock supabase; **no DB writes, no runtime feature shipped**. Target ≥ 18 new tests.
- `safety-module-gate.test.ts` — `useModules` Safety toggle hides Hub card.
- `safety-rls-smoke.test.ts` — mocked role matrix per Safety table.
- `analytics-mv-contract.test.ts` — row shape & non-null invariants for `mv_safety_trir`, `mv_incidents_open_vs_closed`, `mv_training_compliance`.
- `safety-settings-rows-vs-columns.test.ts` — runtime reads `safety_settings` **rows** (key/value); guards that no code references the dropped columns.
- `emergency-contacts-ssot.test.ts` — `useEmergencyContacts` reads `safety_emergency_contacts` only; no JSONB fallback.
- `module-hub-realtime.test.ts` — kill-switch invalidation latency regression.

### 4. Dead-column cleanup (destructive, gated) — single migration
**Pre-flight (must all pass before the DROP is even submitted):**
- `SELECT count(*) FROM public.safety_settings WHERE ui_incident_v2 IS NOT NULL OR incident_stage_copy IS NOT NULL` returns 0.
- `rg -n "ui_incident_v2|incident_stage_copy" src supabase` shows only the row-keyed reads in `SafetyIncidentDetail.tsx` / `IncidentStageHeader.tsx` (rows, not columns) and the memory doc. No column references.

**Migration body (single transaction):**
```sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.safety_settings
    WHERE ui_incident_v2 IS NOT NULL OR incident_stage_copy IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Phase 8 abort: non-NULL value found in dead columns';
  END IF;
END $$;
ALTER TABLE public.safety_settings
  DROP COLUMN IF EXISTS ui_incident_v2,
  DROP COLUMN IF EXISTS incident_stage_copy;
```

**Rollback (pre-written, not applied):**
```sql
ALTER TABLE public.safety_settings
  ADD COLUMN IF NOT EXISTS ui_incident_v2 boolean,
  ADD COLUMN IF NOT EXISTS incident_stage_copy jsonb;
```

If pre-flight fails for any reason → **STOP, escalate**, do not submit the migration. Mark the item as "still deferred" in the readiness doc; the rest of Phase 8 still ships.

### 5. Documentation / memory / changelog
- `DOCUMENTATION.md` — Phase 8 section (links to the two new docs).
- `POLICY.md` — new §Safety-Phase8 capturing low-risk scope + deferred runtime subtask.
- `CHANGELOG_2026.md` — current-week row: tests added, migration id, deferred-subtask note.
- `mem/features/safety/phase8-stabilization.md` (new) — invariants, deferred-subtask register, checklist link.
- `mem/features/safety/incident-ux-v2.md` — mark schema debt resolved (only if Step 4 ran); otherwise note "still deferred".
- `mem/index.md` — add the new memory line under Memories.

### 6. Full test pass + final Menu CAPA re-validation
`bunx vitest run` must be green, and `bunx vitest run src/test/menu src/test/menu-setting-capa.test.ts` must remain **24/24** before closing the phase.

## Explicitly **not** in this pass
- `/safety/settings/release-readiness` runtime page — **deferred, optional, requires separate approval**. Tracked in the readiness doc + memory; not silently dropped.
- Menu Setting / Custom Tabs changes — none.
- Re-enable `menu_overrides_enabled` — no.
- PMS workflow / scoring / RLS / enforcement changes — none.
- Any new Safety RPC / edge fn / MV / route — none.
- Changes to `useMenuAccess` resolution order — none.

## Step → Verification
| # | Step | Verification |
|---|---|---|
| 1 | Re-run Menu CAPA + existing Safety baseline | Capture pre-counts; must be green |
| 2 | Add `src/test/safety/phase8/` (6 files, ≥18 tests) | `bunx vitest run src/test/safety/phase8` green |
| 3 | Run pre-flight (NULL SELECT + reader grep) | Both clean ⇒ proceed to Step 4; either dirty ⇒ skip Step 4, mark deferred |
| 4 | Submit destructive cleanup migration (conditional) | Pre-flight assertion passes; migration applies; full Safety suite still green |
| 5 | Write checklist + readiness docs | Files exist; cross-refs resolve |
| 6 | Update DOCUMENTATION.md / POLICY.md / CHANGELOG_2026.md / memory | All updated in one commit window |
| 7 | Final full repo test pass + Menu CAPA re-validation | `bunx vitest run` green; menu suite 24/24 |

## Decision gates
- Menu CAPA fails at start or end → STOP, fix CAPA, do not close Phase 8.
- Pre-flight finds non-NULL data or a column reader → STOP the migration only; the rest of Phase 8 still ships; debt stays recorded as deferred.
- Any existing Safety/PMS test regresses → STOP, surgical fix in failing path only.
- All gates green + sign-off table filled → Phase 8 closed.

## Rollback
- Tests: delete `src/test/safety/phase8/`.
- Migration: apply the pre-written inverse (re-add nullable columns).
- Docs/memory: revert the edits.
