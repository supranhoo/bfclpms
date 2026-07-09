## Goal
Two UX improvements to the **Bulk Data Upload** dialog (Annual Review cycle):
1. Make the dialog significantly wider so the preview table has room to breathe.
2. Add a **Template** column in the dry-run preview so HR can see which form each employee is assigned to.

## Risk & Impact Report
- **Data Impact:** None. Pure UI + a passthrough of a field that already exists on `plan.instances[].templateName`.
- **Workflow Impact:** None. Parse/commit logic unchanged.
- **UI/UX Impact:** Dialog width grows from `max-w-4xl` (~896px) to `max-w-[95vw]` with `w-[1400px]` cap so it stays comfortable on wide monitors and still fits smaller screens. Preview table gains one column.
- **Regression Risk:** Low — additive field on `DryRunRow`, existing tests already assert row shape by property (won't break).
- **Mitigation:** Extend existing test to assert `templateName` is populated on the row.

## Plan

### 1. `src/services/annualReview/cycleBulkDataUpload.ts`
- Add optional `templateName?: string` to `DryRunRow`.
- Populate it in all 4 `rows.push(...)` sites inside `parseAndDryRun`:
  - unknown employee → `''` (unknown)
  - locked stage → `inst.templateName`
  - no-change skip → `inst.templateName`
  - apply → `inst.templateName`

### 2. `src/components/annual-review/CycleBulkDataUploadDialog.tsx`
- Change `<DialogContent>` classes from `max-w-4xl max-h-[90vh] overflow-y-auto` to `max-w-[95vw] w-[1400px] max-h-[92vh] overflow-y-auto` so the modal grows on desktop and remains responsive.
- Bump preview scroll region from `max-h-64` to `max-h-[420px]` to take advantage of the taller dialog.
- Add a **Template** column between **Name** and **Verdict** in both `<TableHeader>` and `<TableBody>`, rendered as a small muted-text cell (`text-xs text-muted-foreground`).

### 3. Tests — `src/test/annualReview/cycleBulkDataUploadPartialApply.test.ts`
- Add one assertion in the existing "applies 5S even when LTI…" case: `expect(report.rows[0].templateName).toBeDefined()` and equals the plan's template name (extend the test plan to set `templateName: 'T'` on the instance — already set).

### 4. Docs & Policy
- **DOCUMENTATION.md** — Add v2.66.96 entry: "Bulk Data Upload dialog widened; dry-run preview now shows the assigned template per row."
- **POLICY.md** — Extend `§AR-BULK-UPLOAD-PREVIEW` (or append a new bullet if the section doesn't call this out): the dry-run preview MUST surface the employee's resolved template so HR can spot template misassignment before commit.

## Rollback
Revert the four files. No schema, no data migration.

## Not applicable
- No new RPCs, RLS, storage, or edge functions.
- No new dependencies.
