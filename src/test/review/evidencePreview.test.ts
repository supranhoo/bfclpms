import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isPreviewableEvidence, openStorageFile } from '@/lib/storageDownload';
import { resolveDownloadableUrl } from '@/components/review/EvidencePreviewDialog';
import { supabase } from '@/integrations/supabase/client';

describe('isPreviewableEvidence', () => {
  it('detects PDFs', () => {
    expect(isPreviewableEvidence('https://x.supabase.co/foo/Report.pdf')).toBe('pdf');
    expect(isPreviewableEvidence('Report.PDF')).toBe('pdf');
    expect(isPreviewableEvidence('file.pdf?token=abc#x')).toBe('pdf');
  });
  it('detects images', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']) {
      expect(isPreviewableEvidence(`evidence.${ext}`)).toBe('image');
    }
  });
  it('returns null for unsupported types', () => {
    expect(isPreviewableEvidence(null)).toBeNull();
    expect(isPreviewableEvidence('')).toBeNull();
    expect(isPreviewableEvidence('archive.zip')).toBeNull();
    expect(isPreviewableEvidence('notes.txt')).toBeNull();
  });
  it('detects Office files (Excel/Word/PPT/CSV)', () => {
    for (const ext of ['xlsx', 'xls', 'xlsm', 'csv', 'doc', 'docx', 'ppt', 'pptx']) {
      expect(isPreviewableEvidence(`evidence.${ext}`)).toBe('office');
    }
    expect(isPreviewableEvidence('Report.XLSX?token=abc')).toBe('office');
  });
});

describe('openStorageFile previewable dispatch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches evidence-preview for PDF and skips download when handled', async () => {
    const handler = vi.fn((e: Event) => e.preventDefault());
    window.addEventListener('evidence-preview', handler);
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    await openStorageFile('https://x.supabase.co/storage/v1/object/public/review-evidence/path/file.pdf', 'My_Report.pdf');

    expect(handler).toHaveBeenCalledOnce();
    expect(openSpy).not.toHaveBeenCalled();
    window.removeEventListener('evidence-preview', handler);
  });

  it('does not dispatch for non-previewable types', async () => {
    const handler = vi.fn();
    window.addEventListener('evidence-preview', handler);
    vi.spyOn(window, 'open').mockImplementation(() => null);

    await openStorageFile('https://x.example.com/file.zip', 'file.zip');

    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener('evidence-preview', handler);
  });
});

describe('resolveDownloadableUrl (private-bucket download fix)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('signs a /object/public URL on a private bucket instead of returning it as-is', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://x.supabase.co/storage/v1/object/sign/review-evidence/p/f.xlsx?token=t' },
      error: null,
    });
    vi.spyOn(supabase.storage, 'from').mockReturnValue({ createSignedUrl } as never);

    const out = await resolveDownloadableUrl(
      'https://x.supabase.co/storage/v1/object/public/review-evidence/p/f.xlsx',
    );

    expect(createSignedUrl).toHaveBeenCalledWith('p/f.xlsx', 300);
    expect(out).toContain('/object/sign/');
    expect(out).not.toContain('/object/public/');
  });

  it('returns non-storage URLs unchanged', async () => {
    const out = await resolveDownloadableUrl('https://example.com/x.xlsx');
    expect(out).toBe('https://example.com/x.xlsx');
  });

  it('throws when signing fails so the caller can toast', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'denied' },
    });
    vi.spyOn(supabase.storage, 'from').mockReturnValue({ createSignedUrl } as never);

    await expect(
      resolveDownloadableUrl('https://x.supabase.co/storage/v1/object/public/review-evidence/p/f.xlsx'),
    ).rejects.toThrow(/denied/);
  });
});