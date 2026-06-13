import { describe, it, expect, renderHook } from 'vitest';
// renderHook isn't actually in vitest; fall through to @testing-library/react
import { renderHook as rhook } from '@testing-library/react';
import { useAnnualReviewTranslation } from '@/hooks/useAnnualReviewTranslation';
import { normalizeLang } from '@/lib/annualReview/i18n';

void renderHook; // keep TS happy on the unused import

describe('Annual Review — translation resolver', () => {
  it('normalizes friendly language names to codes', () => {
    expect(normalizeLang('hindi')).toBe('hi');
    expect(normalizeLang('Spanish')).toBe('es');
    expect(normalizeLang(null)).toBe('en');
    expect(normalizeLang('xx')).toBe('en');
  });

  it('returns the fallback when current language matches default', () => {
    const { result } = rhook(() => useAnnualReviewTranslation({ currentLanguage: 'en', defaultLanguage: 'en' }));
    expect(result.current.t('any.key', 'Hello')).toBe('Hello');
  });

  it('prefers dynamic template translations over static ones', () => {
    const { result } = rhook(() =>
      useAnnualReviewTranslation({
        currentLanguage: 'hi',
        defaultLanguage: 'en',
        templateTranslations: { hi: { 'col.weight': 'वजन' } },
      }),
    );
    expect(result.current.t('col.weight', 'Weight')).toBe('वजन');
  });

  it('falls back to the static dictionary when the template has no entry', () => {
    const { result } = rhook(() =>
      useAnnualReviewTranslation({ currentLanguage: 'hi', defaultLanguage: 'en' }),
    );
    expect(result.current.t('col.score', 'Score')).toBe('अंक');
  });

  it('falls back to the english fallback when nothing matches', () => {
    const { result } = rhook(() =>
      useAnnualReviewTranslation({ currentLanguage: 'hi', defaultLanguage: 'en' }),
    );
    expect(result.current.t('nonexistent.key', 'Hello')).toBe('Hello');
  });
});