import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AnnualReviewI18nProvider, useAnnualReviewI18n } from '@/components/annual-review/AnnualReviewI18nContext';
import type { TemplateDisplayMode } from '@/types/annualReview';

function Probe({ onReady }: { onReady: (ctx: ReturnType<typeof useAnnualReviewI18n>) => void }) {
  const ctx = useAnnualReviewI18n();
  onReady(ctx);
  return null;
}

function pull(mode: TemplateDisplayMode | undefined, lang = 'hi', translations: any = {}) {
  let captured: any;
  render(
    <AnnualReviewI18nProvider
      currentLanguage={lang}
      defaultLanguage="en"
      templateTranslations={translations}
      displayMode={mode ?? null}
    >
      <Probe onReady={(c) => (captured = c)} />
    </AnnualReviewI18nProvider>,
  );
  return captured!;
}

const trWith = { hi: { 'option:o5:label': 'हमेशा समय पर', 'criterion:a:name': 'उपस्थिति' } };

describe('AnnualReviewI18nContext display modes', () => {
  it('defaults to bilingual when displayMode is not provided', () => {
    const ctx = pull(undefined, 'hi', trWith);
    expect(ctx.displayMode).toBe('bilingual');
    expect(ctx.tTemplateBilingual('option', 'o5', 'label', 'Always on time')).toBe('Always on time / हमेशा समय पर');
    // names stay English in bilingual mode
    expect(ctx.tTemplate('criterion', 'a', 'name', 'Attendance')).toBe('Attendance');
  });

  it('english_only returns English even when translation exists', () => {
    const ctx = pull('english_only', 'hi', trWith);
    expect(ctx.tTemplateBilingual('option', 'o5', 'label', 'Always on time')).toBe('Always on time');
    expect(ctx.tTemplate('criterion', 'a', 'name', 'Attendance')).toBe('Attendance');
  });

  it('translated_only returns translation, falls back to English when missing', () => {
    const ctx = pull('translated_only', 'hi', trWith);
    expect(ctx.tTemplateBilingual('option', 'o5', 'label', 'Always on time')).toBe('हमेशा समय पर');
    expect(ctx.tTemplate('criterion', 'a', 'name', 'Attendance')).toBe('उपस्थिति');
    // Missing translation → English fallback
    expect(ctx.tTemplateBilingual('option', 'o4', 'label', 'Rarely late')).toBe('Rarely late');
    expect(ctx.tTemplate('criterion', 'b', 'description', 'desc')).toBe('desc');
  });

  it('when current === default, every mode returns fallback', () => {
    for (const m of ['bilingual', 'english_only', 'translated_only'] as const) {
      const ctx = pull(m, 'en', trWith);
      expect(ctx.tTemplate('criterion', 'a', 'name', 'Attendance')).toBe('Attendance');
      expect(ctx.tTemplateBilingual('option', 'o5', 'label', 'Always on time')).toBe('Always on time');
    }
  });
});
