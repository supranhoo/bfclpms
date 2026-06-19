## Goal

Add a single, role-gated **Download / Template** menu on the Annual Review Admin → Progress toolbar (next to *Progress snapshot* and *Bulk workbook*) that exposes four downloads. All exports respect the page's current filters (cycle, search, status, BU, dept, manager, custom-weights). Visible only to `admin` + `hr_pms`.

## Risk & Impact Report

- **Data Impact:** Read-only exports. No schema, no RLS change. Reuses `svc.fetchAllInstancesForExport`, `fetchInstanceStageScores`, `getTemplate`, `annual_review_responses`. New optional `workflow_settings` keys `annual_review_export_*` (additive, defaulted).
- **Workflow Impact:** None. Seeding template *download* only — re-import is out of scope for v1 (called out below).
- **UI Impact:** One new `DropdownMenu` button on Admin → Progress toolbar; no layout shift. PDF preview reuses existing `KraPreviewDialog` pattern.
- **Regression Risk:** Low — additive component + service helpers. Existing *Progress snapshot* and *System scores* dialogs untouched.
- **Scalability:** Reuses paginated `fetchAllInstancesForExport` (already capped + batched). PDF generation per-employee is on-demand only; bulk PDF disabled for >50 rows with a guarded toast.
- **Mitigation:** Role gate at component level *and* server (RLS already restricts the reads). Hard row cap = 5,000 for Excel bulk, 50 for PDF bulk.

## Plan

### 1. Role-gated entrypoint
- New `AnnualReviewExportMenu` component on `AnnualReviewAdmin.tsx` toolbar.
- Visibility: `effectiveRole in ['admin','hr_pms']`. Optional `workflow_settings` override (`annual_review_export_roles`) parsed like `useKraExportConfig`.

### 2. Four download options

| # | Option | What it produces |
|---|---|---|
| A | **Blank reviewer template (Excel)** | One workbook per cycle. Sheet 1: instructions. Sheet 2: criteria grid (Employee Code, Full Name, Designation, BU, Dept, Manager, then one column per template criterion grouped by section + comments column per stage). Empty cells. |
| B | **Blank reviewer template (PDF)** | Per-employee printable KRA-style sheet (header = company + cycle + employee block; body = sections × criteria with scoring scale legend; footer = signature blocks for Self/Manager/Skip/BU/HR). Single PDF or per-employee zip. |
| C | **Bulk results export (Excel)** | Same row set as Progress snapshot but expanded: instance core + per-stage scores + per-criterion scores (from `annual_review_responses`) + eligibility inputs + system scores + final rating + override flags. Admin-configurable column visibility via `annual_review_export_columns` (workflow_setting JSON; defaults = all). |
| D | **Cycle seeding template (Excel)** | Pre-populated workbook (employees × criteria) for offline drafting; columns marked "Score" and "Comment" per stage, with data-validation drop-downs from the template's rating scale. Re-import is **NOT** in v1 (explicit out-of-scope note in the menu tooltip). |

### 3. Service layer additions (no UI logic)
- `src/services/annualReview/exports.ts`:
  - `buildBlankReviewerWorkbook(cycle, template, rows)`
  - `buildReviewerPdfBlob(cycle, template, employee, config)` (reuses `jspdf` + `jspdf-autotable` already in `kraExport.ts`)
  - `buildBulkResultsWorkbook(cycle, instances, responses, scores, templatesById, visibleColumns)`
  - `buildSeedingWorkbook(cycle, template, rows)`
- Each helper is pure and unit-testable; no DB calls inside.

### 4. Configuration (zero-hardcoding)
New `workflow_settings` keys (category=`export`), all optional with safe defaults:
- `annual_review_export_enabled` (bool, default true)
- `annual_review_export_roles` (string[], default `['admin','hr_pms']`)
- `annual_review_export_pdf_roles` (string[], default `['admin','hr_pms']`)
- `annual_review_export_columns` (string[], default = all known columns)
- `annual_review_export_show_logo` / `_show_employee_details` (bool, default true)

Read via a new `useAnnualReviewExportConfig` hook mirroring `useKraExportConfig`.

### 5. PDF rendering
- Reuses existing PDF helpers (`generateKraSheetPdfBlob` pattern) → new `generateAnnualReviewPdfBlob` in `src/lib/annualReviewExport.ts`.
- Preview through existing `KraPreviewDialog` (rename-safe wrapper or generic `PdfPreviewDialog`).
- Per-employee picker dialog: search employees in current filter scope, choose one → preview/download.
- Bulk PDF (cap 50): zips per-employee PDFs client-side via `jszip` (already a transitive dep — verify; if not present, fall back to multi-page single PDF).

### 6. Tests (vitest)
- `exports.test.ts`: snapshot column order for each workbook; empty-template safety; criterion grouping order matches `template.sections`.
- `useAnnualReviewExportConfig.test.ts`: role gating, default values, JSON parsing.
- `annualReviewPdfExport.test.ts`: PDF blob size > 0; header contains cycle + employee code; signature block present.

### 7. Documentation & Policy
- `DOCUMENTATION.md` → new "Annual Review → Exports" subsection (4 options, roles, configs, row caps).
- `POLICY.md` → add export-access clause (Admin + HR PMS only by default, configurable).
- Memory file `mem/features/annual-review/exports.md`.

## UI Changes

- **Location:** `AnnualReviewAdmin.tsx` → Progress tab toolbar, between *Progress snapshot* and *Bulk workbook*.
- **Trigger:** `Download ▾` outline button with `FileDown` icon.
- **Menu items:** Blank reviewer template (Excel) · Blank reviewer template (PDF) · Bulk results export (Excel) · Cycle seeding template (Excel).
- **Disabled states:** "no rows in filter" → menu disabled with tooltip; >5000 rows → Excel disabled; >50 rows → PDF disabled.
- **Per-PDF flow:** opens `EmployeePickerDialog` → `PdfPreviewDialog` (reused).
- Responsive: button collapses to icon below `sm`.

## Out of Scope (v1)

- Seeding template re-import (planned for v2 once the column contract is locked).
- Email-to-reviewer (would need SMTP config; stubbed "Coming soon" like KRA Export).
- Per-stage role-scoped exports (Manager/Skip/BU view) — explicitly excluded per role answer.

## Tests + Mock Data

Mock cycle + template (3 sections × 4 criteria), 6 instances spanning every stage, with/without overrides, including N/A criteria. Covers Excel column ordering, PDF rendering, role gating, and row caps.

## Rollback

Pure additive: remove the new menu file, the `exports.ts` helpers, the `annualReviewExport.ts` lib, the hook, and the four `workflow_settings` keys. No schema migration, so rollback = revert PR.
