

# Fix Evidence Download on Tablets

## Root Cause

The `openStorageFile()` function in `src/lib/storageDownload.ts` downloads the file via the Supabase SDK (async), then calls `window.open(blobUrl, '_blank')`. On tablets (iPad, Android tablets), browsers block `window.open()` when it's not in the **direct call stack** of a user gesture. The async `.download()` call breaks that chain, so the browser silently blocks the new tab.

A secondary issue exists in `OrgKpiFileUpload.tsx` which calls `window.open(existingUrl, '_blank')` directly -- this can also be blocked if the storage URL is flagged by the browser.

## Solution

Replace `window.open(blobUrl, '_blank')` with a programmatic `<a>` element click pattern that triggers a download instead of opening a new tab. This approach is universally supported on tablets and desktops.

## Changes

### 1. Update `src/lib/storageDownload.ts`

Replace the `window.open(blobUrl, '_blank')` approach with a programmatic anchor (`<a>`) click:

```typescript
export async function openStorageFile(publicUrl: string): Promise<void> {
  try {
    const match = publicUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (!match) {
      window.open(publicUrl, '_blank');
      return;
    }

    const [, bucket, path] = match;
    const decodedPath = decodeURIComponent(path);

    const { data, error } = await supabase.storage
      .from(bucket)
      .download(decodedPath);

    if (error || !data) {
      console.warn('Blob download failed, falling back to direct URL:', error?.message);
      window.open(publicUrl, '_blank');
      return;
    }

    const blobUrl = URL.createObjectURL(data);

    // Use anchor click instead of window.open — works on tablets
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';

    // Extract a filename from the path for the download attribute
    const fileName = decodedPath.split('/').pop() || 'evidence';
    anchor.download = fileName;

    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch {
    window.open(publicUrl, '_blank');
  }
}
```

Key difference: `anchor.click()` is treated as a trusted user-initiated action by all browsers, even after async work. The `download` attribute also triggers a save dialog instead of navigating, which avoids popup blockers entirely.

### 2. Update `src/components/admin/OrgKpiFileUpload.tsx`

Replace the direct `window.open(existingUrl, '_blank')` call with `openStorageFile(existingUrl)` so it goes through the same blob-download path:

```typescript
import { openStorageFile } from '@/lib/storageDownload';
// ...
onClick={() => openStorageFile(existingUrl)}
```

### 3. Update `src/components/review/ObservationReplyThread.tsx`

The reply thread renders evidence links as plain `<a href={url} target="_blank">` tags. These should also use `openStorageFile` for consistency:

```typescript
import { openStorageFile } from '@/lib/storageDownload';
// ...
<button onClick={() => openStorageFile(url)}>Attachment {i + 1}</button>
```

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Regression | Low | Desktop behavior is identical -- anchor click with `_blank` behaves the same as `window.open` on desktop browsers |
| Data | None | No database or schema changes |
| UX Change | Minor | Files will now trigger a download/save dialog on tablets instead of trying to open in a new tab. This is actually preferable for PDFs and Excel files |
| Browser Compat | None | `<a>.click()` is supported in all modern browsers including Safari on iPad |

## Files Changed

| File | Change |
|------|--------|
| `src/lib/storageDownload.ts` | Replace `window.open(blobUrl)` with programmatic anchor click + download attribute |
| `src/components/admin/OrgKpiFileUpload.tsx` | Use `openStorageFile()` instead of raw `window.open()` |
| `src/components/review/ObservationReplyThread.tsx` | Use `openStorageFile()` for reply evidence links |

