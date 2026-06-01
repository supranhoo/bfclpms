# Add Evidence Attachments to "Edit Calculated Row" (Increment)

## Goal
HR/Admin overriding an increment_run_items row can attach supporting evidence (upload **and** Ctrl+V paste) for screenshots, PDFs, Word, Excel, and images. Evidence is tied to the row, visible on reopen, openable/removable, and surfaced in exports as a Yes/No flag.

## Risk & Impact
- **Data**: additive `evidence_urls jsonb` column on `public.increment_run_items` (default `[]`). No back-fill, no destructive change. Existing rows unaffected.
- **Workflow**: none — calculation, slab, GDOJ prorating, confirmation adjustment logic untouched.
- **UI/UX**: one new section in the existing `IncrementResultEditDialog`; identical look/feel to other evidence sections (reuses `MultiFileUpload`).
- **Security**: uses existing `review-evidence` bucket and its RLS. Path namespaced under `increment-overrides/<run_item_id>/...` to keep linkage explicit. File-type allowlist enforced client-side; bucket RLS already restricts who can read.
- **Regression risk**: low — `MultiFileUpload` is widely used; extending its accepted-types via an additive prop preserves all current callers.
- **Mitigation**: feature is opt-in (the dialog passes the new prop). All existing dialogs that use `MultiFileUpload` keep the JPEG/PNG/PDF/XLSX-only behaviour because the new prop defaults to off.

## Scalability
- `evidence_urls` is a JSONB array of public URLs (same convention used across review_submissions). Cap at **10 files per row** in UI.
- Excel export adds one cheap derived column (`Yes/No` based on array length). No additional query.

## Plan

### 1. Database migration (additive)
Add `evidence_urls jsonb DEFAULT '[]'::jsonb` to `public.increment_run_items`. Re-grant unchanged (existing grants cover all columns). No new RLS — existing row policies apply to the new column.

### 2. Extend `MultiFileUpload` (backwards-compatible)
Add optional prop `extraAcceptedTypes?: Record<string, { ext: string; icon: any }>`. When provided, the component merges them into `ACCEPTED_TYPES` for validation, into the `<input accept>` list, and into the icon lookup. All existing call sites unchanged.

For pasted images without filenames, generate `increment-override-evidence-<employeeCode>-<timestamp>.png` on the *consumer* side by wrapping the upload — handled inside the dialog via a thin wrapper that renames the `File` before calling `MultiFileUpload`. The simplest approach: pass an `onBeforeUploadFilename?: (file) => string` hook.

### 3. Edit Calculated Row dialog
In `src/components/incentive/IncrementResultEditDialog.tsx`:
- Add state `evidenceUrls: string[]` seeded from `row.evidence_urls ?? []`.
- Render a new section "Supporting Evidence" under Remarks using `<MultiFileUpload userId={currentUserId} contextId={row.id} folder="increment-overrides" existingUrls={evidenceUrls} onUploadComplete={setEvidenceUrls} maxFiles={10} extraAcceptedTypes={WORD_DOC_TYPES} label="Supporting Evidence" />` with helper text *"Supported: JPG, PNG, PDF, Word, Excel, screenshots. Paste with Ctrl+V."*
- On Save include `evidence_urls` in the patch.
- On Cancel, just close (uploaded files remain in storage but are unreferenced — same pattern as review evidence; acceptable per existing convention).

### 4. Update mutation whitelist
In `src/hooks/useIncrementRuns.ts`:
- Add `'evidence_urls'` to `EDITABLE_RUN_ITEM_FIELDS`.
- Extend `IncrementRunItemRow` interface with `evidence_urls?: string[] | null`.

### 5. Export
In `useExportLatestIncrementResults` (and any Excel column map for this report), add a derived column `Evidence Attached` = `(evidence_urls?.length ?? 0) > 0 ? 'Yes' : 'No'`. Also add `Evidence Count`. No file embedding.

### 6. Audit trail
`manually_edited`, `edited_by`, `edited_at` already capture the override. Because the patch now includes `evidence_urls`, the same audit fields cover evidence changes — no extra table needed.

### 7. Tests
- Unit: extend existing `useIncrementRuns` test (or add one) asserting the whitelist accepts `evidence_urls` and rejects unknown fields.
- Unit: `MultiFileUpload` accepts DOCX when `extraAcceptedTypes` is passed; rejects `.exe`.
- Mock data: a sample `increment_run_items` row with two evidence URLs to verify display on reopen.

## Files touched
- `supabase/migrations/<new>.sql` — add column.
- `src/components/ui/MultiFileUpload.tsx` — additive `extraAcceptedTypes` prop + filename helper.
- `src/components/incentive/IncrementResultEditDialog.tsx` — new section + state + save.
- `src/hooks/useIncrementRuns.ts` — whitelist + type + export column.
- `src/components/incentive/...` export column (locate the actual export builder during build).

## Out of scope
- Calculation formulas, slab, ineligibility, GDOJ prorating, confirmation logic.
- New storage bucket (reuse `review-evidence`).
- Permission/route changes.
- Server-side mime sniffing (bucket already public-read; we keep client allowlist + max-size; matches existing app pattern).

## SSOT updates
- `DOCUMENTATION.md` → Increment Inputs section: add note about the new Supporting Evidence field and Excel column.
- `POLICY.md` → no policy change (evidence is optional; calculations unaffected).
- Memory update: add a short entry under `mem/features/incentive/` noting evidence-on-override pattern.

## Acceptance verification
1. Open Latest Calculations → Edit row → upload PNG + paste screenshot + drop a .docx → Save → reopen row → all three files visible, openable, removable.
2. Reject `.exe` and >max-size files with toast.
3. Excel export shows `Evidence Attached` Yes/No and `Evidence Count`.
4. Editing a row without attachments still works exactly as before.
