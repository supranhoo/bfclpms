import { supabase } from '@/integrations/supabase/client';

/**
 * Opens a storage file via blob URL to bypass browser extension blocking.
 * 
 * Browser extensions (ad blockers, privacy tools) block direct navigation to
 * *.supabase.co URLs. This function downloads the file via the SDK's fetch-based
 * .download() method (which is not blocked) and opens the resulting blob.
 */
export async function openStorageFile(publicUrl: string): Promise<void> {
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
    window.open(blobUrl, '_blank');

    // Clean up blob URL after a delay to allow the new tab to load
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch {
    // Graceful fallback
    window.open(publicUrl, '_blank');
  }
}
