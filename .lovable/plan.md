

# Fix: Evidence Links Blocked by Browser Extensions

## Problem

Evidence file links point directly to the Lovable Cloud storage domain (`*.supabase.co`). Some browser extensions (ad blockers, privacy tools) block these requests entirely, showing a "This page has been blocked by Chrome - ERR_BLOCKED_BY_CLIENT" error. The files themselves are correctly stored and accessible -- it's the direct URL navigation that gets intercepted.

## Solution

Instead of opening direct storage URLs in a new tab, create a download helper that uses the SDK's `download()` method (which goes through a `fetch` call, not blocked by ad blockers) and then opens the resulting blob in a new window.

This approach:
- Bypasses browser extension blocking since it uses `fetch()`, not URL navigation
- Works for all file types (PDF, images, Excel)
- Falls back to the direct URL if the blob approach fails
- Requires no backend or storage configuration changes

## Changes

### 1. New Utility: `src/lib/storageDownload.ts`

Create a helper function that:
- Extracts the bucket name and file path from a public storage URL
- Uses `supabase.storage.from(bucket).download(path)` to fetch the file as a blob
- Opens the blob in a new browser tab using `URL.createObjectURL()`
- Falls back to `window.open(url)` if anything goes wrong

```text
export async function openStorageFile(publicUrl: string): Promise<void> {
  // Parse bucket and path from URL
  // Download via SDK (uses fetch, not blocked)
  // Create blob URL and open in new tab
  // Fallback to direct URL on error
}
```

### 2. Update Evidence Link Components

Replace all `<a href={url} target="_blank">` evidence links with `onClick` handlers that call `openStorageFile()`:

| Component | What changes |
|---|---|
| `ReviewStageCard.tsx` | Evidence links in the Review Journey cards |
| `ReviewTrailCard.tsx` | Evidence links in the audit trail |
| `ReviewTrailCardCompact.tsx` | Evidence links in compact trail view |
| `MultiFileUpload.tsx` | Preview links for uploaded files |
| `EvidenceUpload.tsx` | Preview link for uploaded file |

Each `<a href={url}>` becomes `<button onClick={() => openStorageFile(url)}>` (styled identically).

### 3. Update `DOCUMENTATION.md`

Document the blob-based download approach and the reason for it.

## Technical Detail

The key insight is that `ERR_BLOCKED_BY_CLIENT` only affects direct URL navigation (typing/clicking a link to `*.supabase.co`). JavaScript `fetch()` calls from the app's own domain are not blocked by ad blockers. The Supabase SDK's `.download()` method uses `fetch()` internally, so it bypasses the block.

```text
// Before (blocked by extensions):
<a href="https://xxx.supabase.co/storage/..." target="_blank">

// After (uses fetch, not blocked):
<button onClick={() => openStorageFile(url)}>
  // internally: supabase.storage.download() -> blob -> URL.createObjectURL()
```

## Impact

- All evidence links will work regardless of browser extensions
- No changes to storage configuration or database
- Backward compatible -- existing URLs remain valid
- Graceful fallback if blob approach fails

