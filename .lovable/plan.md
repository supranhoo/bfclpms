## Goal
Extend the in-app evidence preview (currently PDF + images) to also preview Office files — Excel (`.xlsx`, `.xls`, `.xlsm`), Word (`.doc`, `.docx`), PowerPoint (`.ppt`, `.pptx`), and `.csv` — inside the existing preview dialog, so users don't have to download to view.

## Approach: Microsoft Office Online Viewer
Render via Microsoft's free public embed:

```
https://view.officeapps.live.com/op/embed.aspx?src=<SIGNED_URL>
```

- The `src` URL must be reachable by Microsoft's servers, so we generate a short-lived **signed URL** (10 min TTL) from the storage bucket via `supabase.storage.from(bucket).createSignedUrl(path, 600)`. Blob URLs won't work.
- Read-only render; no MS account required for the viewer.
- Fallback: if iframe doesn't fire `onLoad` within 8s, show "Preview unavailable — download instead" with the existing Download button.

Alternative rejected: SheetJS in-browser render — loses formatting, heavy on large files, no Word/PPT support.

## Risk & Impact Report
- **Data Impact**: None. No schema/RLS change. Signed URLs already used elsewhere (`getEvidenceSignedUrl`).
- **Security**: File bytes transit Microsoft's viewer servers during render. Acceptable for KPI/Safety evidence (already user-uploaded business artifacts), but flagged in `POLICY.md` with admin opt-out flag `office_preview_enabled` (default ON).
- **Workflow Impact**: None — read-side only.
- **UI/UX**: Same dialog/drawer; new file types open in the same iframe area. No new buttons.
- **Regression Risk**: Low. `isPreviewableEvidence()` return type widens from `'pdf' | 'image' | null` → `'pdf' | 'image' | 'office' | null`. Existing call sites (`EvidencePreviewProvider`, both `EvidencePreviewDialog`s, `openStorageFile`, tests) use switch/truthy checks. Verified — no `=== 'pdf'` exclusion logic anywhere blocks the new value.
- **Scalability**: Zero server load (external viewer). One extra `createSignedUrl` call per preview.
- **Mitigation**: Feature flag, load-timeout fallback, existing Download path always available.

## Plan
1. **`src/lib/storageDownload.ts`**
   - Extend `isPreviewableEvidence()`: return `'office'` for `xlsx | xls | xlsm | csv | doc | docx | ppt | pptx`. Widen return type.
   - `openStorageFile()` already dispatches `evidence-preview` for any truthy `isPreviewableEvidence` result — no change needed.
2. **`src/components/review/EvidencePreviewDialog.tsx`** and **`src/components/safety/EvidencePreviewDialog.tsx`**
   - When `kind === 'office'`: skip the `download → blob` path; call `createSignedUrl(path, 600)` and set iframe `src` to `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(signedUrl)}`.
   - Add `onLoad` handler + 8s timeout → if not loaded, render "Preview unavailable" message with Download button.
   - "Open in new tab" for Office files opens the signed URL directly (browser will download or render natively).
3. **Feature flag** (zero-hardcoding rule): add `office_preview_enabled` boolean to existing admin settings table; read via existing settings hook. Default `true`. When `false`, `isPreviewableEvidence` returns `null` for office extensions → falls back to download.
4. **Tests** — extend `src/test/review/evidencePreview.test.ts`:
   - `isPreviewableEvidence('Report.xlsx') === 'office'`
   - `isPreviewableEvidence('Deck.pptx') === 'office'`
   - `isPreviewableEvidence('Memo.docx') === 'office'`
   - `isPreviewableEvidence('data.csv') === 'office'`
   - Existing PDF/image cases still pass.
   - Dispatch test: `.xlsx` triggers `evidence-preview` event.
5. **Docs / Policy / Memory**
   - `DOCUMENTATION.md` → new "Office Evidence Preview" subsection; bump version log.
   - `POLICY.md` → external render dependency (Microsoft) + admin opt-out flag.
   - `docs/adr/ADR-097.md` → record MS-viewer-over-SheetJS decision.
   - `mem/features/review/office-evidence-preview.md` → contract summary.

## UI Changes
- **Location**: Same evidence preview dialog (KPI evidence chips, Safety incident evidence list, Annual Review attachments — any caller of `openStorageFile`).
- **Visual**: Clicking an `.xlsx`/`.docx`/`.pptx`/`.csv` filename opens the existing preview dialog with the Microsoft-rendered document inside the iframe area used today for PDFs. Header (file name, Download, Open in new tab) unchanged. Mobile uses the existing Drawer.
- **Interaction**: Read-only render; Download button still produces the original file.
- **Responsiveness**: Iframe inherits `min-h-[65vh]` (desktop) / `min-h-[70vh]` (mobile).

## Rollback
Flip `office_preview_enabled = false` to revert Office files to download-only. PDF/image paths untouched.

## Post-implementation
Verify with one `.xlsx`, one `.docx`, one `.pptx`, one `.csv` from `review-evidence` and from a Safety incident attachment.
