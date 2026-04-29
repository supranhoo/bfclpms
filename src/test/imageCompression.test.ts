import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mock the heavy `browser-image-compression` library so tests stay fast
 * and deterministic. The default mock returns a Blob smaller than the
 * input so we can verify the "wasCompressed" path; individual tests
 * override the mock to simulate failures or no-savings cases.
 */
vi.mock('browser-image-compression', () => ({
  default: vi.fn(async (file: File) => {
    // Simulate ~70% size reduction.
    const reducedBytes = new Uint8Array(Math.max(1, Math.floor(file.size * 0.3)));
    return new Blob([reducedBytes], { type: file.type });
  }),
}));

import imageCompression from 'browser-image-compression';
import {
  compressImageFile,
  shouldShowSavingsToast,
  formatSavings,
  COMPRESSION_MIN_BYTES,
  DEFAULT_COMPRESSION_POLICY,
} from '@/lib/imageCompression';

const mockedCompress = imageCompression as unknown as ReturnType<typeof vi.fn>;

function makeFile(
  name: string,
  type: string,
  sizeBytes: number,
): File {
  // We don't need real bytes for most tests — just a File with the right
  // size/mime for the wrapper to inspect.
  const buf = new Uint8Array(sizeBytes);
  return new File([buf], name, { type });
}

describe('imageCompression — skip rules', () => {
  beforeEach(() => {
    mockedCompress.mockClear();
  });

  it('returns original when setting is disabled', async () => {
    const f = makeFile('a.jpg', 'image/jpeg', 2 * 1024 * 1024);
    const r = await compressImageFile(f, { enabled: false });
    expect(r.wasCompressed).toBe(false);
    expect(r.skipReason).toBe('disabled');
    expect(r.file).toBe(f);
    expect(mockedCompress).not.toHaveBeenCalled();
  });

  it('returns original for non-image mime types', async () => {
    const f = makeFile('a.pdf', 'application/pdf', 5 * 1024 * 1024);
    const r = await compressImageFile(f, { enabled: true });
    expect(r.wasCompressed).toBe(false);
    expect(r.skipReason).toBe('not-image');
    expect(mockedCompress).not.toHaveBeenCalled();
  });

  it('returns original when the file is below the size threshold', async () => {
    const f = makeFile('tiny.jpg', 'image/jpeg', COMPRESSION_MIN_BYTES - 1);
    const r = await compressImageFile(f, { enabled: true });
    expect(r.wasCompressed).toBe(false);
    expect(r.skipReason).toBe('too-small');
    expect(mockedCompress).not.toHaveBeenCalled();
  });

  it('skips animated GIFs to preserve animation', async () => {
    const f = makeFile('motion.gif', 'image/gif', 5 * 1024 * 1024);
    const r = await compressImageFile(f, { enabled: true });
    expect(r.wasCompressed).toBe(false);
    expect(r.skipReason).toBe('animated-gif');
    expect(mockedCompress).not.toHaveBeenCalled();
  });

  it('falls back to original on compression error (never throws)', async () => {
    mockedCompress.mockRejectedValueOnce(new Error('encode failed'));
    const f = makeFile('photo.jpg', 'image/jpeg', 4 * 1024 * 1024);
    const r = await compressImageFile(f, { enabled: true });
    expect(r.wasCompressed).toBe(false);
    expect(r.skipReason).toBe('error');
    expect(r.file).toBe(f);
  });

  it('falls back to original when compression produced a larger file', async () => {
    mockedCompress.mockResolvedValueOnce(
      new Blob([new Uint8Array(10 * 1024 * 1024)], { type: 'image/jpeg' }),
    );
    const f = makeFile('photo.jpg', 'image/jpeg', 4 * 1024 * 1024);
    const r = await compressImageFile(f, { enabled: true });
    expect(r.wasCompressed).toBe(false);
    expect(r.skipReason).toBe('no-savings');
  });
});

describe('imageCompression — happy path', () => {
  beforeEach(() => {
    mockedCompress.mockClear();
  });

  it('compresses a large JPEG and reports savings', async () => {
    const f = makeFile('photo.jpg', 'image/jpeg', 4 * 1024 * 1024);
    const r = await compressImageFile(f, { enabled: true });
    expect(r.wasCompressed).toBe(true);
    expect(r.savedBytes).toBeGreaterThan(0);
    expect(r.file.size).toBeLessThan(f.size);
    expect(r.file.name).toBe('photo.jpg');
    expect(mockedCompress).toHaveBeenCalledTimes(1);
  });

  it('renames HEIC files to .jpg in the output', async () => {
    mockedCompress.mockResolvedValueOnce(
      new Blob([new Uint8Array(500 * 1024)], { type: 'image/jpeg' }),
    );
    const f = makeFile('IMG_1234.HEIC', 'image/heic', 3 * 1024 * 1024);
    const r = await compressImageFile(f, { enabled: true });
    expect(r.wasCompressed).toBe(true);
    expect(r.file.type).toBe('image/jpeg');
    expect(r.file.name).toBe('IMG_1234.jpg');
    // Mock was called with HEIC → JPEG conversion requested.
    const callArgs = mockedCompress.mock.calls[0][1];
    expect(callArgs.fileType).toBe('image/jpeg');
  });

  it('uses the severe-quality preset when severityHint is critical', async () => {
    const f = makeFile('lti.jpg', 'image/jpeg', 4 * 1024 * 1024);
    await compressImageFile(f, {
      enabled: true,
      severityHint: 'critical',
    });
    const callArgs = mockedCompress.mock.calls[0][1];
    expect(callArgs.initialQuality).toBe(DEFAULT_COMPRESSION_POLICY.severeQuality);
  });

  it('uses the normal quality preset for low/medium severity', async () => {
    const f = makeFile('low.jpg', 'image/jpeg', 4 * 1024 * 1024);
    await compressImageFile(f, {
      enabled: true,
      severityHint: 'medium',
    });
    const callArgs = mockedCompress.mock.calls[0][1];
    expect(callArgs.initialQuality).toBe(DEFAULT_COMPRESSION_POLICY.quality);
  });
});

describe('imageCompression — savings toast threshold', () => {
  it('hides toast for sub-500KB originals even with big % savings', () => {
    expect(
      shouldShowSavingsToast({
        file: new File([new Uint8Array(1)], 'x.jpg', { type: 'image/jpeg' }),
        wasCompressed: true,
        originalSize: 400 * 1024,
        savedBytes: 300 * 1024,
        durationMs: 50,
      }),
    ).toBe(false);
  });

  it('hides toast for sub-30% savings', () => {
    expect(
      shouldShowSavingsToast({
        file: new File([new Uint8Array(1)], 'x.jpg', { type: 'image/jpeg' }),
        wasCompressed: true,
        originalSize: 4 * 1024 * 1024,
        savedBytes: 800 * 1024, // ~20%
        durationMs: 50,
      }),
    ).toBe(false);
  });

  it('shows toast when ≥500KB original AND ≥30% savings', () => {
    expect(
      shouldShowSavingsToast({
        file: new File([new Uint8Array(1)], 'x.jpg', { type: 'image/jpeg' }),
        wasCompressed: true,
        originalSize: 5 * 1024 * 1024,
        savedBytes: 4 * 1024 * 1024, // 80%
        durationMs: 50,
      }),
    ).toBe(true);
  });

  it('formats savings sensibly above and below 1 MB', () => {
    expect(
      formatSavings({
        file: new File([new Uint8Array(1)], 'x.jpg', { type: 'image/jpeg' }),
        wasCompressed: true,
        originalSize: 5 * 1024 * 1024,
        savedBytes: 4 * 1024 * 1024,
        durationMs: 0,
      }),
    ).toMatch(/Saved 4\.0 MB · 80% smaller/);
    expect(
      formatSavings({
        file: new File([new Uint8Array(1)], 'x.jpg', { type: 'image/jpeg' }),
        wasCompressed: true,
        originalSize: 800 * 1024,
        savedBytes: 400 * 1024,
        durationMs: 0,
      }),
    ).toMatch(/Saved 400 KB · 50% smaller/);
  });
});
