import { describe, expect, it } from 'vitest';
import { applyTileOverride, type ReportTileOverridesMap } from '@/hooks/useReportTileOverrides';

const defaults = { title: 'Performance Report', description: 'Org-wide performance.' };

describe('applyTileOverride', () => {
  it('falls back to defaults when no overrides provided', () => {
    expect(applyTileOverride('performance', defaults, null)).toEqual(defaults);
    expect(applyTileOverride('performance', defaults, undefined)).toEqual(defaults);
    expect(applyTileOverride('performance', defaults, {})).toEqual(defaults);
  });

  it('applies override for a pre-built key', () => {
    const map: ReportTileOverridesMap = {
      performance: { title: 'Org Pulse', description: 'Custom desc' },
    };
    expect(applyTileOverride('performance', defaults, map)).toEqual({
      title: 'Org Pulse',
      description: 'Custom desc',
    });
  });

  it('applies override for a custom report key', () => {
    const key = 'custom_abc-123';
    const map: ReportTileOverridesMap = {
      [key]: { title: 'My Custom', description: 'Tweaked' },
    };
    const out = applyTileOverride(key, { title: 'Original', description: 'Orig' }, map);
    expect(out).toEqual({ title: 'My Custom', description: 'Tweaked' });
  });

  it('treats blank/whitespace title as missing and falls back', () => {
    const map: ReportTileOverridesMap = {
      performance: { title: '   ', description: 'Keep this' },
    };
    expect(applyTileOverride('performance', defaults, map)).toEqual({
      title: defaults.title,
      description: 'Keep this',
    });
  });

  it('preserves empty-string description override (admin can intentionally clear it)', () => {
    const map: ReportTileOverridesMap = {
      performance: { title: 'Kept', description: '' },
    };
    expect(applyTileOverride('performance', defaults, map)).toEqual({
      title: 'Kept',
      description: '',
    });
  });

  it('does not affect siblings when one key is overridden', () => {
    const map: ReportTileOverridesMap = {
      performance: { title: 'A', description: 'B' },
    };
    const sibling = applyTileOverride(
      'queries',
      { title: 'Query Report', description: 'Q' },
      map,
    );
    expect(sibling).toEqual({ title: 'Query Report', description: 'Q' });
  });
});