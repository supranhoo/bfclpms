# Discontinue Speaker (Read-Aloud) Feature

Per your request, drop both the built Phase 1 Web Speech feature and the not-yet-built Phase 2 AI TTS plan. Only speaker-related code is touched — translations, bilingual display, template settings for language, and the annual-review draft/autosave work all stay as-is.

## What gets removed

**Components / lib**
- `src/components/annual-review/SpeakButton.tsx` — delete
- `src/lib/annualReview/speech.ts` — delete
- `src/lib/annualReview/speech.test.ts` — delete
- `src/test/annualReview/teamDetailEnableAudioWiring.test.tsx` — delete

**Call sites (remove `SpeakButton` usage + import only; leave surrounding markup)**
- `src/pages/annual-review/EmployeeAnnualReview.tsx` — drop import, remove `<SpeakButton …>` at line 250
- `src/components/annual-review/CriteriaScoringMatrix.tsx` — drop import, remove three `<SpeakButton …>` usages (lines 80, 85, 153)

**Context / types (drop the `enableAudio` prop + field)**
- `src/components/annual-review/AnnualReviewI18nContext.tsx` — remove `enableAudio` from the context type, provider props, default value, and memo
- `src/types/annualReview.ts` — remove `enable_audio?: boolean` from the settings type
- `src/pages/annual-review/EmployeeAnnualReview.tsx` — drop the two `enableAudio={…}` props on `AnnualReviewI18nProvider` (lines 136, 193)
- `src/components/annual-review/TeamReviewDetailContent.tsx` — drop the `enableAudio={…}` prop (line 186)

**Template editor UI**
- `src/components/annual-review/TemplateEditorDialog.tsx` — remove the "Enable read-aloud (speaker icon)" Switch block (lines 221–237)

**Docs**
- `docs/adr/ADR-103.md` — mark **Status: Superseded — feature removed on request** with a one-line note; keep the file so history is preserved (do not delete)
- `.lovable/memory/features/annual-review/operations.md` — remove any read-aloud entry if present

## Data / DB impact

None. `enable_audio` lives inside the JSON `sections.settings` blob on templates — no column, no migration. Existing templates that have the flag set are simply ignored after the type is removed; no cleanup required. Zero RLS, backup, or policy changes.

## Risk & regression

- No functional loss beyond the speaker icon itself.
- Bilingual rendering, language switcher, translations, and autosave/draft fixes from the previous turn are untouched.
- Build risk is limited to leftover imports — verified by grepping `SpeakButton`, `enable_audio`, `enableAudio`, `speech.ts` after edits; must return zero hits outside the ADR-103 file.

## Rollback

`git revert` the removal commit — files come back exactly as they were (Phase 1 was self-contained).

## Verification

- `tsgo` clean (no dangling imports / props)
- Vitest suite green (the deleted `speech.test.ts` and `teamDetailEnableAudioWiring.test.tsx` are removed from the run)
- Manual: open a blue-collar Team Review detail in Hindi → no speaker icon anywhere, page otherwise identical.
