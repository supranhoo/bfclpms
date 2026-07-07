
## Assumptions
- The sample sheet you shared is the *master roster* view: one row per employee, one column per data point, regardless of which form (KRA, Management, Workmen, Trainee) that employee is on.
- "Single column" means: if two or more forms need the same measurement (e.g. LTI, 5S, Absent Days), we store/collect it **once** and let each form's scoring pick it up — no duplicate columns per form.
- Scope of this plan is the **admin upload / data-entry surface only**. Scoring, weights, and form rendering stay untouched.

## What's already system-provided today
Two JSON buckets on `annual_review_instances`:

- `system_scores` — 8 System KPIs (LTI, STI, UA/UC/Near Miss, 5S, Trainings, PM10, Production, Preventive Maintenance).
- `eligibility_inputs` — 4 keys today: `absent_days`, `lwp_days`, `disciplinary_actions`, plus one custom eligibility gate.

Right now each of these is entered/edited from a different place (System Scores panel, Eligibility Editor, HR sheet). Your BFCL forms workbook already imports *weights*, but there is **no single-sheet uploader for the per-employee raw values** — that is the gap.

## Additional items that are safe to upload from one sheet
Beyond the 8 System KPIs already on your image, the following are per-employee, source-of-truth values that HR/Admin key in today from multiple screens and are ideal for a single-sheet upload:

1. **Eligibility inputs** (drive gates + penalties, shared across every form):
   - Absent Days (AB)
   - LWP Days
   - Disciplinary Actions (count or Y/N)
   - Date of Joining (already on master, used for pro-rating)
   - Has KRA flag (already on master, drives A vs B/C/D routing)
2. **System KPI raw values** (one column each, shared across every form that uses them):
   - LTI, STI, UA/UC/Near Miss (self-reported), 5S score, Trainings Attended, Fugitive PM10 days, Annual Production % achievement, Annual PM % achievement
3. **HR-final overrides that are keyed in bulk today**:
   - HR Remarks (free text)
   - Final Rating override (optional)
   - Eligibility Remark

Nothing else on the instance is "raw input" — everything else is either computed (weighted score, total), stage-scored (self/manager/skip/BU/HR criterion scores), or structural (template, manager chain). Those must NOT be part of this uploader.

## Shared-column consolidation (answer to "single column?")
Verified against the 4 archetypes (A KRA / B Management / C Workmen / D Trainee):

| Column | A | B | C | D | Verdict |
|---|---|---|---|---|---|
| Absent Days, LWP, Disciplinary | ✓ | ✓ | ✓ | ✓ | **Single column** |
| LTI, STI, UA/UC/NM, 5S, Trainings | ✓ | ✓ | ✓ | ✓ | **Single column** |
| PM10 | dept-scoped (Env/Prod) | dept-scoped | dept-scoped | — | **Single column** — resolver already handles dept weight |
| Production % | dept-scoped (Prod only) | dept-scoped | dept-scoped | — | **Single column** — weight resolver zeroes out non-Prod depts |
| PM % | dept-scoped (Maint only) | dept-scoped | dept-scoped | — | **Single column** — same |
| Has KRA / DOJ / Company / Division / BU / Dept | ✓ | ✓ | ✓ | ✓ | **Single column** (already on employee master; sheet is read-only for these) |

Result: every column in your sample sheet is safe to collapse to one, because the per-form differentiation is done by the **weight matrix** (`annual_review_system_kpi_weights` + `annual_review_criteria_assignments`), not by duplicating the raw value.

## Proposed uploader
Add one panel to Annual Review → Settings called **"Bulk Data Upload"** with:

1. **Download template (XLSX)** — one row per active employee in the selected cycle, pre-filled with read-only master columns (Employee Code, Name, Has KRA, DOJ, Company, Division, BU, Dept) and blank editable columns: `AB, LWP, LTI, STI, UA_UC_NM, PM10, Production, 5S, Trainings, Disciplinary Action, HR Remarks`.
2. **Upload & dry-run preview** — parse, match `Employee Code`, classify each row Apply / Skip / Error, show diffs for the JSON keys that will change, cap 5000 rows.
3. **Commit** — writes only to `annual_review_instances.system_scores`, `.eligibility_inputs`, `.hr_remarks` for rows in the selected cycle, on stage-safe statuses (`not_started`, `pending_self`, `pending_manager`) — never overwrites finalized rows.
4. **Audit** — one `system_audit_log` row per changed instance (`annual_review.bulk_data_upload`), storing before/after JSON.

## Files to touch (build phase — for reference only)
- `src/lib/annualReview/bulkDataWorkbook.ts` — new: builder + parser (mirrors `bfclFormsWorkbook.ts`).
- `src/services/annualReview/bulkDataImport.ts` — new: dry-run + commit (mirrors `bfclFormsImport.ts`, but writes instance JSONs).
- `src/components/annual-review/BulkDataUploadDialog.tsx` — new dialog.
- `src/pages/annual-review/AnnualReviewAdmin.tsx` — mount the new card in Settings.
- Tests: `bulkDataWorkbook.test.ts`, `bulkDataImport.test.ts` (round-trip + dry-run classification + stage guard).
- Docs: `DOCUMENTATION.md` §"Annual Review Uploads", `POLICY.md` §AR-BULK-DATA-UPLOAD (stage gate, override rules).

## Risk & Impact
- **Data**: additive, JSONB merges — no schema change, no destructive migration. Rollback = revert three new files.
- **Workflow**: stage guard prevents overwriting scored/finalized rows; matches existing template-override guard.
- **UI**: one new card in Settings tab; no change to reviewer/employee screens.
- **Scalability**: 5000-row cap, chunked writes of 500 (same pattern as BFCL import).

## Open question (please confirm before build)
Should the uploader also **write to `system_scores` directly**, or only to `eligibility_inputs` + master-data columns, leaving System KPI raw values to the existing System Scores panel? Your sample sheet includes them, so my default is "yes, write both" — flag if you want them read-only.
