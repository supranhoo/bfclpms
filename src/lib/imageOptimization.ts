/**
 * Rewrite a Supabase Storage public-object URL to use the on-the-fly
 * image-transform endpoint, returning a resized + WebP-compressed variant.
 *
 * - Stored bytes are NOT modified.
 * - Non-Supabase URLs (or invalid input) are returned unchanged.
 *
 * Used to dramatically reduce LCP image weight for admin-uploaded
 * branding assets (login background / wallpapers) without altering UX.
 */
export function optimizeSupabaseImageUrl(
  url: string | null | undefined,
  width = 1920,
  quality = 75,
): string {
  if (!url) return url ?? '';
  try {
    const replaced = url.replace(
      '/storage/v1/object/public/',
      '/storage/v1/render/image/public/',
    );
    if (replaced === url) return url; // not a Supabase public-object URL
    const u = new URL(replaced);
    u.searchParams.set('width', String(width));
    u.searchParams.set('quality', String(quality));
    u.searchParams.set('format', 'webp');
    u.searchParams.set('resize', 'cover');
    return u.toString();
  } catch {
    return url;
  }
}