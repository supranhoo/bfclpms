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
