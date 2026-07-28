## Assumptions

- The blocking error is the one in your screenshot: approving a KPI at the Functional Manager stage fails with `Could not find the 'functional_manager_achieved_value' column of 'review_submissions' in the schema cache`.
- You want the FM stage to behave exactly like Manager / Skip-Level / Auditor stages — no partial support.

## Verified findings (queried the live database this turn)

`public.review_submissions` currently has, per stage:

```text
stage              score  rating  remarks  achieved_value  evidence_url  evidence_urls
self                 y      y       y           y              y             y
manager              y      y       y           y              y             y
functional_manager   y      y       y          MISSING        MISSING         y
skip_level           y      y       y           y              y             y
hr_pms               y      y       y           y              y             y
auditor              y      y       y           y              y             y
management           y      y       y           y              y             y
```

So the FM stage was added with only 4 of its 6 columns. Meanwhile the client writes all six:

- `src/components/review/UnifiedScorecard.tsx` line 1176 writes `${prefix}_achieved_value` for every stage, and line 724 lists `functional_manager_evidence_url` / `functional_manager_achieved_value` in the stage field map (also cleared on send-back, lines 849-850).
- `src/hooks/useKpis.ts`, `src/lib/review/resolveSelfAchievedValue.ts` and `KpiJourneySection.tsx` all read those two fields.

Two related traces confirm the gap is known-but-unfixed: migration `20260717052352` referenced `NEW.functional_manager_achieved_value` and migration `20260717072858` then *removed* the reference from `enforce_self_snapshot_mirror` "to drop reference to non-existent column" — the column was never created. `functional_manager_evidence_urls` is also `NOT NULL` while every other stage's `_evidence_urls` is nullable.

## Risk & impact report

- **Data impact:** additive only — two nullable columns, no backfill of existing rows required (historic FM submissions simply have NULL). Relaxing the `NOT NULL` on `functional_manager_evidence_urls` is also additive-safe.
- **Workflow impact:** unblocks FM approve/save-draft. No stage ordering, RLS or status logic changes.
- **UI impact:** none visually new — the FM achieved-value field and evidence link already exist in the scorecard and journey; they will simply stop erroring and start persisting.
- **Regression risk:** low. Risk is limited to triggers touching `review_submissions`; the self-snapshot mirror needs its FM branch restored so FM edits mirror like Manager edits.
- **Scalability:** two nullable columns on an existing table; `ADD COLUMN ... NULL` is metadata-only in Postgres, no table rewrite.
- **Rollback:** `ALTER TABLE ... DROP COLUMN` for the two new columns; the trigger change reverts to the previous body. Fully reversible.

## Plan

**Step 1 — Migration: complete the FM column set**
- `ALTER TABLE public.review_submissions ADD COLUMN functional_manager_achieved_value numeric`, `ADD COLUMN functional_manager_evidence_url text`.
- Align `functional_manager_evidence_urls` nullability with peer stages (drop `NOT NULL`, keep the `'[]'` default).
- Restore the FM branch in `enforce_self_snapshot_mirror` / the self-column-guard trigger so FM writes are treated like Manager writes.
- Verification: re-run the stage/column matrix query above and confirm the FM row is fully populated; PostgREST schema cache reload.

**Step 2 — Server parity for FM writes**
- Audit `bulk_write_stage_scores`, `bulk_review_snapshot`, `stage_ready_kpis` and `get_kpi_journey_report` for FM achieved-value/evidence handling and extend where the peer stages are handled but FM isn't.
- Verification: SQL-level dry run against a test submission row.

**Step 3 — Schema-parity drift guard (test)**
- New test `src/test/reviewSubmissionsStageColumnParity.test.ts`: asserts that for every stage in `CANONICAL_WORKFLOW_STAGES` the client's stage→field map (`UnifiedScorecard` `STAGE_FIELDS`) references only column names present in the generated `src/integrations/supabase/types.ts` `review_submissions` Row type. This catches *any* future stage added with a missing column — the actual root-cause class, not just this instance.

**Step 4 — End-to-end FM test case (the one you asked for)**
- Extend `src/test/functionalManagerWorkflow.e2e.test.tsx` with the missing write path: map FM → self submit → manager approve → **FM approve with an achieved value, remarks and evidence** → verify persisted FM fields → audit → approved, plus a send-back that clears FM fields and a re-approve.
- Add negative cases: FM approve with no score blocked; FM stage absent from a non-F1 template.
- Verification: `vitest run` — full suite green, plus the existing `reportStageParity` and `kpiDetailsTableFunctionalManagerColumn` guards still passing.

**Step 5 — Live smoke check**
- Drive the FM approve flow in the running app (Playwright, authenticated) on the same KPI from your screenshot and confirm no toast error and the value persists.

**Step 6 — Docs**
- `docs/adr/ADR-196.md` (FM column-set completeness + parity guard), `DOCUMENTATION.md` schema table, `POLICY.md` new clause **§WF-STAGE-COLUMN-COMPLETENESS**: a workflow stage may not be enabled until every peer column (`_score`, `_rating`, `_remarks`, `_achieved_value`, `_evidence_url`, `_evidence_urls`) exists.
- Update the `functional-manager-reviewer` memory to record that the achieved-value/evidence columns now exist.

## Not applicable

Pagination, retention and offline resilience are unchanged by this fix.
