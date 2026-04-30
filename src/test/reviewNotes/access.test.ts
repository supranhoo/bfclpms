import { describe, it, expect } from 'vitest';
import { parseAccessConfig, DEFAULT_REVIEW_NOTE_ACCESS } from '@/hooks/useReviewNoteAccess';

describe('parseAccessConfig', () => {
  it('returns defaults when input is null/undefined', () => {
    expect(parseAccessConfig(undefined)).toEqual(DEFAULT_REVIEW_NOTE_ACCESS);
    expect(parseAccessConfig(null)).toEqual(DEFAULT_REVIEW_NOTE_ACCESS);
  });

  it('returns defaults when input is malformed JSON string', () => {
    expect(parseAccessConfig('{not-json')).toEqual(DEFAULT_REVIEW_NOTE_ACCESS);
  });

  it('parses object input and merges with defaults per key', () => {
    const cfg = parseAccessConfig({
      view: ['admin', 'manager'],
      create: ['admin'],
      edit: ['admin'],
      delete: ['admin'],
      view_own_subject: [],
    });
    expect(cfg.view).toContain('manager');
    expect(cfg.view).toContain('admin');
    expect(cfg.create).toEqual(['admin']);
  });

  it('always includes admin in operational lists, even if omitted', () => {
    const cfg = parseAccessConfig({
      view: ['manager'],
      create: ['hr_pms'],
      edit: ['hr_pms'],
      delete: ['hr_pms'],
      view_own_subject: ['employee'],
    });
    expect(cfg.view).toContain('admin');
    expect(cfg.create).toContain('admin');
    expect(cfg.edit).toContain('admin');
    expect(cfg.delete).toContain('admin');
  });

  it('does not force admin into view_own_subject', () => {
    const cfg = parseAccessConfig({ view_own_subject: ['employee'] });
    expect(cfg.view_own_subject).toEqual(['employee']);
  });

  it('parses JSON string input', () => {
    const raw = JSON.stringify({ view: ['admin', 'auditor'] });
    const cfg = parseAccessConfig(raw);
    expect(cfg.view).toContain('auditor');
  });

  it('drops non-string entries defensively', () => {
    const cfg = parseAccessConfig({ view: ['admin', 123, null, 'manager'] });
    expect(cfg.view).toEqual(expect.arrayContaining(['admin', 'manager']));
    expect(cfg.view).not.toContain(123);
  });
});