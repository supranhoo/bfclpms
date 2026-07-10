## Fix: "Eligibility inputs pending" on Jitendra Bharti (and every other in-progress instance)

### Root cause
`annual_review_instances.eligibility_inputs = {}` for Jitendra. The template has 4 criteria but:

- The only editor (`EligibilityInputsEditor`) is mounted inside `HrFinalizationSheet` — visible only at the last stage. During `pending_self` / manager / BU-head / dept-head stages, no one can fill it.
- Bulk upload path exists (`cycleBulkDataUpload.ts`) but HR did not run it for this cycle.
- Service-tenure criterion (`6 Month Completion as on 30 Jun 2026`) is derivable from `profiles.doj` but is never auto-computed.

### Fix plan (surgical, additive only — no schema changes)

**1. Auto-fill derivable criteria on read**
- New helper `src/lib/annualReview/eligibilityAutoFill.ts`:
  - `deriveAutoInputs(criteria, profile, cycle)` → returns overrides for tenure-style criteria whose `name`/`description` matches "service", "month completion", "tenure" using `profile.doj` and `cycle.review_year` (30-Jun anchor).
- `SystemScoresPanel` merges auto-derived values over `eligibility_inputs` before formatting `actual`, so the tenure row shows the real months and evaluates ✓/✗ without HR entry.
- Persisted `eligibility_inputs` remain the SSOT for auditable fields; auto-derived values are display-only overrides (never silently written).

**2. Let HR/Admin edit eligibility from the detail page at any stage**
- In `TeamReviewDetailContent.tsx`, when the current viewer has role `hr_pms` or is `admin` AND `instance.eligibility_inputs` is empty/incomplete, render a small **"Fill eligibility inputs"** button beside the "Eligibility inputs pending" header.
- Button opens a `Dialog` mounting the existing `EligibilityInputsEditor` (no duplication). Save uses the existing `updateEligibilityInputs` RPC/service.
- Non-HR reviewers keep the read-only view they see today.

**3. Prompt for bulk upload from Admin → Annual Review**
- Add a one-line hint above the cycle progress tab: *"{N} of {M} instances have no eligibility inputs — use Bulk Data Upload."* with a link that opens the existing `CycleBulkDataUploadDialog` pre-filtered to eligibility columns.

**4. Docs**
- Update `mem/features/annual-review/overview.md` + `POLICY.md` §AR-ELIGIBILITY:
  - HR enters Absent Days / LWP / Disciplinary via per-instance dialog or bulk upload.
  - Service-tenure criteria auto-derive from `profiles.doj` (display + evaluation).
  - Remark still required only when a criterion fails.

**5. Tests**
- `src/test/annualReview/eligibilityAutoFill.test.ts`:
  - DOJ = 1 Jan 2026, cycle 2025-26 → 5 months → fails "At least 6".
  - DOJ = 1 Jun 2025 → 13 months → passes.
  - Non-tenure criteria untouched by auto-fill.
- Component test: HR sees the "Fill eligibility inputs" button at `pending_self`; other roles do not.

### Files touched
- **new** `src/lib/annualReview/eligibilityAutoFill.ts`
- **edit** `src/components/annual-review/SystemScoresPanel.tsx` (merge auto values before render/evaluate)
- **edit** `src/components/annual-review/TeamReviewDetailContent.tsx` (HR-only inline edit dialog)
- **edit** `src/pages/annual-review/AnnualReviewAdmin.tsx` (missing-inputs hint + bulk link)
- **edit** `mem/features/annual-review/overview.md`, `POLICY.md`
- **new** `src/test/annualReview/eligibilityAutoFill.test.ts`

### Out of scope
- No DB migration, no changes to `updateEligibilityInputs` RPC signature, no changes to how failed criteria block the workflow, no change to the current auto-skip stage logic.

### Regression risk
Low — display-side merge + one additional dialog. Auto-derived values do not mutate persisted data. Existing HR finalization editor unchanged.
