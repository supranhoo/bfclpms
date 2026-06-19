---
name: Annual Review Admin Exports
description: Download menu (Excel + PDF) on Annual Review Admin → Progress toolbar — role-gated, filter-aware, capped
type: feature
---

- Entry point: `AnnualReviewExportMenu` on `AnnualReviewAdmin.tsx` Progress toolbar (between Bulk workbook). Visible only when `effectiveRole` is in `cfg.excelRoles` or `cfg.pdfRoles`.
- Roles default to `['admin','hr_pms']`; configurable via `workflow_settings` category `export`, keys:
  - `annual_review_export_enabled` (bool)
  - `annual_review_export_roles` (string[])
  - `annual_review_export_pdf_roles` (string[])
  - `annual_review_export_columns` (string[]) — controls bulk results column visibility
  - `annual_review_export_show_logo`, `annual_review_export_show_employee_details` (bool)
- Four downloads, all respect the current Admin filter set (search, status, BU, dept, manager, custom-weights):
  1. Blank reviewer template (Excel) — one row per employee, one column per template criterion + per-stage comment columns.
  2. Blank reviewer template (PDF) — per-employee, picker → preview via `KraPreviewDialog`. Includes rating-scale legend + 5-stage signature block.
  3. Bulk results export (Excel) — per-instance core fields + per-stage weighted scores + system/eligibility JSON; columns honor `annual_review_export_columns`.
  4. Cycle seeding template (Excel) — employees × criteria, Score + Comment per stage. Re-import is OUT OF SCOPE v1.
- Caps: Excel hard cap 5000 rows; PDF picker hard cap 50 rows. Both enforced client-side with a guarded toast.
- Builders live in `src/services/annualReview/exports.ts` (pure, no DB) — UI fetches rows via `svc.fetchAllInstancesForExport`, `svc.fetchInstanceStageScores`, `svc.getTemplate`, `svc.listResponses` and passes them in.
- Tests: `src/services/annualReview/exports.test.ts` covers header shape, visibleColumns gating, row math, PDF blob size, empty-criteria safety.