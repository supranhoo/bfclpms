# Fix: Workflow Progress bar missing Skip-Level & HR PMS stages

## Root cause

In `src/components/dashboard/KpiTimeline.tsx` (lines 199–209), `allWorkflowStages` is hardcoded to only 6 stages:

```text
kra_set → self_review → manager_check → audit → management_review → approved
```

It is missing `skip_level_check` and `hr_pms_review`. The component then filters this hardcoded list by `propStages`, so even when the resolved workflow for the KPI contains those stages, they cannot appear — the filter drops them. That is why the bar in screenshot 3 jumps `Manager → Audit → Management` even though the journey card and DB both confirm the KPI actually traveled `Manager → Skip-Level → HR PMS → Approved`.

The canonical stage keys already exist in `src/lib/reviewConstants.ts → statusLabels` (`skip_level_check`, `hr_pms_review`), so this is purely a presentation fix.

## Risk & Impact

- **Data**: None. UI-only change.
- **Workflow**: None. No business logic touched.
- **UI/UX**: Workflow Progress bar now renders the true chain — adds two stage circles for templates that include them; unchanged for templates that don't (filtered out by `propStages`).
- **Regression**: Low. `currentStageIndex` uses `kpi.status` against the same canonical keys; adding entries cannot break existing 6-stage templates.
- **Scalability**: None.

## Change

`src/components/dashboard/KpiTimeline.tsx` — extend `allWorkflowStages`:

```text
kra_set → self_review → manager_check → skip_level_check → hr_pms_review → audit → management_review → approved
```

Icons: reuse `UserCog` (Skip-Level) and `ClipboardCheck` (HR PMS) from `lucide-react` to stay consistent with KpiJourneySection.

That's it. No other files change.

## Tests

- `src/test/kpiTimelineStages.test.ts` — unit-test that the exported stage list contains all 8 canonical keys in order, and that filtering by a `propStages` subset preserves order + drops unconfigured stages.

## Docs

- `DOCUMENTATION.md` — v2.66.13.5 entry noting Review Timeline now renders Skip-Level and HR PMS.
- `POLICY.md` — no change (no policy shift).
- `mem/features/review/bulk-review-dashboard` — append a one-liner that Workflow Progress bar uses the 8-stage canonical list filtered by resolved workflow.

## Out of scope (per your answer)

- Adding/relabelling `BULK_STAGE_SIGNOFF_*` rows in the audit timeline.
- Any change to `bulk_write_stage_scores` or score cascade.
