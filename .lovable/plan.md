

# Fix Swapped Export Fields and Score Fallback Gaps

## Problem 1: Export Fields Are Swapped

In the "Export Current Data" feature, `rating` and `kpiWeightageScore` are mapped backwards compared to the PMS Scorecard Import definition:

| Field | Your Import Definition | Current Export (WRONG) |
|---|---|---|
| `rating` | Raw score (1-5) from final achievement | `final_score * weightage / 100` (weighted score) |
| `kpiWeightageScore` | `weightage * rating` (weighted score) | `final_score` (raw score) |

**Fix**: Swap them so export matches import.

---

## Problem 2: Score Fallback Chain Bugs (8 locations)

Multiple files use `||` (truthy check) instead of `??` (nullish check), which **drops legitimate 0 scores**. Many also skip intermediate review levels (manager, auditor, management).

| File | Line | Current (Broken) | Fix |
|---|---|---|---|
| `Dashboard.tsx` | ~261 | `final_score \|\| self_score \|\| 0` | Full `??` chain |
| `Dashboard.tsx` | ~545 | `final_score \|\| self_score` | Full `??` chain |
| `SelfReview.tsx` | ~197 | `final_score \|\| self_score \|\| 0` | Full `??` chain |
| `SelfReview.tsx` | ~233 | `final_score \|\| self_score \|\| 0` | Full `??` chain |
| `MyKpis.tsx` | ~238 | `final_score \|\| self_score \|\| 0` | Full `??` chain |
| `PerformanceReport.tsx` | ~51,68 | `final_score \|\| self_score \|\| 0` | Full `??` chain |
| `MobileKpiCard.tsx` | ~35 | `final_score \|\| self_score` | Full `??` chain |
| `KpiTrackerModal.tsx` | ~61 | `final_score \|\| self_score \|\| 0` | Full `??` chain |
| `KpiHistoryCard.tsx` | ~46 | `final_score \|\| manager_score \|\| self_score` | Full `??` chain |
| `KpiReviewPanel.tsx` | ~86 | `final_score ?? self_score` (missing levels) | Full `??` chain |

**Standard fix for all**: Replace with the system-standard chain:
```
final_score ?? management_score ?? auditor_score ?? manager_score ?? self_score ?? 0
```

---

## Problem 3: Import Uses `kpiWeightageScore` as Weightage Fallback

Line 1036 does: `weightage: row.kpiWeightage || row.kpiWeightageScore || 0`

This incorrectly uses `kpiWeightageScore` (a weighted score value) as a fallback for `weightage` (a percentage). This should only use `row.kpiWeightage`.

---

## Files to Modify

| File | Changes |
|---|---|
| `src/pages/admin/ImportData.tsx` | Swap `rating`/`kpiWeightageScore` in export (lines 1720-1723); fix weightage fallback (line 1036) |
| `src/pages/Dashboard.tsx` | Fix 2 score fallback locations (~261, ~545) |
| `src/pages/SelfReview.tsx` | Fix 2 score fallback locations (~197, ~233) |
| `src/pages/MyKpis.tsx` | Fix 1 score fallback location (~238) |
| `src/pages/reports/PerformanceReport.tsx` | Fix 2 score fallback locations (~51, ~68) |
| `src/components/dashboard/MobileKpiCard.tsx` | Fix 1 score fallback location (~35) |
| `src/components/dashboard/KpiTrackerModal.tsx` | Fix 1 score fallback location (~61) |
| `src/components/review/KpiHistoryCard.tsx` | Fix 1 score fallback location (~46) |
| `src/components/review/KpiReviewPanel.tsx` | Fix 1 score fallback location (~86) |
| `DOCUMENTATION.md` | Document corrected export field mapping and standardized fallback chain |

