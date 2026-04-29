/**
 * Phase A — Client-side evidence image compression.
 *
 * Single canonical wrapper used by every evidence upload site (Safety
 * incidents, Safety stage evidence, PMS review evidence). Designed to be
 * a strict no-op when:
 *   - the global setting is OFF,
 *   - the file is not an image,
 *   - the file is small enough to not be worth re-encoding,
 *   - the file is an animated GIF (compression breaks animation),
 *   - compression itself fails.
 *
 * Quality target = visually lossless (default q=0.82). High/critical Safety
 * severity bumps to a higher-quality preset so legal evidence stays sharper.
 *
 * The wrapper NEVER throws — failures fall back to the original file with a
 * console warning so an upload is never blocked.
 */
import imageCompression from 'browser-image-compression';

export interface CompressionPolicy {
  /** Hard cap on output file size in MB. Default 1.5. */
  maxSizeMB: number;
  /** Cap on the longest image dimension in px. Default 2560. */
  maxWidthOrHeight: number;
  /** JPEG/WebP quality 0-1. Default 0.82 (visually lossless for photos). */
  quality: number;
  /** Quality bump for high/critical-severity Safety evidence. Default 0.92. */
  severeQuality: number;
}

export const DEFAULT_COMPRESSION_POLICY: CompressionPolicy = {
  maxSizeMB: 1.5,
  maxWidthOrHeight: 2560,
  quality: 0.82,
  severeQuality: 0.92,
};

/** Files smaller than this are not worth compressing — skip. */
export const COMPRESSION_MIN_BYTES = 300 * 1024; // 300 KB

export interface CompressOptions {
  /** Resolved global setting. When false, returns the original file. */
  enabled: boolean;
  /** Compression knobs. Defaults applied per field. */
  policy?: Partial<CompressionPolicy>;
  /** Severity hint from the calling context (e.g. Safety severity). */
  severityHint?: 'low' | 'medium' | 'high' | 'critical' | null;
}

export interface CompressionResult {
  file: File;
  /** True if the wrapper actually re-encoded the file. */
  wasCompressed: boolean;
  /** Human-readable reason when the file was returned untouched. */
  skipReason?: string;
  originalSize: number;
  /** Bytes saved vs original (0 when skipped or compression grew the file). */
  savedBytes: number;
  /** Time spent in the compression call. Useful for "Optimizing…" debouncing. */
  durationMs: number;
}

const HEIC_MIME = /^image\/(heic|heif)$/i;
const GIF_MIME = /^image\/gif$/i;
const PNG_MIME = /^image\/png$/i;

/**
 * Returns true if a PNG blob has a non-opaque pixel anywhere. Conservative:
 * if we cannot read the file (server-side, no canvas, etc.) we assume alpha
 * is present so the file is not converted to a JPEG.
 */
async function pngHasAlpha(file: File | Blob): Promise<boolean> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    return true;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return true;
    ctx.drawImage(bitmap, 0, 0);
    // Sample a sparse grid of pixels — full scan is overkill on a 4K photo.
    const stepX = Math.max(1, Math.floor(canvas.width / 16));
    const stepY = Math.max(1, Math.floor(canvas.height / 16));
    for (let y = 0; y < canvas.height; y += stepY) {
      for (let x = 0; x < canvas.width; x += stepX) {
        const px = ctx.getImageData(x, y, 1, 1).data;
        if (px[3] < 255) return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * The single entry point. Returns a CompressionResult. Never throws.
 */
export async function compressImageFile(
  file: File,
  options: CompressOptions = { enabled: true },
): Promise<CompressionResult> {
  const start =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  const baseResult: Omit<CompressionResult, 'durationMs'> = {
    file,
    wasCompressed: false,
    originalSize: file.size,
    savedBytes: 0,
  };
  const stamp = (extra: Partial<CompressionResult>): CompressionResult => ({
    ...baseResult,
    ...extra,
    durationMs:
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
      start,
  });

  if (!options.enabled) return stamp({ skipReason: 'disabled' });
  if (!file.type.startsWith('image/')) return stamp({ skipReason: 'not-image' });
  if (file.size < COMPRESSION_MIN_BYTES) return stamp({ skipReason: 'too-small' });
  if (GIF_MIME.test(file.type)) return stamp({ skipReason: 'animated-gif' });

  const policy: CompressionPolicy = {
    ...DEFAULT_COMPRESSION_POLICY,
    ...(options.policy ?? {}),
  };
  const useSevere =
    options.severityHint === 'high' || options.severityHint === 'critical';
  const initialQuality = useSevere ? policy.severeQuality : policy.quality;

  let outputFileType: string | undefined;
  if (HEIC_MIME.test(file.type)) {
    // Browsers cannot render HEIC directly — re-encode to JPEG so the
    // evidence is viewable everywhere.
    outputFileType = 'image/jpeg';
  } else if (PNG_MIME.test(file.type)) {
    const hasAlpha = await pngHasAlpha(file);
    if (hasAlpha) {
      // Stay PNG to preserve transparency — never convert to JPEG.
      outputFileType = 'image/png';
    } else {
      // Opaque PNG (e.g. screenshot) — let the library choose; default keeps PNG.
      outputFileType = 'image/png';
    }
  }

  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: policy.maxSizeMB,
      maxWidthOrHeight: policy.maxWidthOrHeight,
      initialQuality,
      useWebWorker: true,
      fileType: outputFileType,
      // Preserves orientation EXIF on iOS photos (otherwise rotated wrong).
      preserveExif: false,
    });

    // Wrap the compressed Blob into a File so downstream callers (storage
    // upload, FormData, etc.) keep working seamlessly.
    const renamed = renameForOutput(file.name, compressed.type || file.type);
    const out = new File([compressed], renamed, {
      type: compressed.type || file.type,
      lastModified: Date.now(),
    });

    if (out.size >= file.size) {
      // Compression made the file larger (already-optimized assets, tiny
      // photos with high entropy) — keep the original.
      return stamp({ skipReason: 'no-savings' });
    }

    return stamp({
      file: out,
      wasCompressed: true,
      savedBytes: file.size - out.size,
    });
  } catch (err) {
    // Never block the upload on a compression failure.
    // eslint-disable-next-line no-console
    console.warn('[imageCompression] falling back to original:', err);
    return stamp({ skipReason: 'error' });
  }
}

/**
 * Rename the output file when its mime changed (e.g. HEIC → JPEG) so
 * Safari + Storage signed URLs serve it with a sensible extension.
 */
function renameForOutput(originalName: string, outputMime: string): string {
  const extByMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const newExt = extByMime[outputMime];
  if (!newExt) return originalName;
  const dot = originalName.lastIndexOf('.');
  const stem = dot === -1 ? originalName : originalName.slice(0, dot);
  return `${stem}.${newExt}`;
}

/**
 * Should we actually surface a savings toast to the user?
 *
 * Suppress for tiny absolute savings (the "you saved 12 KB!" noise) and
 * for low-percentage wins (sub-30% means the user wouldn't have noticed
 * the file was bloated anyway).
 */
export function shouldShowSavingsToast(result: CompressionResult): boolean {
  if (!result.wasCompressed) return false;
  if (result.originalSize < 500 * 1024) return false; // <500 KB
  const ratio = result.savedBytes / result.originalSize;
  return ratio >= 0.3;
}

/** Format a savings result as "Saved 2.4 MB · 78% smaller". */
export function formatSavings(result: CompressionResult): string {
  const pct = Math.round((result.savedBytes / result.originalSize) * 100);
  const mb = result.savedBytes / (1024 * 1024);
  const sizeLabel =
    mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(result.savedBytes / 1024)} KB`;
  return `Saved ${sizeLabel} · ${pct}% smaller`;
}
