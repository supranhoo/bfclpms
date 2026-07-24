# ADR-161 — Post-June KRA Rehydrate for Completed Annual Reviews

## Confirmation (answers the question)
For KRA-based Annual Review templates, `carry_kra` values are computed live from monthly KPI scores (cascade Final → Auditor → Manager → Self, weighted by KPI weightage, scaled `(rating/5) × weight`). In-progress reviews automatically pick up newer scores (including June once approved) on next open/advance. **Completed / HR-locked reviews do not**, per POLICY §88 (Submission Snapshot Immutability): any retro update must be an explicit, audit-logged admin action. This plan adds exactly that action.

## Risk & Impact
- **Data**: Overwrites `system_scores[<carry_kra slot>]`, `system_scores_raw`, `total_score`, `final_rating`, `carry_score_snapshots` on completed KRA-based instances. Non-KRA slots untouched. Full pre-image snapshot archived to a new audit table for rollback.
- **Workflow**: No status changes. Instance remains `completed`; no stage reopens; no notifications by default.
- **UI/UX**: Read-only surfaces (`EmployeeResultsView`, RCA, exports, comprehensive report) start showing refreshed totals. Nothing added or removed visually beyond the admin trigger card.
- **Regression**: Non-KRA templates skipped by construction (`isKraBasedTemplate`). Locked-response contract unchanged. Rollback path preserved.
- **Scalability**: ~cycle-scoped set of KRA instances; run in batches of 200 with server-side pagination, executed inside a single admin RPC.

## Scope (in / out)
**In scope**
- Cycle-scoped, admin-triggered bulk rehydrate for `completed` KRA-based instances.
- Reuses existing SSOT: `buildCarrySnapshot` logic mirrored inside a `SECURITY DEFINER` SQL routine that reads the same cascade from `review_submissions`.
- Dry-run preview with per-instance delta (old vs new total, rating band change).
- Immutable audit + one-click rollback per run.

**Out of scope**
- Any change to in-progress reviews (they already pick up June live).
- Any change to non-KRA templates.
- Automatic (cron) re-runs. Trigger stays manual; §88 requires explicit initiation.

## Design

### 1. New DB objects (migration)
- `public.annual_review_kra_rehydrate_runs` — one row per admin run (`id`, `cycle_id`, `initiated_by`, `mode` ∈ `dry_run|apply|rollback`, `reason text NOT NULL CHECK length ≥ 10`, `instance_count`, `changed_count`, `status`, `created_at`, `completed_at`).
- `public.annual_review_kra_rehydrate_items` — per-instance pre/post snapshot (`run_id`, `instance_id`, `employee_id`, `template_id`, `old_system_scores jsonb`, `old_system_scores_raw jsonb`, `old_total_score numeric`, `old_final_rating text`, `new_system_scores jsonb`, `new_total_score numeric`, `new_final_rating text`, `delta_total numeric`, `band_changed bool`, `applied bool`).
- Full GRANT + RLS: admin-only (`has_role('admin')`) via existing helper.
- RPC `annual_review_rehydrate_kra_for_cycle(p_cycle_id uuid, p_mode text, p_reason text, p_instance_ids uuid[] DEFAULT NULL) RETURNS uuid` — returns run id. Iterates completed KRA-based instances (optionally filtered), recomputes each `carry_kra` slot using the existing month cascade, replays the KRA total projection (mirrors `projectKraFinalFromSystemScores`), then in `apply` mode updates the instance and records the delta. `dry_run` records deltas only. `rollback` restores from the referenced run's `old_*` columns.
- Rating band table read from `annual_review_settings.auto_final_rating_thresholds` (SSOT — no hardcoded 85/70/55).

### 2. Service layer (`src/services/annualReview/kraRehydrate.ts`)
Thin wrapper: `startRehydrate({ cycleId, mode, reason, instanceIds? })`, `getRun(runId)`, `listItems(runId, { pagination })`, `rollbackRun(runId, reason)`.

### 3. Admin UI (`AccessControlTab.tsx` → new sub-card "KRA Score Rehydrate")
- Cycle selector (defaults to active cycle).
- Reason textarea (min 10 chars).
- Buttons: **Preview (dry run)** → **Apply** → **Rollback last run**.
- Preview table (paginated, server-side, 50/page) columns: Employee, Old Total, New Total, Δ, Old Rating, New Rating, Band Changed?.
- Confirm dialog requires typing `REHYDRATE` before Apply, and `ROLLBACK` before Rollback (parity with ADR-160 REPLAN).
- Toast on completion with counts (changed / unchanged / skipped-non-KRA / skipped-no-KRA-scores).
- No auto-notifications; opt-in checkbox "Notify HR PMS of impacted employees" queues via existing `email_dispatch_queue` (off by default).

### 4. Read paths untouched
`EmployeeResultsView`, `SystemScoresPanel`, `useResolvedSystemScores`, `useKraDerivedRatingsForInstances` continue to work as today; they'll simply reflect the new persisted values on next fetch. React Query invalidations issued after Apply/Rollback.

## Steps
1. Migration: new tables + RLS + GRANT + RPCs (`_rehydrate_kra_for_cycle`, `_rollback_kra_rehydrate_run`, helper `_carry_kra_recompute_for_instance` mirroring TS SSOT). **Verify**: linter clean, RLS checks pass in `docs/rls-audit.sql`.
2. Types regen; add service layer + hooks (`useKraRehydrateRun`, `useKraRehydrateItems`). **Verify**: unit tests for delta computation and band lookup (mocked settings row).
3. Admin UI card + dialogs. **Verify**: RTL tests for reason gate, typed confirmation, disabled states.
4. Documentation: append **ADR-161** entry to `docs/adr/` and **POLICY §AR-KRA-REHYDRATE**; update **DOCUMENTATION.md** version history.
5. Post-June operational note: user runs Preview → reviews deltas → Apply. Rollback available indefinitely from the run row.

## Rollback strategy
- Every applied run stores full pre-image per instance → single-click restore via `rollback_kra_rehydrate_run(run_id)`.
- Migration itself is additive (no drops); reversible by dropping the two new tables and the three new RPCs.

## Tests (Vitest + pgTAP-style RPC tests via `supabase--read_query`)
- Happy path: KRA instance with all 12 months → total recomputes, band updates.
- Partial June: null-June month excluded correctly; no divide-by-zero.
- Non-KRA template: skipped, no row written.
- Rollback restores exact prior `system_scores`/`total_score`/`final_rating`.
- Dry-run makes zero writes to `annual_review_instances`.
- Locked-response invariant: no rows in `annual_review_responses` mutated.

## Decision notes
- Chose an explicit admin RPC (not a trigger on `review_submissions` writes) to comply with §88 and avoid surprise mutations to HR-signed appraisals.
- Chose to mirror the TS SSOT inside SQL rather than call an edge function so the operation is transactional per batch and auditable in one place.
- Chose typed confirmations + reason gate to match ADR-160's admin-edit governance.
