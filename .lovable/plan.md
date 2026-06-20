## Root Cause (DCA)

The `review-evidence` storage bucket is **private** (auth-gated via RLS). All other places in the Review Journey open attachments through `openStorageFile()` in `src/lib/storageDownload.ts`, which downloads via the authenticated Supabase SDK and serves a blob URL — that works.

`src/components/review/ObservationCard.tsx` (lines 181–207) is the **only** place that still renders evidence as a plain `<a href={publicUrl} target="_blank">`. Clicking it sends the browser straight to
`https://…supabase.co/storage/v1/object/public/review-evidence/…/observation-evidence/…`,
which returns the screenshot's `404 — Bucket not found` because the bucket is not public.

Confirmed callers of `openStorageFile` that already work: `ReviewTrailCard`, `ReviewStageCard`, `ObservationReplyThread`, `QueryHistoryDialog`, `SelfReviewSheet`, `DailySubmissionGrid`, etc. Observation evidence is the outlier.

## Risk & Impact

- **Data Impact:** None. No schema change.
- **Workflow Impact:** Attachment behaviour aligns with rest of review journey: PDF/image preview in dialog, others download via blob URL.
- **UI Impact:** Same chip/link visual; underlying anchor becomes a button-styled link.
- **Regression Risk:** Low — single component, mirrors an existing pattern used in ≥10 other places.
- **Scalability:** Unchanged.
- **Mitigation:** Reuse the shared helper; add a unit test asserting the click invokes `openStorageFile` (not a raw `<a href>`).

## Plan

1. **`src/components/review/ObservationCard.tsx`**
   - Import `openStorageFile`, `buildEvidenceFileName` from `@/lib/storageDownload`.
   - Replace both `<a href={url}>` blocks (multi-file `evidenceUrls` and legacy `legacyUrl`) with `<button type="button" onClick={() => openStorageFile(url, buildEvidenceFileName(url, null, null, 'Observation', i, total))}>` styled identically (`text-xs text-primary hover:underline flex items-center gap-1`).
   - Keep `FileText` icon + "Attachment N" / "View Attachment" labels.

2. **Test** — `src/test/review/observationAttachment.test.ts` (new)
   - Render `ObservationCard` with `evidence_urls: ['https://x.supabase.co/storage/v1/object/public/review-evidence/abc/file.pdf']`.
   - Mock `openStorageFile`, click the attachment, assert it was called with the URL.
   - Assert no raw `<a href="…supabase.co…">` exists in the rendered tree.

3. **Docs**
   - `DOCUMENTATION.md` — note that all evidence access in the Review Journey goes through `openStorageFile` (private bucket, blob download).
   - `POLICY.md` — reinforce "no direct public-URL anchors for `review-evidence`".
   - `mem/architecture/safety/manual-fetch-and-pagination.md` is unrelated; add a one-liner to `mem/features/review/audit-review-journey-staleness.md` (or a new short memory) noting the observation-evidence parity rule.

## Rollback
Single-file revert of `ObservationCard.tsx` + test deletion. No DB or storage changes.

## Out of Scope
- Not changing the bucket to public (rejected previously for privacy).
- Not modifying other attachment renderers — they already use the shared helper.