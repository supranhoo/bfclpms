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
    'criteria.your_score': 'आपका स्कोर',
    'status.completed':   'पूर्ण',
    'status.not_started':     'प्रारंभ नहीं हुआ',
    'status.pending_self':    'स्व मूल्यांकन लंबित',
    'status.pending_manager': 'प्रबंधक समीक्षा लंबित',
    'status.pending_skip':    'स्किप प्रबंधक समीक्षा लंबित',
    'status.pending_bu':      'बीयू प्रमुख समीक्षा लंबित',
    'status.pending_hr':      'एचआर अंतिम लंबित',
    'warn.ineligible':    'पात्रता मानदंड पूरे नहीं हुए',
    'btn.submit':         'जमा करें',
    'btn.save_draft':     'मसौदा सहेजें',
    'btn.cancel':         'रद्द करें',
    'note.saving':        'मसौदा सहेजा जा रहा है…',
    'note.saved':         'मसौदा सहेजा गया',
    'note.locked':        'आपकी समीक्षा लॉक है और आगे भेजी गई है',
    'note.save_error':    'सहेजा नहीं जा सका — अपना अंतिम परिवर्तन पुनः आज़माएं।',
    'section.system_scores':         'सिस्टम स्कोर',
    'section.self_assessment':       'स्व-मूल्यांकन मानदंड',
    'section.qualitative':           'गुणात्मक प्रतिक्रियाएँ',
    'section.monthly_kra_breakdown': 'मासिक केआरए विवरण',
    'system_scores.empty':           'इस टेम्पलेट के लिए कोई सिस्टम स्कोर कॉन्फ़िगर नहीं किया गया है।',
    'eligibility.title':             'पात्रता मानदंड पूरे नहीं हुए',
    'col.evidence':                  'साक्ष्य',
    'col.remarks_placeholder':       'टिप्पणियाँ / औचित्य',
    'col.month':                     'महीना',
    'col.kpis':                      'केपीआई',
    'col.avg_score':                 'औसत स्कोर',
    'col.used':                      'उपयोग में',
    'confirm.submit.title':          'अपना स्व-मूल्यांकन जमा करें?',
    'confirm.submit.body':           'जमा करने के बाद आपकी प्रतिक्रियाएँ लॉक हो जाएँगी और प्रबंधक को भेज दी जाएँगी। आप उन्हें बाद में संपादित नहीं कर सकेंगे।',
    'cycle.my_review_by':            'मेरी वार्षिक समीक्षा',
    'evidence.upload':               'साक्ष्य अपलोड करें',
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
    'criteria.your_score': 'Tu puntuación',
    'status.completed':   'Completado',
    'status.not_started':     'No iniciado',
    'status.pending_self':    'Autoevaluación pendiente',
    'status.pending_manager': 'Revisión del gerente pendiente',
    'status.pending_skip':    'Revisión skip pendiente',
    'status.pending_bu':      'Revisión del Jefe de Unidad pendiente',
    'status.pending_hr':      'Finalización de RR. HH. pendiente',
    'warn.ineligible':    'No se cumplen los criterios de elegibilidad',
    'btn.submit':         'Enviar',
    'btn.save_draft':     'Guardar borrador',
    'btn.cancel':         'Cancelar',
    'note.saving':        'Guardando borrador…',
    'note.saved':         'Borrador guardado',
    'note.locked':        'Tu evaluación está bloqueada y reenviada',
    'note.save_error':    'No se pudo guardar — reintenta tu última edición.',
    'section.system_scores':         'Puntuaciones del sistema',
    'section.self_assessment':       'Criterios de autoevaluación',
    'section.qualitative':           'Respuestas cualitativas',
    'section.monthly_kra_breakdown': 'Desglose mensual de KRA',
    'system_scores.empty':           'No hay puntuaciones del sistema configuradas para esta plantilla.',
    'eligibility.title':             'No se cumplen los criterios de elegibilidad',
    'col.evidence':                  'Evidencia',
    'col.remarks_placeholder':       'Comentarios / justificación',
    'col.month':                     'Mes',
    'col.kpis':                      'KPI',
    'col.avg_score':                 'Puntuación media',
    'col.used':                      'Usado',
    'confirm.submit.title':          '¿Enviar tu autoevaluación?',
    'confirm.submit.body':           'Una vez enviada, tus respuestas quedan bloqueadas y se reenvían a tu gerente. No podrás editarlas después.',
    'cycle.my_review_by':            'Mi evaluación anual',
    'evidence.upload':               'Subir evidencia',
  },
};