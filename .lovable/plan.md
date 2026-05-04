
## Risk & Impact Report

**Reported issue.** "Workflow is changed in Qtr which impacting backfilling of score."

**Concrete case (live data — Atul Kumar Khaitan, "Accuracy of TDS Workings", Quarterly, Jan-Mar 2026).**
- Default workflow: `self → manager → hr_pms → approved`
- Per-period override on **March 2026** changed the chain to `self → manager → audit → approved`.
- Terminal month (March) was approved via auditor. Sibling **Feb-26** was percolated and shows `final_score=5` correctly, but its **HR PMS card renders "N/A"** in the Review Journey because the sibling's local UI uses Feb's own (HR PMS) chain while the percolated submission only carries an `auditor_score`. The approval is mathematically correct, but the journey UI looks broken / inconsistent.
- The Jan-26 row of the same KPI is still stored as `frequency=Monthly` (legacy pre-conversion record). Percolation filters siblings by `k.frequency = NEW.frequency`, so Jan was silently skipped — a second source of confusion.

## Root Cause Analysis

### RC-1 (Primary — Display/data alignment)
`percolate_multimonth_score` copies the terminal submission row verbatim. When the **terminal's workflow chain ≠ the sibling's per-period workflow chain**, the sibling row holds scores in stages it never executes, and is missing scores for stages its UI tries to render. POLICY §54 v3/v4 doesn't address heterogenous per-period workflows inside a single cycle.

### RC-2 (Sibling-frequency drift)
When a KPI's frequency is changed (Monthly → Quarterly) on the master record, historical month rows can keep the OLD `frequency` value. The percolation `WHERE` clause `k.frequency = NEW.frequency` then excludes those legacy rows from the sibling set, so they remain unsynchronized with the rest of the cycle and look orphaned in History.

### RC-3 (Workflow change mid-cycle does not regress siblings)
`workflow_change_step_back` was patched (POLICY §54 v3) to **skip non-terminal multi-month siblings** to prevent flickering. But the inverse is also missing: when the **terminal** of an already-approved cycle is stepped back, the trigger does not propagate the regression back to siblings. They stay `approved` with stale percolated scores while the terminal is now in `audit`/`hr_pms_review`. This is a latent inconsistency that surfaces whenever an admin retrofits the workflow on the terminal month after approval.

### RC-4 (No re-percolation on per-period workflow change)
Changing a per-period `workflow_config` row does NOT re-evaluate already-percolated siblings, so the historical "review journey" continues to render the OLD chain layout for the cycle even though the sibling's effective per-period template has been rewritten.

## Mitigation Plan

### Policy decision (locked, codified in POLICY.md §54 v5)
For multi-month KPIs, **the cycle's effective workflow is the terminal month's workflow at the time of approval**. Sibling per-period workflow_config overrides are ignored *for rendering and re-percolation* whenever a `SCORE_PERCOLATED` row exists on the sibling. This eliminates the heterogenous-chain ambiguity without losing any audit data.

### Code/SQL changes (atomic — code + POLICY.md + DOCUMENTATION.md + memory + tests in one migration step)

1. **Migration `multimonth_workflow_alignment_v5`** (single SQL file)
   - **`percolate_multimonth_score`**: also stamp `kpi_audit_logs.metadata.terminal_workflow_template_id` on every `SCORE_PERCOLATED` row so we can later identify which template the score came from.
   - **`workflow_change_step_back`**: when the changed `workflow_config` matches a row whose KPI is the **terminal** of a multi-month cycle and the cycle is `approved`, also step back every sibling and `NULL` their `final_score/final_rating` (audit action `WORKFLOW_CHANGE_STEP_BACK_SIBLING`).
   - **New trigger `trg_repercolate_on_workflow_config_change`** on `workflow_config` AFTER UPDATE: if the changed scope's terminal cycle is currently `approved`, re-run `percolate_multimonth_score` logic for the terminal so siblings get a fresh copy and a fresh `terminal_workflow_template_id` stamp.
   - **One-shot repair function `repair_multimonth_workflow_drift()`**: scans all approved multi-month cycles, detects siblings whose stored chain stages disagree with the terminal's, and re-percolates from the terminal. Logs `BACKFILL_MULTIMONTH_PERCOLATION_V5` with `performed_by = NULL`.
   - **Frequency-drift fixer `repair_sibling_frequency_drift()`**: detects rows where the same `(employee_id, kra_name, kpi_name, review_year)` set has mixed `frequency` values, normalizes them to the master KPI's current frequency, and re-runs percolation for the affected cycle. Logs `KPI_FREQUENCY_NORMALIZED`.

2. **UI — `src/components/review/KpiJourneySection.tsx` (and the History card variant)**
   - When rendering a sibling card whose latest submission has `auto_advance_reason LIKE 'Multi-month sibling%'`, derive the **chain to render from the terminal's `workflow_template_id`** (read once via the audit-log metadata stamp added in step 1), not from the sibling's local `workflow_config`. Stage cards that the terminal's chain doesn't include must be **hidden**, not rendered as "N/A".
   - Add a small **"Cycle reviewed via <Terminal Month>"** chip on sibling cards so users understand why the local chain looks different.

3. **Service-layer abstraction — `src/lib/multimonthCycle.ts` (new)**
   - `getCycleTerminalSubmission(kpiId)` / `getEffectiveChainForCycle(kpi)` — single source of truth used by both KpiJourneySection, KPI History list, and the Reports layer. UI components must consume these helpers instead of computing chains ad-hoc (§3 Separation of Concerns).

4. **Admin one-click action — `src/components/admin/DataRepairTab.tsx`**
   - Add a **"Repair Multi-Month Workflow Drift"** card that invokes `repair_multimonth_workflow_drift()` and `repair_sibling_frequency_drift()` via an admin-only RPC, surfaced behind the existing `ConfirmDestructiveDialog`.

5. **Documentation & policy sync**
   - **POLICY.md §54 v5** (new clause): cycle-effective-workflow rule + frequency-drift normalization rule.
   - **DOCUMENTATION.md** "Multi-Month Percolation" section: describe terminal-as-source-of-truth, the new triggers, and the repair tool.
   - **mem/architecture/pms/multimonth-percolation**: append v5 contract.
   - Version History: bump to `v2.66.8.0+multimonth-workflow-alignment`.

6. **Tests (mandatory — §7)**
   - `src/test/multimonthWorkflowAlignment.test.ts`
     - Sibling rendering uses terminal's chain when chains differ.
     - `repair_multimonth_workflow_drift` is idempotent.
     - `workflow_change_step_back` cascades to siblings only when terminal regresses.
     - Frequency-drift normalizer skips when no drift exists.
   - `supabase/migrations/.../regression_seed.sql` (Mock data) — Atul-style scenario: Quarterly cycle with HR-PMS Feb override + Audit March override.

## Risk & Impact

- **Data Impact**: One-shot repair touches ~30–50 historical sibling rows (estimated from the drift query above). Scores never change — only chain metadata + audit stamp + missing percolations. `final_score` immutability invariant respected.
- **Workflow Impact**: Admins changing a per-period workflow on a terminal month will now see siblings step back as well — **this is the desired safety behavior**. We will surface a confirmation dialog so the admin knows.
- **UI/UX Consistency**: Review Journey on sibling cards becomes consistent across the cycle (no more spurious "HR PMS — N/A" cards). Existing card design tokens reused.
- **RLS**: New triggers run `SECURITY DEFINER` with `SET search_path=public`; new RPC `repair_multimonth_workflow_drift` gated by `has_role(auth.uid(),'admin')`.
- **Regression Risk**: Medium. Step-back cascade could surprise admins. Mitigation: `WORKFLOW_CHANGE_STEP_BACK_SIBLING` audit action + optional dry-run flag on the repair RPC + full unit-test coverage above. All changes additive; existing v3/v4 paths untouched.
- **Rollback**: Migration ships an inline `ROLLBACK` block restoring the v3/v4 trigger bodies if invariants fail.

## Files Touched (estimated)

- `supabase/migrations/<ts>_multimonth_workflow_alignment_v5.sql` (NEW, ~250 lines)
- `src/lib/multimonthCycle.ts` (NEW)
- `src/components/review/KpiJourneySection.tsx`
- `src/components/review/KpiHistoryList.tsx` (or equivalent)
- `src/components/admin/DataRepairTab.tsx`
- `src/test/multimonthWorkflowAlignment.test.ts` (NEW)
- `POLICY.md`, `DOCUMENTATION.md`, `mem/architecture/pms/multimonth-percolation`, `mem/index.md`

## Out of Scope (explicit pushback)

- Re-architecting per-period workflow_config to be cycle-aware (would break existing Monthly KPI flows).
- Auto-merging legacy `frequency=Monthly` rows into Quarterly cycles without admin confirmation.

Awaiting approval to implement.
