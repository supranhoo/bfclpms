import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAnnualReviewTranslation } from '@/hooks/useAnnualReviewTranslation';
import type { TemplateSections, TemplateDisplayMode } from '@/types/annualReview';

type Translator = (key: string, fallback: string) => string;

interface I18nCtx {
  t: Translator;
  currentLanguage: string;
  defaultLanguage: string;
  templateTranslations?: TemplateSections['translations'];
  /** Reviewer-facing display mode for template labels. */
  displayMode: TemplateDisplayMode;
  /** When true, `<SpeakButton>` is allowed to render for non-default-language text. */
  enableAudio: boolean;
  /**
   * Lookup a template-authored translation for a section item.
   * Key shape: `<kind>.<id>.<field>` — e.g. `criterion.attendance.name`.
   * Falls back to the English value baked into the template if no
   * translation is provided for the current language.
   */
  tTemplate: (kind: string, id: string, field: string, fallback: string) => string;
  /**
   * Bilingual variant — returns `"<fallback> / <translated>"` when the
   * current language differs from the default and a translation exists.
   * Used for option labels where both English + the local rendering are
   * shown side-by-side per BFCL annual-review UX policy.
   */
  tTemplateBilingual: (kind: string, id: string, field: string, fallback: string) => string;
  /**
   * Option-scoped bilingual lookup — namespaced by criterion id so two
   * criteria that share option ids (e.g. `o5`) can carry independent
   * translations. Falls back to the legacy `option:<optId>:<field>` key
   * when the namespaced entry is absent, for back-compat with templates
   * saved before the fix.
   */
  tTemplateOptionBilingual: (criterionId: string, optionId: string, field: string, fallback: string) => string;
}

/** Default no-op translator: always returns the english fallback. */
const defaultCtx: I18nCtx = {
  t: (_k, fb) => fb,
  currentLanguage: 'en',
  defaultLanguage: 'en',
  displayMode: 'bilingual',
  enableAudio: false,
  tTemplate: (_k, _i, _f, fb) => fb,
  tTemplateBilingual: (_k, _i, _f, fb) => fb,
  tTemplateOptionBilingual: (_c, _o, _f, fb) => fb,
};

const AnnualReviewI18nContext = createContext<I18nCtx>(defaultCtx);

export function AnnualReviewI18nProvider({
  currentLanguage,
  defaultLanguage,
  templateTranslations,
  displayMode,
  enableAudio,
  children,
}: {
  currentLanguage?: string | null;
  defaultLanguage?: string | null;
  templateTranslations?: TemplateSections['translations'];
  displayMode?: TemplateDisplayMode | null;
  enableAudio?: boolean;
  children: ReactNode;
}) {
  const { t, currentLanguage: cur, defaultLanguage: def } = useAnnualReviewTranslation({
    currentLanguage,
    defaultLanguage,
    templateTranslations,
  });
  const mode: TemplateDisplayMode = displayMode ?? 'bilingual';

  const value = useMemo<I18nCtx>(() => ({
    t,
    currentLanguage: cur,
    defaultLanguage: def,
    templateTranslations,
    displayMode: mode,
    enableAudio: !!enableAudio,
    tTemplate: (kind, id, field, fb) => {
      if (cur === def) return fb;
      if (mode === 'english_only') return fb;
      const key = `${kind}:${id}:${field}`;
      const translated = templateTranslations?.[cur]?.[key];
      // bilingual + translated_only both return translation when present, else English fallback.
      return translated ?? fb;
    },
    tTemplateBilingual: (kind, id, field, fb) => {
      if (cur === def) return fb;
      if (mode === 'english_only') return fb;
      const key = `${kind}:${id}:${field}`;
      const translated = templateTranslations?.[cur]?.[key];
      if (mode === 'translated_only') return translated || fb;
      if (!translated || translated === fb) return fb;
      return `${fb} / ${translated}`;
    },
    tTemplateOptionBilingual: (criterionId, optionId, field, fb) => {
      if (cur === def) return fb;
      if (mode === 'english_only') return fb;
      const nsKey = `option:${criterionId}:${optionId}:${field}`;
      const legacyKey = `option:${optionId}:${field}`;
      const bag = templateTranslations?.[cur];
      const translated = bag?.[nsKey] ?? bag?.[legacyKey];
      if (mode === 'translated_only') return translated || fb;
      if (!translated || translated === fb) return fb;
      return `${fb} / ${translated}`;
    },
  }), [t, cur, def, templateTranslations, mode, enableAudio]);

  return (
    <AnnualReviewI18nContext.Provider value={value}>{children}</AnnualReviewI18nContext.Provider>
  );
}

/** Read the active annual-review translator. Safe to use without a provider — returns english. */
export function useAnnualReviewI18n(): I18nCtx {
  return useContext(AnnualReviewI18nContext);
}