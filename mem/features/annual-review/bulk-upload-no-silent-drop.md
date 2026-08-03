---
name: Bulk upload no silent drop (ADR-239)
description: Annual Review bulk upload must report every filled cell as applied/skipped/ignored; eligibility corrections on locked rows go through an audited RPC
type: feature
---
POLICY §AR-BULK-UPLOAD-NO-SILENT-DROP.

- A filled cell whose column is absent from the employee's effective template is
  ignored with a per-cell warning, counted in `DryRunReport.ignoredCellCount` and
  broken down in `ignoredByColumn`. Never `if (!slot) continue;`.
- `downloadBulkTemplate` writes literal `n/a` in non-applicable cells; the importer
  treats `n/a` as untouched.
- Eligibility inputs on completed/mid-workflow rows require the admin opt-in
  "Also correct eligibility inputs on locked reviews" and route through
  `admin_apply_eligibility_inputs_correction` (admin/hr_pms, reason ≥ 10 chars,
  audited, never changes `overall_status`).
- Regression: `src/services/annualReview/__tests__/bulkUploadNoSilentDrop.test.ts`.
