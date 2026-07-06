## Goal

Add a downloadable, day-to-day operational Excel report on the Annual Review Admin → Progress toolbar. Purpose: at a glance see *what form is where, who is stuck, and where to push*.

Two sheets:

1. **Sheet 1 — Status Overview** (one row per employee/instance)
2. **Sheet 2 — Form Responses** (one row per employee × criterion × stage)

Honors the current Admin filters, no 1000-row PostgREST cap, no cross-cutting refactors.

---

## Sheet 1 — Status Overview (columns)

Employee identity + org:
- Employee Name
- Employee Code
- Designation
- Department
- Business Unit
- PMS Grade
- Level
- Reporting Manager (name + code)
- Skip-Level Manager (name + code)
- Dept Head (name + code)
- BU Head (name + code)
- HR Owner (name + code)

Assignment:
- Assigned Template (name) — resolved via `resolveTemplateId` (honors per-employee override)
- Template Override? (Yes / No)
- Assignment Rule (name, if any)
- Enabled Stages (e.g. `Self → Manager → Dept Head → BU Head → HR`)
- Stage Count

Current status (the "who is stuck where" columns):
- Overall Status (e.g. `manager_review_pending`)
- Current Stage (human label of the pending stage — derived from `overall_status` + `enabled_stages`)
- Current Stage Owner (name + code of the reviewer at that stage — resolved from `manager_id / skip_id / dept_head_id / bu_head_id / hr_id`)
- Days in Current Stage (today − last stage transition timestamp)
- Days Since Cycle Start
- Last Updated At

Per-stage submitted-at + weighted score (only for stages in `enabled_stages`; blank otherwise so it's obvious which stages are mapped):
- Self Submitted At, Self Score
- Manager Submitted At, Manager Score
- Skip Submitted At, Skip Score
- Dept Head Submitted At, Dept Head Score
- BU Head Submitted At, BU Head Score
- HR Submitted At, HR Score

Roll-up:
- Criteria Weighted Score
- Total Score
- Final Rating
- Finalized At / Finalized By
- Acknowledged At

**Why these columns:** they answer the 3 stated questions — *what stage is the form at, who owns it now, how long has it been stuck.* "Enabled Stages" + per-stage submitted-at columns make blanks meaningful ("stage not mapped" vs "mapped but pending" vs "done at X").

**Freeze panes** on the first 3 columns; **auto-filter** header row.

---

## Sheet 2 — Form Responses (long-form)

One row per (employee × criterion × stage that responded), plus one row per qualitative field. Chosen over "one row per employee with N score columns" so it stays readable regardless of template size and works for mixed templates in the same cycle.

Columns:
- Employee Name, Employee Code, Department
- Template Name
- Section (Criteria / Qualitative)
- Criterion / Field Key
- Criterion / Field Label
- Max Score (criteria only)
- Reviewer Stage (self / manager / skip / dept_head / bu_head / hr)
- Reviewer Name
- Score (criteria) *or* Text Response (qualitative)
- Submitted At

Two identical blocks in one flat sheet, distinguished by the `Section` column, so admins can pivot in Excel.

---

## Data Flow (no new RPCs)

Everything reuses existing service functions — no schema change, no new RLS surface.

```text
loadRows          = svc.fetchAllInstancesForExport({cycleId, ...filters})   -- already paged via fetchAllPaged
stageScores       = svc.fetchInstanceStageScores(rows.map(r=>r.id))         -- batched .in(200)
templates         = Promise.all(distinct(resolveTemplateId(r)).map(svc.getTemplate))
reviewerProfiles  = .in('id', distinct(manager_id, skip_id, dept_head_id, bu_head_id, hr_id))   -- batched .in(200)
departments+BU    = .in('id', distinct(department_id)) then .in('id', distinct(bu_id))          -- batched
responses (Sheet 2) = fetchAllPaged(annual_review_responses.select(*).in('instance_id', batch).range())
                       -- batched over instanceIds in chunks of 200; per batch uses fetchAllPaged for range walk
rules (optional) = .in('id', distinct(assigned_rule_id))
```

**Pagination policy compliance** (POLICY §94, §109, §110, and `mem://architecture/database/large-export-pagination-policy`):
- Parent instances → `fetchAllInstancesForExport` already uses `fetchAllPaged` + `.order('created_at').range()`.
- Profile / department / BU / template hydration → `.in('id', batch)` in chunks of 200.
- `annual_review_responses` (RLS-heavy child) → walk instance ids in chunks of 100 and pull with `.in('instance_id', batch)`, mirroring `review_submissions` rule.
- No unpaged `.select()`, no embedded joins on paged reads.

Existing `EXCEL_CAP = 5000` guard is kept (workbook safety), but the pagination itself is unbounded up to that cap — no silent 1000-row cutoff.

---

## Files

**New**
- `src/services/annualReview/operationalReport.ts` — pure builder:
  - `buildOperationalReportWorkbook({ cycle, rows, stageScores, templatesById, profilesById, deptsById, buById, responsesByInstance }): XLSX.WorkBook`
  - Helpers: `deriveCurrentStage(row)`, `stageSubmittedAtMap(responses)`, `formatEnabledStages(chain)`.
- `src/services/annualReview/operationalReport.test.ts` — unit tests covering:
  - Sheet 1 header shape + all 40+ columns present.
  - Enabled-stages formatting and blanks for disabled stages.
  - Current-stage owner resolution from `overall_status` + `manager_id/skip_id/...`.
  - Days-in-stage math (mocked `Date.now`).
  - Sheet 2 emits one row per criterion per submitted stage + qualitative rows.
  - Empty-response / no-template safety.
  - Paging regression: driver invoked with 2 pages of `annual_review_responses` (600 + 400) and all 1000 rows appear on Sheet 2 (guards against §110 regression).

**Edited**
- `src/components/annual-review/AnnualReviewExportMenu.tsx` — add a new dropdown item **"Operational status report (Excel)"** under the existing bulk section. Wired to a new `handleOperationalReport()` that:
  1. Runs `loadRows()` (already capped + paged).
  2. Fetches supporting data (stageScores, templates, profiles, depts, BUs, responses) as above.
  3. Calls the pure builder, then `XLSX.writeFile`.
  4. Toast success/failure.
- Gated by the existing `canExcel` role check (`cfg.excelRoles`, defaults admin / hr_pms). No new settings key required for v1; can be added later if the roles need to diverge.

**Docs / policy**
- `DOCUMENTATION.md`: append an entry under "Annual Review → Admin Exports" describing the report and its columns.
- `POLICY.md`: no new rule needed — this consumes existing §94/§109/§110 policies. Note the report in the Annual Review exports feature memory (`mem://features/annual-review/exports.md`).

---

## Risk & Impact

| Area | Impact |
|---|---|
| Data | Read-only, no schema/RLS change |
| Workflow | No user-facing state changes; new menu item only |
| UI/UX | One extra dropdown item in the existing Download menu |
| Regression | Isolated new module + one component wire-up; existing exports untouched |
| Scalability | Paged everywhere; 5000-row workbook cap preserved; Sheet 2 batched over instance ids |
| Mitigation | Unit tests including a paging regression test on `annual_review_responses` |

---

## Out of scope (call out for confirmation)

- Re-import of this workbook. Read-only report.
- PDF version.
- Scheduled / emailed delivery.
- Any change to the existing 3 exports (blank, bulk results, seeding).

If you want any of these included, say so and I'll fold them into the plan before build.
