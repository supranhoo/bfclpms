import { useCallback } from 'react';
import { UI_I18N, normalizeLang, type SupportedLang } from '@/lib/annualReview/i18n';
import type { TemplateSections } from '@/types/annualReview';

/**
 * Translation resolver for the Annual Review module.
 *
 * Resolution precedence:
 *   1. currentLang === defaultLang  →  fallback (the english key/text)
 *   2. templateTranslations[lang][key]
 *   3. UI_I18N[lang][key]
 *   4. fallback
 */
export function useAnnualReviewTranslation(opts: {
  currentLanguage?: string | null;
  defaultLanguage?: string | null;
  templateTranslations?: TemplateSections['translations'];
}) {
  const current: SupportedLang = normalizeLang(opts.currentLanguage);
  const def: SupportedLang = normalizeLang(opts.defaultLanguage ?? 'en');
  const dyn = opts.templateTranslations ?? {};

  const t = useCallback(
    (key: string, fallback: string): string => {
      if (current === def) return fallback;
      const dynVal = dyn[current]?.[key];
      if (dynVal) return dynVal;
      const staticVal = UI_I18N[current]?.[key];
      if (staticVal) return staticVal;
      return fallback;
    },
    [current, def, dyn],
  );

  return { t, currentLanguage: current, defaultLanguage: def };
}