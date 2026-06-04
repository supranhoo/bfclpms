
# Restore Clean Test Baseline — 13 pre-existing failures

## 0. Pre-flight gate — Menu CAPA must be green

```
bunx vitest run src/test/menu/
```

Required: 24/24 green (admin sidebar non-empty, auditor pages do not crash, baseline access available with `menu_overrides_enabled` true or false). If any invariant fails → STOP, fix CAPA first, do not start this work.

## 1. Failure inventory & category map

| # | Test | Category | Root cause hypothesis | Disposition |
|---|------|----------|----------------------|-------------|
| 1 | `multimonthPercolateResolveCall.test.ts` — no migration references phantom `resolve_employee_workflow(` | A — stale migration scan | Test scans all historical migrations; 2 legacy files contain the phantom helper but have been superseded. Migrations are immutable per Migration Governance. | Narrow scan to latest `CREATE OR REPLACE` of the target function. |
| 2 | same file — latest fix uses `get_employee_workflow_info` | A — stale filename heuristic | Filter regex `/percolate\|resolve_workflow\|workflow_call/i` no longer matches the most recent corrective migration filename. | Replace heuristic with latest-definition lookup. |
| 3 | `orgKpiPropagateEnumGuard.test.ts` — no migration casts `::workflow_status` | A — stale migration scan | 1 legacy migration still contains the bad cast; superseded by canonical `review_status` cast. | Same latest-definition narrowing. |
| 4 | `bulkManagementApproveEnumGuard.test.ts` — no `::workflow_stage` | A — stale migration scan | Same pattern. | Same. |
| 5 | same file — no `'approved'::kpi_status` | A — stale migration scan | Same. | Same. |
| 6 | `carriedScoreResolver.test.ts` — `returns none when N/A` | C — stale test | Resolver returns `source: 'na'` per N/A Status Governance. | Update expectation to `'na'`. |
| 7 | same file — `N/A short-circuits inputs entirely` | C — stale test | Same. | Update expectation to `'na'`. |
| 8 | `bugBountyFixes.test.ts` — BUG-001 every canonical role has a color | D — real gap | `platform_owner` role exists in `ALL_APP_ROLES` but missing from color map. | Add color mapping using existing tokens. |
| 9 | same file — BUG-024 export injects Assigned Workflow column | E — stale literal regex | Refactor changed the literal shape; need to read current `handleExport`. | If column still present → relax regex to assert key + source path. If column missing → surgical restore. |
| 10 | `safetyShellIsolation.test.tsx` — SafetyHome renders without throwing | F — test harness | `SafetyHome` transitively calls `useAuth` via `useSafetyRealtimeSync`; test renders without `<AuthProvider>`. | Wrap render in minimal `AuthProvider` or `vi.mock('@/contexts/AuthContext')`. |
| 11 | `kpiCellDetailContract.test.ts` — preserves `kra_categories` join | **B — treat as defect** | Latest `kpi_cell_detail` body lost `kra_categories` JOIN + select. | Investigate DOCUMENTATION/POLICY/ADR. If intentional → proven stale, update test. Otherwise → surgical corrective migration restoring only the join + select. |
| 12 | `ensureOrgKpiScopeRows.contract.test.ts` — GRANT EXECUTE to authenticated | **B — treat as defect** | Latest definition migration may have dropped the GRANT. Per public-schema-grants policy this breaks runtime callers. | Confirm in latest body; if missing → surgical corrective migration that only adds the GRANT. |
| 13 | `bulkWriteStageScoresContract.test.ts` — merges shared evidence (`v_attach_count > 0`) | **B — treat as defect** | Latest body may have lost the evidence-merge guard. | Same defect-first stance; surgical corrective migration only on the missing branch. |

## 2. Category disposition rules

- **A (stale migration scan, items 1–5):** test-only edit. Replace "scan every migration" with "find latest `CREATE OR REPLACE FUNCTION public.<target>` and apply the forbidden-pattern check to that body only". No migration files touched. This matches Migration Governance (history is immutable; only the resolved latest definition is the contract).
- **C (stale test, items 6–7):** test-only edit. `'na'` is the documented governance value. Update expected literals; do not touch resolver code.
- **D (real gap, item 8):** add `platform_owner` to the role-color map using existing semantic tokens. No new tokens. No layout change.
- **E (stale regex, item 9):** read current `handleExport`. If the Assigned Workflow column is still injected, relax the regex; otherwise treat as defect with a one-line surgical restore.
- **F (harness, item 10):** test-only wrapper.
- **B (items 11–13) — treat as real defects until proven stale.** For each:
  1. Read the latest migration body defining the target function.
  2. Search ADR/DOCUMENTATION/POLICY/CHANGELOG for an explicit intentional contract change.
  3. If found → mark test as stale; update test + add a one-line CHANGELOG entry noting the contract change is acknowledged.
  4. If not found → write a surgical corrective migration that restores only the missing clause (JOIN + select / GRANT / evidence-merge guard). Each such migration is classified as a **runtime-affecting corrective fix**, with before/after evidence (latest body excerpt vs. corrective excerpt) recorded in the close-out summary.
  5. If evidence is unclear in one read → **DEFER** that item with a note under `docs/test-baseline/`; do not guess. The other items still ship.

## 3. Execution order

1. Run Menu CAPA suite → gate.
2. Snapshot baseline: `bunx vitest run` → confirm 13 failing.
3. C → D → F → A (all test-only, lowest risk).
4. E (read code, then minimal change).
5. B items, one at a time, with per-item RCA write-up.
6. Targeted re-run after each group.
7. Full `bunx vitest run` → target 0 failing (or N→0 with only documented deferrals).
8. Re-run Menu CAPA → must still be 24/24.

## 4. Decision gates (STOP conditions)

- Menu CAPA fails before or after → STOP.
- Any required fix would touch PMS workflow/scoring/RLS/enforcement beyond the surgical Category-B corrective scope → STOP and defer.
- Any required fix would touch Menu Setting / Custom Tabs, re-enable `menu_overrides_enabled`, add a runtime route/RPC/edge function/MV, or change roadmap behavior → STOP and defer.
- Category B evidence is ambiguous after one focused read → DEFER, do not guess.

## 5. Risk & Impact

- **Data impact:** none for A/C/D/E/F. Category B corrective migrations are additive in shape but classified as runtime-affecting; each restores a documented prior contract clause and is reversible (drop new migration body / re-deploy prior body).
- **Workflow impact:** none. Category B fixes restore prior behavior, they do not change workflow semantics.
- **UI impact:** BUG-001 affects role badge color for `platform_owner` only; uses existing tokens.
- **Regression risk:** low — all test edits narrow scope or wrap harnesses; any Category B migration restores a documented prior clause and ships with a passing contract test plus before/after evidence.
- **Scalability:** unchanged.

## 6. Out of scope (explicit)

- No PMS workflow/scoring/RLS/enforcement changes beyond the Category-B surgical corrective scope.
- No Menu Setting / Custom Tabs changes.
- No re-enable of `menu_overrides_enabled` in production.
- No new runtime routes, RPCs, edge functions, MVs, or roadmap features.
- No production experiments (any controlled isolation belongs in a non-prod copy).
- Deferred dead-column cleanup on `safety_settings` and deferred `/safety/settings/release-readiness` page remain logged in `docs/safety/phase8-release-readiness.md` — NOT silently dropped, NOT silently shipped.

## 7. Deliverables

1. **Close-out summary table:** failure → category → root cause → fix or defer → test command + result.
2. **13 → 0 failing tests**, or N→0 with explicitly documented deferrals under `docs/test-baseline/`.
3. **Menu CAPA suite green** at pre-flight and final gate (logged in summary).
4. **Full repo result:** `bunx vitest run` output count.
5. **Before/after evidence** for every Category B fix (latest body excerpt + corrective excerpt + new test pass).
6. **Documentation updates** only where appropriate:
   - `CHANGELOG_2026.md`: one entry "Test baseline restoration — X resolved, Y deferred; no PMS behavior change beyond restoring [contract clause]" (only if Category B corrective migration ships).
   - `DOCUMENTATION.md` / ADR: only if a Category B item is reclassified as intentional contract change.
   - `POLICY.md`: add §Test-Baseline noting "migration-scan tests must use latest-definition semantics".
   - `mem/infrastructure/test-baseline-restoration.md` (new) + `mem://index.md` entry.
7. **Confirmation statement** in close-out:
   - No roadmap stage was skipped.
   - Deferred dead-column cleanup and deferred release-readiness page remain tracked.
   - `menu_overrides_enabled` not re-enabled.
   - No Menu Setting / Custom Tabs changes.
   - No new runtime features.

## 8. Rollback

Localized to `src/test/**`, `src/lib/**` (color map only), and at most three small additive corrective migrations (Category B). Each migration is independently revertible by a drop/restore migration. Failing baseline is the recoverable previous state.
