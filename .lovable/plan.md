# Plan: Preview KPI Evidence (PDF / Image) Instead of Force-Download

## Assumptions
- "Evidence" = files attached to a KPI submission, surfaced via `openStorageFile()` today (triggers a browser download / new tab).
- Scope: PMS evidence only. Safety module already has `EvidencePreviewDialog` and is out of scope.
- Supported preview types: PDF (`application/pdf`) + images (`png`, `jpg`, `jpeg`, `webp`, `gif`, `svg`). All other types continue to download as today.
- Files live in the `review-evidence` Supabase bucket (public URL today). No bucket/RLS changes needed.

## Clarifications (assumed unless you say otherwise)
1. Preview opens in an in-app modal (Dialog on desktop, Drawer on mobile) — same pattern as `KraPreviewDialog`.
2. Modal always shows a **Download** button + **Open in new tab** button, so existing download behaviour is still one click away.
3. Non-previewable types (DOCX/XLSX/etc.) keep current behaviour (download via `openStorageFile`).

## Risk & Impact Report
- **Data Impact:** None. Read-only; uses existing public URLs + `supabase.storage.download()` (already used by `openStorageFile`).
- **Workflow Impact:** None. No status, RLS, or policy changes.
- **UI/UX Impact:** Each evidence "View" button now opens a preview modal instead of immediately downloading. Download is preserved inside the modal and via a secondary affordance on the list.
- **Regression Risk:** Low — change is additive (new component + swap click handler). Files that aren't PDF/image bypass the modal and use the existing `openStorageFile()` path unchanged.
- **Scalability:** PDFs stream into an `<iframe src=blob:...>`; images into `<img>`. Blob URLs revoked on close. No new queries.
- **Mitigation:** Feature is purely presentational; rollback = revert the new component + handler swap. Add unit tests for type detection + modal open/close.

## Step-by-Step Plan

1. **New shared component** `src/components/review/EvidencePreviewDialog.tsx`
   - Props: `open`, `onOpenChange`, `url`, `fileName`, `mimeHint?`.
   - Detects type from extension (and optional mime hint).
   - PDF → `<iframe>` of blob URL.
   - Image → `<img>` (object-contain, max-h 80vh).
   - Other → shows "Preview not available" + Download button.
   - Buttons: **Download** (uses existing `openStorageFile`) and **Open in new tab**.
   - Mobile: Drawer; Desktop: Dialog (mirrors `KraPreviewDialog`).
   - Fetches the file once via `supabase.storage.from(bucket).download(path)` (reusing the parsing logic already in `storageDownload.ts`) to avoid browser-extension blocks on direct `.supabase.co` URLs.

2. **New helper** in `src/lib/storageDownload.ts`
   - `isPreviewableEvidence(urlOrName: string): 'pdf' | 'image' | null` — pure function, exported and unit-tested.
   - No change to existing `openStorageFile` signature.

3. **Wire-up (surgical, one prop per site — handler swap only):**
   - `src/components/review/ReviewTrailCard.tsx`
   - `src/components/review/ReviewTrailCardCompact.tsx`
   - `src/components/review/ReviewStageCard.tsx`
   - `src/components/review/SelfReviewSheet.tsx`
   - `src/components/review/DailySubmissionGrid.tsx`
   - `src/components/review/DailySubmissionSummary.tsx`
   - `src/components/review/WeeklySubmissionTable.tsx`
   - `src/components/review/ObservationReplyThread.tsx`
   - `src/components/admin/OrgKpiAuditCard.tsx`
   - `src/components/admin/OrgKpiEvidenceManagerSheet.tsx`
   - `src/components/admin/OrgKpiFileUpload.tsx` (the existing "View" button)
   - `src/components/ui/EvidenceUpload.tsx`, `src/components/ui/MultiFileUpload.tsx`
   - Behaviour: if `isPreviewableEvidence(url)` → open dialog; else → existing `openStorageFile()`.

4. **Tests** `src/test/review/evidencePreview.test.tsx`
   - `isPreviewableEvidence` returns `'pdf'` for `.pdf`, `'image'` for png/jpg/jpeg/webp/gif/svg, `null` for docx/xlsx.
   - Dialog renders `<iframe>` for PDF, `<img>` for image, "Preview not available" for unsupported.
   - Clicking Download calls `openStorageFile` with the original URL + filename.

5. **Docs**
   - `DOCUMENTATION.md` → new "Evidence Preview" section under PMS Review UI.
   - `POLICY.md` → note that previewing is read-only and does not affect audit trail.

## UI Changes
- **Where:** Every "View"/file-link button on KPI evidence across the review surfaces listed above.
- **What changes visually:**
  - PDF / image files now open a centered modal (desktop) or full-height drawer (mobile) with the rendered preview, a header showing the filename, and `Download` + `Open in new tab` buttons.
  - Non-previewable files unchanged (still download / open in new tab).
- **Interaction impact:** One extra click is required to download a previewable file (download moves from immediate to inside the modal), but the most-requested action (look at the file) now happens in-context without leaving the review.
- **Responsiveness:** Dialog `max-w-5xl h-[85vh]` on desktop; Drawer `max-h-[90vh]` on mobile. Iframe/img fluid inside.

## Out of Scope
- Server-side thumbnail generation.
- Office document preview (DOCX/XLSX). Keeps current download behaviour.
- Safety module (already has its own preview dialog).
- Any change to upload, deletion, or storage policies.

## Rollback
Revert the new component + the per-call-site handler swap. No schema/RLS/migration touched.
