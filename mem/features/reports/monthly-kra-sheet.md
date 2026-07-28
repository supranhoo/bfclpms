---
name: Monthly KRA Sheet (Annual Review report)
description: "Monthly KRA Scores" sheet in the Annual Review comprehensive export — KRA-template employees only, Jul→Jun /5 + % pairs
type: feature
---

- ADR-188 / POLICY §RPT-MONTHLY-KRA-SHEET.
- Sheet name `Monthly KRA Scores`, appended after `Employees` in the comprehensive workbook.
- Rows: only instances whose resolved template has a `carry_kra` system slot. No KRA employees → sheet omitted.
- Columns: identity → `<Mon> /5` + `<Mon> %` for July…June → `Months Scored`, `Avg /5`, `KRA Points`, `KRA Weight`.
- Unscored month = blank, never `0`.
- Aggregation is server-side: `get_annual_review_monthly_kra_matrix(p_employee_ids, p_fy_start, p_exclude_na)`, admin/hr_pms/management only. Must stay in parity with `compute_carry_kra_contribution`. Never loop `fetchMonthlyKraScores` per employee (BUG-CARRY-TIMEOUT).
- fyStart = `cycle.review_year - 1` (`fyStartFromCycle`). Ids batched 500/call, sheet capped at 5,000 rows, fails soft.
- Code: `src/services/annualReview/monthlyKraSheet.ts`; `isKra` flag added to `fetchTemplateLabelMaps`.
