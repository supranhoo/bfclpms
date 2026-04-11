

## Revised Plan: Multi-Factor Compliance KPI Data Entry + All-Level Visibility

### Change from Previous Plan
Sub-factor values (Policy Compliance, Submission Date, Policy Training, Other Observation) along with Achieved value will be visible at **ALL review levels** — Employee, Manager, Skip-Level, HR PMS, Auditor, Management, and Admin — not just the employee self-score tile.

### The 4 Sub-Factors (Reference Fields)

| # | Factor | Input Type | Source |
|---|--------|-----------|--------|
| 1 | Policy Compliance | Yes/No dropdown | Manual by HR |
| 2 | Self Review & Team KPI Submission Date | Auto-fetched date | System computes (excl. org, sent-back, not-due frequency KPIs) |
| 3 | Policy Training | Yes/No dropdown | Manual by HR |
| 4 | Other Observation | Numeric input | Manual by HR |

### Admin Data Entry UI

```text
┌────┬──────────────┬────────┬─────────────┬──────────────────────┬─────────────┬───────────┬──────────┬────────┬────────┐
│ ☐  │ Employee     │ Target │ Policy      │ Submission Date      │ Policy      │ Other     │ Achieved │ Rating │ Remark │
│    │              │        │ Compliance  │ (auto)               │ Training    │ Obs.      │          │        │        │
├────┼──────────────┼────────┼─────────────┼──────────────────────┼─────────────┼───────────┼──────────┼────────┼────────┤
│ ☑  │ K Srinivasa  │ 0      │ [Yes ▾]     │ 15 Mar 2026 ✓       │ [Yes ▾]     │ [__0__]   │ [__0__]  │ 5-Exc  │ ...    │
│ ☑  │ Manish Singh │ 0      │ [No  ▾]     │ — (2 KPIs pending)  │ [No  ▾]     │ [__2__]   │ [__4__]  │ 1-Poor │ ...    │
└────┴──────────────┴────────┴─────────────┴──────────────────────┴─────────────┴───────────┴──────────┴────────┴────────┘
```

### All-Level Visibility — Review Journey Stage Cards

Every `ReviewStageCard` in `KpiJourneySection` (Self, Manager, Auditor, HR PMS, Management, Skip-Level) will show the sub-factors as a read-only info block **when viewing the compliance KPI**. The sub-factors appear once at the top of the Review Journey section (not repeated in each stage card), since they are KPI-level metadata, not stage-specific:

```text
┌─ Review Journey ─────────────────────────────────────────────────────┐
│ ┌─ Compliance Factors ─────────────────────────────────────────────┐ │
│ │ Policy Compliance: Yes │ Submission: 15 Mar 2026 ✓              │ │
│ │ Policy Training: No   │ Other Observation: 1   │ Achieved: 2    │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ┌──Self──┐ ┌──Manager──┐ ┌──Auditor──┐ ┌──Management──┐            │
│ │ Score:3│ │ Score: 2  │ │ Pending   │ │ Pending      │            │
│ │ ...    │ │ ...       │ │           │ │              │            │
│ └────────┘ └───────────┘ └───────────┘ └──────────────┘            │
└──────────────────────────────────────────────────────────────────────┘
```

This is visible to **all roles** — employee, manager, auditor, hr_pms, management, skip_level, admin — since `KpiJourneySection` is shared across all views.

### Database Change

```sql
ALTER TABLE org_kpi_values ADD COLUMN sub_factors jsonb DEFAULT NULL;
```

Structure:
```json
{
  "policy_compliance": true,
  "submission_date": "2026-03-15",
  "submission_complete": true,
  "submission_pending_count": 0,
  "policy_training": true,
  "other_observation": 0
}
```

### Implementation Plan

| # | File | Change |
|---|------|--------|
| 1 | **Migration** | Add `sub_factors jsonb DEFAULT NULL` to `org_kpi_values` |
| 2 | `src/hooks/useComplianceSubFactors.ts` (new) | Hook to auto-fetch submission completion date per employee; also hook to read `sub_factors` from `org_kpi_values` for a given employee/KPI/period |
| 3 | `src/components/admin/OrgKpiScopedEntryTable.tsx` | Detect compliance KPI by KRA name. Render 4 sub-factor columns before the Achieved column. Achieved remains manual input by HR |
| 4 | `src/hooks/useOrgKpiValues.ts` | Include `sub_factors` in read/upsert operations |
| 5 | `src/components/admin/OrgKpiEntryCard.tsx` | Pass KRA name and sub-factor data through save payload |
| 6 | `src/components/review/KpiJourneySection.tsx` | For the compliance KPI (KRA name match "Implementation of common"), fetch `sub_factors` from `org_kpi_values` and render a read-only "Compliance Factors" info banner **above** the stage cards grid. Visible at all view levels |
| 7 | `DOCUMENTATION.md` | Document v2.33.8 |
| 8 | `POLICY.md` | Sync version |

### Key Technical Details

- **Compliance KPI detection**: Match KRA name containing `"Implementation of common"` (same pattern used in penalty hooks)
- **Submission date auto-fetch**: For each employee, query non-excluded KPIs. If all past `self_review`, show latest `updated_at` from `review_submissions`. Otherwise show "X KPIs pending"
- **Achieved value**: Entirely manual — HR enters their own number after reviewing the 4 factors
- **All-level visibility**: The `KpiJourneySection` component is shared by all roles. The sub-factors banner renders once above the stage grid, so every viewer (employee, manager, auditor, hr_pms, management, skip_level, admin) sees it
- **Backward compatibility**: Missing `sub_factors` = banner hidden

### Risk Assessment
- **Data impact**: Additive JSONB column only, no existing data modified
- **Regression risk**: Low — sub-factor banner is conditionally rendered only for compliance KPI
- **Visibility**: All roles see the same read-only data — no new write permissions needed
- **Backward compatibility**: Existing KPIs without sub-factors unaffected

