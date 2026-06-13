/**
 * Annual Review — static UI translation dictionary.
 * Used as a fallback when a template doesn't provide its own translation
 * for a given key. Resolution precedence (see useAnnualReviewTranslation):
 *   1. currentLang === defaultLang  → return english fallback
 *   2. template.translations[lang][key]
 *   3. UI_I18N[lang][key]
 *   4. english fallback (the value passed to t())
 */

export type SupportedLang = 'en' | 'hi' | 'es';

export const LANGUAGE_ALIASES: Record<string, SupportedLang> = {
  en: 'en', english: 'en',
  hi: 'hi', hindi: 'hi',
  es: 'es', spanish: 'es', español: 'es',
};

export function normalizeLang(input: string | null | undefined): SupportedLang {
  if (!input) return 'en';
  const key = String(input).toLowerCase();
  return LANGUAGE_ALIASES[key] ?? 'en';
}

export const UI_I18N: Record<SupportedLang, Record<string, string>> = {
  en: {},
  hi: {
    'stage.self':         'स्व मूल्यांकन',
    'stage.manager':      'प्रबंधक',
    'stage.skip_manager': 'स्किप प्रबंधक',
    'stage.bu_head':      'बीयू प्रमुख',
    'stage.hr':           'एचआर अंतिम',
    'col.weight':         'भार',
    'col.score':          'अंक',
    'col.total':          'कुल',
    'status.completed':   'पूर्ण',
    'status.pending_self':    'स्व मूल्यांकन लंबित',
    'status.pending_manager': 'प्रबंधक समीक्षा लंबित',
    'status.pending_skip':    'स्किप प्रबंधक समीक्षा लंबित',
    'status.pending_bu':      'बीयू प्रमुख समीक्षा लंबित',
    'status.pending_hr':      'एचआर अंतिम लंबित',
    'warn.ineligible':    'पात्रता मानदंड पूरे नहीं हुए',
    'btn.submit':         'जमा करें',
    'btn.save_draft':     'मसौदा सहेजें',
    'note.saving':        'मसौदा सहेजा जा रहा है…',
    'note.saved':         'मसौदा सहेजा गया',
    'note.locked':        'आपकी समीक्षा लॉक है और आगे भेजी गई है',
  },
  es: {
    'stage.self':         'Autoevaluación',
    'stage.manager':      'Gerente',
    'stage.skip_manager': 'Skip Manager',
    'stage.bu_head':      'Jefe de Unidad',
    'stage.hr':           'RR. HH.',
    'col.weight':         'Peso',
    'col.score':          'Puntuación',
    'col.total':          'Total',
    'status.completed':   'Completado',
    'status.pending_self':    'Autoevaluación pendiente',
    'status.pending_manager': 'Revisión del gerente pendiente',
    'status.pending_skip':    'Revisión skip pendiente',
    'status.pending_bu':      'Revisión del Jefe de Unidad pendiente',
    'status.pending_hr':      'Finalización de RR. HH. pendiente',
    'warn.ineligible':    'No se cumplen los criterios de elegibilidad',
    'btn.submit':         'Enviar',
    'btn.save_draft':     'Guardar borrador',
    'note.saving':        'Guardando borrador…',
    'note.saved':         'Borrador guardado',
    'note.locked':        'Tu evaluación está bloqueada y reenviada',
  },
};