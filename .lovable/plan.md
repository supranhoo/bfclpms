## Goal
When the Annual Review form language is Hindi (or Spanish), the "Assisted Submission Verification" dialog — title, description, camera button labels, declaration, and action buttons — must render in the same language. English remains the default when language is `en`.

## Risk & Impact
- UI-only change scoped to `AssistedSubmissionDialog`. No policy, schema, RLS, or backend logic touched.
- Zero-hardcoding rule honored: strings routed through the existing `useAnnualReviewI18n()` translator + `UI_I18N` dictionary (SSOT for AR static strings).
- No regression risk to English users — falls back to current English strings when `currentLanguage === defaultLanguage` or key missing.

## Changes

### 1. `src/lib/annualReview/i18n.ts`
Add new keys under `hi` and `es` (English fallbacks passed inline in the component, per existing pattern):

```
assisted.dialog.title
assisted.dialog.desc                  // supports {employee}, {proxy}, {role}
assisted.btn.capture
assisted.btn.retake
assisted.btn.cancel
assisted.btn.submit
assisted.declaration
assisted.camera.unavailable
assisted.toast.recorded
assisted.toast.failed
assisted.role.reporting_manager
assisted.role.skip_level
assisted.role.authorized_proxy
```

Hindi values (samples):
- title → "सहायक जमा सत्यापन"
- desc → "{employee} की ओर से {proxy} ({role}) के रूप में जमा किया जा रहा है। कर्मचारी की एक लाइव तस्वीर आवश्यक है और ऑडिट साक्ष्य के रूप में रखी जाएगी।"
- capture → "सेल्फी लें", retake → "फिर से लें"
- declaration → "मैं पुष्टि करता/करती हूँ कि दर्ज की गई प्रतिक्रियाएँ कर्मचारी की अपनी हैं। कर्मचारी शारीरिक रूप से उपस्थित है और सत्यापन के रूप में एक लाइव तस्वीर ली गई है।"
- submit → "सत्यापित करें और जमा करें"
- Role labels: प्रबंधक / स्किप-स्तर प्रबंधक / अधिकृत प्रतिनिधि
- Spanish equivalents added in parallel.

### 2. `src/components/annual-review/AssistedSubmissionDialog.tsx`
- Import `useAnnualReviewI18n`.
- Replace every user-visible literal (title, description JSX, capture/retake/cancel/submit button text, checkbox declaration, camera error, toast messages) with `t('assisted.xxx', '<English fallback>')`.
- Description keeps `<strong>` around employee/proxy — build with a template that includes `{employee}` and `{proxy}` placeholders resolved via string replace after translation.
- Translate the `proxyRoleLabel` prop through `t('assisted.role.<label>', '<English fallback>')` for display only. The raw `proxyRoleLabel` value still passes to `submitWithAssistance` unchanged, so the audit row stores the canonical English role string (no data migration).
- `DECLARATION` sent to `submitWithAssistance` remains the canonical English text so audit evidence is stable across languages.

### 3. Tests — `src/test/annualReview/proxySubmission.test.ts` (extend, do not replace)
- Existing test that greps for `AssistedSubmissionDialog` stays.
- Add a snapshot-style assertion that the component source references `useAnnualReviewI18n` and calls `t('assisted.dialog.title', ...)` — locks the SSOT wiring.
- Add a small render test that wraps the dialog in `AnnualReviewI18nProvider` with `currentLanguage="hi"` and asserts the Hindi title/button text render.

### 4. Docs / Memory
- Append a line to `mem/features/annual-review/assisted-submission` under Constraints: "All dialog copy is i18n-routed through `useAnnualReviewI18n`; audit-persisted strings (proxyRoleLabel, declaration_text) stay canonical English."

## Verification
- Manual: open a Hindi template review → click "Assisted self-review" → dialog renders in Hindi.
- English template → dialog unchanged.
- Vitest suite green (existing proxy tests + new i18n test).

## Rollback
Pure additive: revert the two source files; dictionary keys are unused elsewhere so orphaned entries are harmless.
