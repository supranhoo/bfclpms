---
name: Office Evidence Preview
description: Excel/Word/PowerPoint/CSV evidence renders in-app via Microsoft Office Online Viewer iframe
type: feature
---

`isPreviewableEvidence()` in `src/lib/storageDownload.ts` returns:
- `'pdf'` → iframe with blob URL
- `'image'` → `<img>` with blob URL
- `'office'` for `xlsx | xls | xlsm | csv | doc | docx | ppt | pptx`
- `null` → download fallback

For `'office'`: do NOT download to a blob (Microsoft's viewer can't reach `blob:`). Generate a signed URL via `supabase.storage.from(bucket).createSignedUrl(path, 600)` (review side) or reuse `getEvidenceSignedUrl(file_path)` (safety side), then render:

```tsx
<iframe src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(signedUrl)}`} ... />
```

Surfaces wired today:
- `src/components/review/EvidencePreviewDialog.tsx` (EvidencePreviewProvider) — KPI / Annual Review / Org KPI evidence
- `src/components/safety/EvidencePreviewDialog.tsx` — Safety incident evidence

POLICY: §OFFICE-EVIDENCE-PREVIEW. Tests: `src/test/review/evidencePreview.test.ts`.

## Download / Open-in-new-tab on private buckets (v2.66.68)

The `review-evidence` bucket is private. The review-side dialog's **Download** and **Open in new tab** buttons MUST route through the exported helper `resolveDownloadableUrl(url)` (in the same file): it mints a fresh 5-min signed URL when the URL is `/storage/v1/object/public/<bucket>/<path>`, and passes other URLs through unchanged. Existing `blobUrl` (blob: for pdf/image, signed https: for office) wins when present. Failures surface as a `sonner` toast — never let the user navigate to a 404 page. POLICY: §EVIDENCE-DOWNLOAD-PRIVATE-BUCKET. ADR-099.
