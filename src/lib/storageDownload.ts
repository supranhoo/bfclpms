import { supabase } from '@/integrations/supabase/client';

/**
 * Sanitize a text string for use in a filename.
 * Takes the first line only, replaces non-alphanumeric characters with underscores,
 * collapses consecutive underscores, and truncates to maxLen characters.
 * Falls back to empty string for non-Latin text that produces no alphanumeric chars.
 */
export function sanitizeForFilename(text: string, maxLen = 40): string {
  const firstLine = text.split('\n')[0].trim();
  const sanitized = firstLine
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return sanitized.substring(0, maxLen);
}

/**
 * Build a meaningful evidence filename from context.
 * Format: {KPI}_{Stage}_Evidence_{N}.{ext}
 * Falls back gracefully when parts are missing.
 */
export function buildEvidenceFileName(
  url: string,
  employeeCode?: string | null,
  kpiName?: string | null,
  stage?: string | null,
  index?: number,
  total?: number,
): string {
  // Extract extension from URL
  const urlPath = url.split('?')[0];
  const lastSegment = urlPath.split('/').pop() || '';
  const extMatch = lastSegment.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1] : 'file';

  const parts: string[] = [];

  if (employeeCode) {
    const sanitizedCode = sanitizeForFilename(employeeCode, 15);
    if (sanitizedCode) parts.push(sanitizedCode);
  }

  if (kpiName) {
    const sanitized = sanitizeForFilename(kpiName);
    if (sanitized) parts.push(sanitized);
  }

  if (stage) {
    const sanitizedStage = sanitizeForFilename(stage, 20);
    if (sanitizedStage) parts.push(sanitizedStage);
  }

  parts.push('Evidence');

  // Add index only if there are multiple files
  if (total && total > 1 && index !== undefined) {
    parts.push(String(index + 1));
  }

  const name = parts.join('_');
  return `${name}.${ext}`;
}

/**
 * Opens a storage file via blob URL to bypass browser extension blocking.
 * 
 * Browser extensions (ad blockers, privacy tools) block direct navigation to
 * *.supabase.co URLs. This function downloads the file via the SDK's fetch-based
 * .download() method (which is not blocked) and opens the resulting blob.
 * 
 * @param publicUrl - The public URL of the storage file
 * @param fileName - Optional descriptive filename for the download
 */
export type EvidenceGroupItem = { url: string; fileName?: string | null };

/**
 * Open a group of evidence URLs in the preview dialog, starting at `startIndex`.
 * Enables Previous / Next navigation between siblings.
 */
export function openStorageFileGroup(
  urls: string[],
  buildName: (url: string, i: number) => string,
  startIndex = 0,
): Promise<void> {
  if (urls.length === 0) return Promise.resolve();
  const group: EvidenceGroupItem[] = urls.map((url, i) => ({ url, fileName: buildName(url, i) }));
  const i = Math.max(0, Math.min(urls.length - 1, startIndex));
  return openStorageFile(group[i].url, group[i].fileName ?? undefined, { group, index: i });
}

export async function openStorageFile(
  publicUrl: string,
  fileName?: string,
  options?: { group?: EvidenceGroupItem[]; index?: number },
): Promise<void> {
  // Route previewable evidence (PDF / image) through the in-app preview dialog
  // via a global custom event. The EvidencePreviewProvider mounted in App.tsx
  // listens for `evidence-preview` and opens a modal. Falls back to direct
  // download when no listener is present (e.g. in tests).
  if (typeof window !== 'undefined' && isPreviewableEvidence(fileName ?? publicUrl)) {
    const detail = {
      url: publicUrl,
      fileName: fileName ?? null,
      group: options?.group,
      index: options?.index,
    };
    const ev = new CustomEvent('evidence-preview', { detail, cancelable: true });
    const dispatched = window.dispatchEvent(ev);
    // If a listener handled it (called preventDefault), stop here.
    if (dispatched === false || ev.defaultPrevented) return;
    // Otherwise fall through to download (no provider mounted).
  }
  try {
    // Parse bucket and path from public URL
    // Format: https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
    const match = publicUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (!match) {
      // Not a storage URL — open directly
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

    // Use provided fileName or fall back to storage path filename
    const downloadName = fileName || decodedPath.split('/').pop() || 'evidence';
    anchor.download = downloadName;

    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch {
    // Graceful fallback
    window.open(publicUrl, '_blank');
  }
}

/**
 * Detects whether an evidence file is previewable in-browser.
 * Returns 'pdf', 'image', or null based on file extension.
 */
export function isPreviewableEvidence(
  urlOrName: string | null | undefined,
): 'pdf' | 'image' | 'office' | null {
  if (!urlOrName) return null;
  const cleaned = urlOrName.split('?')[0].split('#')[0];
  const ext = (cleaned.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) return 'image';
  if (['xlsx', 'xls', 'xlsm', 'csv', 'doc', 'docx', 'ppt', 'pptx'].includes(ext)) return 'office';
  return null;
}
