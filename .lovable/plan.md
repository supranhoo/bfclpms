## RCA — Why the auditor's xlsx download fails

The URL in the screenshot is:

```
https://<ref>.supabase.co/storage/v1/object/public/review-evidence/...
```

…and Storage replies `404 Bucket not found`. Confirmed against `storage.buckets`:

| bucket | public |
| --- | --- |
| `review-evidence` | **false** (private) |

A private bucket has no `/object/public/...` endpoint, so any public URL on it 404s. PDFs/images currently work for auditors because `openStorageFile()` (in `src/lib/storageDownload.ts`) silently re-downloads them via `supabase.storage.from(bucket).download(path)` (SDK uses an authenticated path) and serves a blob.

For **Office files** (xlsx/docx/…), the flow is different — handled by `src/components/review/EvidencePreviewDialog.tsx`:

1. Preview iframe: correctly creates a 10-min **signed URL** for the Office Online viewer. ✅
2. **Download button** (`handleDownload`): uses `blobUrl` only when it starts with `blob:`; for office the signed URL starts with `https://`, so it falls back to `downloadDirect(detail.url, …)` — i.e. the broken `/object/public/...` URL. ❌ → produces the 404 page in the screenshot.
3. **Open in new tab** (`handleOpenNewTab`): `blobUrl || detail.url` — works for office once the signed URL is fetched, but if the user clicks before the preview load completes, it falls back to the broken public URL. ⚠️

So the auditor sees the Office preview render (signed URL works), then clicking **Download** opens the unsigned public URL and Supabase returns "Bucket not found".

## Scope of fix (surgical, presentation-only)

Only `src/components/review/EvidencePreviewDialog.tsx`. No DB, no RLS, no policy change. Bucket stays private (correct per POLICY §evidence access).

### Changes

1. **`handleDownload`**
   - If `blobUrl` is set, download from it (works for both `blob:` and signed `https:` URLs).
   - Else, if `detail.url` is a `/storage/v1/object/public/<bucket>/<path>` URL on a private bucket, fetch a fresh signed URL on the fly (`createSignedUrl(path, 300)`) and download via that.
   - Else, download `detail.url` directly (non-storage URL).
   - For `blob:` office downloads, set `a.download = displayName` (current behaviour). For signed URLs, browsers honour `Content-Disposition` from Storage, which already includes the filename — keep `a.download` as a hint.

2. **`handleOpenNewTab`**
   - Same guard: if `detail.url` is a private-bucket public URL and we don't yet have `blobUrl`, fetch a signed URL first, then `window.open(...)`.
   - Disable the button while `loading` is true so the user can't click before we have a usable URL.

3. **Error UX**
   - Wrap both handlers in try/catch and `toast.error("Could not prepare file for download")` on failure (matches existing pattern; toast already imported elsewhere — add `sonner` import here).

### What we are NOT changing

- The Safety `EvidencePreviewDialog` (`src/components/safety/EvidencePreviewDialog.tsx`) — already uses signed URLs end-to-end; no bug there.
- Bucket visibility, RLS, or upload paths.
- `storageDownload.ts` blob-fallback path for non-office files (already correct).

## Risk & Impact

- **Data**: none. Read-only signed URLs, 5-min TTL.
- **Workflow**: none. Auditors regain ability to download xlsx evidence; other roles unaffected.
- **UI/UX**: Download/Open-new-tab buttons get a brief disabled state while a signed URL is fetched; toast on failure.
- **Regression risk**: Low. Behaviour for PDF/image (blob path) is unchanged because `blobUrl` already starts with `blob:` for those.
- **Mitigation**: Add unit test in `src/test/review/evidencePreview.test.ts` covering: (a) office download uses signed URL (not public URL); (b) `handleDownload` calls `createSignedUrl` when invoked before preview load resolves; (c) toast fires on signing failure.

## Deliverables

1. Patch `src/components/review/EvidencePreviewDialog.tsx` (handlers + signed-URL helper).
2. Extend `src/test/review/evidencePreview.test.ts` with the three cases above.
3. Update `DOCUMENTATION.md` (new release entry, e.g. v2.66.68 — "Fix: Office evidence download on private bucket via signed URL").
4. Update `POLICY.md` §evidence-access: clarify "all client downloads from the private `review-evidence` bucket MUST use SDK download or signed URLs; never public-URL navigation."
5. ADR-099 documenting the public-URL-vs-private-bucket pitfall and the SSOT rule that all evidence access goes through `openStorageFile()` / signed URLs.
6. Update `mem://features/review/office-evidence-preview` with the download path fix.

## Rollback

Revert the single component patch — no schema or data changes.