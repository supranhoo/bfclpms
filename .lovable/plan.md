## Problem

On `/annual-review/team/:id` (Team / Auditor / Manager / Skip / BU view) the read-aloud speaker icons never appear next to the Hindi criterion names, option labels, or qualitative field labels — even when the template has `settings.enable_audio = true` and a Hindi voice is installed on the device. The Employee self-review route shows them correctly.

## Root cause

`SpeakButton` returns `null` whenever `enableAudio` from `AnnualReviewI18nContext` is not `true`. The context defaults `enableAudio` to `false`.

`src/pages/annual-review/EmployeeAnnualReview.tsx` correctly passes `enableAudio={template?.sections.settings?.enable_audio === true}` into both of its `AnnualReviewI18nProvider` instances.

`src/components/annual-review/TeamReviewDetailContent.tsx` (lines 181–186) wraps the whole team-detail page in `AnnualReviewI18nProvider` but **omits the `enableAudio` prop**, so it falls back to `false` and every `SpeakButton` rendered inside `CriteriaScoringMatrix` returns `null`.

In addition, the team detail page renders a "self review" qualitative-comments textarea (visible in the screenshot) without a `SpeakButton` next to the field label — the Employee page mounts one there, the Team page does not. Same root cause once the provider is fixed, plus a missing mount.

## Risk & Impact

- **Data impact:** none — UI-only.
- **Workflow impact:** none — purely additive presentation aid.
- **UI/UX:** speaker icon (32px) appears next to translated criterion name/description, each option label, and qualitative field labels for managers / auditors / skip / BU when the template flag is on and a matching voice exists. Falls back silently if not.
- **Regression risk:** very low — `enableAudio === true` gate keeps every existing template (flag unset) unchanged.
- **Mitigation:** unit test asserts the provider forwards `enableAudio`, and a render test on the team detail wrapper confirms the prop is wired.

## Plan

1. **`src/components/annual-review/TeamReviewDetailContent.tsx`** — add `enableAudio={template?.sections.settings?.enable_audio === true}` to the existing `<AnnualReviewI18nProvider>` (line 181). One-line surgical change.

2. **Mount `<SpeakButton>` beside the qualitative-comments field label on the team detail page** (the "टिप्पणियाँ / औचित्य" textarea visible in the screenshot). Reuse the same pattern from `EmployeeAnnualReview.tsx` line 250: `<SpeakButton text={translatedLabel} size="sm" />`. If the team page does not render qualitative field labels itself (they come from `CriteriaScoringMatrix`), step 1 alone is sufficient and this step becomes a no-op — to be confirmed during build by reading lines 260–329 of `TeamReviewDetailContent.tsx`.

3. **Test:** add `src/test/annualReview/teamDetailSpeakButton.test.tsx` — render `TeamReviewDetailContent` with a stub template `{ settings: { enable_audio: true } }` and Hindi as current language; assert at least one `aria-label="Listen"` button is in the DOM. Add a negative case with `enable_audio: false` asserting none.

4. **Docs:** append a one-line entry to `docs/adr/ADR-103.md` under "Known gaps fixed" — "v1.0.1: TTS button now also renders on team / auditor / manager / skip / BU detail routes (was previously self-review only due to a missing provider prop)." No POLICY.md change (no policy shift).

## Out of scope

- No change to speech engine, voice loading, or button visuals.
- No new template flag, no migration.
- Spanish / other-language voice testing remains v2.

## Rollback

Revert the one-line prop change; behaviour returns to today's (icons hidden on team detail).