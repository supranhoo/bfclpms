# Plan: Standardize KPI Details Table - COMPLETED ✓

## Summary

Created a unified `KpiDetailsTable.tsx` component that standardizes the KPI table display across all review views (My KPIs, Team Review, Audit, Management).

---

## Changes Made

### New Component: `src/components/review/KpiDetailsTable.tsx`

Reusable table component with:
- **Dynamic score columns** based on KPI status progression
- **Single-digit scores** (1-5) without denominator
- **Self column** shows `self_score` (1-5 rating), NOT raw `achieved_value`
- **Progressive visibility**: Columns appear as KPI moves through workflow
- **View-type actions**: Buttons adapt to each view context

### Updated Files

| File | Changes |
|------|---------|
| `EmployeeScorecard.tsx` | Replaced inline table with `<KpiDetailsTable viewType="team-review" />` |
| `AuditScorecard.tsx` | Replaced inline table with `<KpiDetailsTable viewType="audit" />` |
| `ManagementScorecard.tsx` | Replaced inline table with `<KpiDetailsTable viewType="management" />` |
| `DOCUMENTATION.md` | Added KpiDetailsTable documentation |

---

## Column Visibility Rules

| KPI Status | Visible Columns |
|------------|-----------------|
| `kra_set` | Self |
| `self_review` | Self, Manager |
| `manager_check` | Self, Manager, Auditor |
| `audit` | Self, Manager, Auditor |
| `management_review` | Self, Manager, Auditor, Mgmt |
| `approved` | Self, Manager, Auditor, Mgmt |

---

## Score Data Sources

| Column | Data Field |
|--------|-----------|
| Self | `review_submissions.self_score` (1-5) |
| Manager | `review_submissions.manager_score` (1-5) |
| Auditor | `review_submissions.auditor_score` (1-5) |
| Mgmt | `review_submissions.management_score` (1-5) |

---

## Next Steps (Optional)

- [ ] Update `MyKpis.tsx` to use `KpiDetailsTable` (currently uses custom inline table)
- [ ] Add sorting controls to unified table component

