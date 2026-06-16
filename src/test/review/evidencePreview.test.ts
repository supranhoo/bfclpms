import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isPreviewableEvidence, openStorageFile } from '@/lib/storageDownload';

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
    expect(isPreviewableEvidence('doc.docx')).toBeNull();
    expect(isPreviewableEvidence('sheet.xlsx')).toBeNull();
    expect(isPreviewableEvidence(null)).toBeNull();
    expect(isPreviewableEvidence('')).toBeNull();
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

    await openStorageFile('https://x.example.com/file.docx', 'file.docx');

    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener('evidence-preview', handler);
  });
});