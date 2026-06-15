import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAnnualReviewTranslation } from '@/hooks/useAnnualReviewTranslation';
import type { TemplateSections } from '@/types/annualReview';

type Translator = (key: string, fallback: string) => string;

interface I18nCtx {
  t: Translator;
  currentLanguage: string;
  defaultLanguage: string;
  templateTranslations?: TemplateSections['translations'];
  /**
   * Lookup a template-authored translation for a section item.
   * Key shape: `<kind>.<id>.<field>` — e.g. `criterion.attendance.name`.
   * Falls back to the English value baked into the template if no
   * translation is provided for the current language.
   */
  tTemplate: (kind: string, id: string, field: string, fallback: string) => string;
}

/** Default no-op translator: always returns the english fallback. */
const defaultCtx: I18nCtx = {
  t: (_k, fb) => fb,
  currentLanguage: 'en',
  defaultLanguage: 'en',
  tTemplate: (_k, _i, _f, fb) => fb,
};

const AnnualReviewI18nContext = createContext<I18nCtx>(defaultCtx);

export function AnnualReviewI18nProvider({
  currentLanguage,
  defaultLanguage,
  templateTranslations,
  children,
}: {
  currentLanguage?: string | null;
  defaultLanguage?: string | null;
  templateTranslations?: TemplateSections['translations'];
  children: ReactNode;
}) {
  const { t, currentLanguage: cur, defaultLanguage: def } = useAnnualReviewTranslation({
    currentLanguage,
    defaultLanguage,
    templateTranslations,
  });

  const value = useMemo<I18nCtx>(() => ({
    t,
    currentLanguage: cur,
    defaultLanguage: def,
    templateTranslations,
    tTemplate: (kind, id, field, fb) => {
      if (cur === def) return fb;
      const key = `${kind}.${id}.${field}`;
      return templateTranslations?.[cur]?.[key] ?? fb;
    },
  }), [t, cur, def, templateTranslations]);

  return (
    <AnnualReviewI18nContext.Provider value={value}>{children}</AnnualReviewI18nContext.Provider>
  );
}

/** Read the active annual-review translator. Safe to use without a provider — returns english. */
export function useAnnualReviewI18n(): I18nCtx {
  return useContext(AnnualReviewI18nContext);
}