# Restore Speaker (Read-Aloud) Feature

Bring back the Phase 1 Web Speech API read-aloud that was removed on 2026-07-02. This is a straight revert of that removal — no new work, no Phase 2 AI TTS fallback.

## What comes back

**Recreate deleted files** (from ADR-103 v1.0.1 spec):
- `src/lib/annualReview/speech.ts` — `hasVoiceFor(lang)` + `speak(text, lang)` helpers over `window.speechSynthesis`
- `src/lib/annualReview/speech.test.ts` — unit tests for the helpers
- `src/components/annual-review/SpeakButton.tsx` — icon button; returns `null` when gate fails (audio off, lang == default, no `speechSynthesis`, or no voice for lang)
- `src/test/annualReview/teamDetailEnableAudioWiring.test.tsx` — regression pinning `enableAudio` prop flows through the team-detail provider (the exact bug fixed in v1.0.1)

**Restore context/type wiring**:
- `src/types/annualReview.ts` — re-add `enable_audio?: boolean` on template settings
- `src/components/annual-review/AnnualReviewI18nContext.tsx` — re-add `enableAudio` to context type, provider props, default (`false`), and memo value
- `src/pages/annual-review/EmployeeAnnualReview.tsx` — pass `enableAudio={settings.enable_audio === true}` on both `AnnualReviewI18nProvider` usages; re-add `<SpeakButton>` next to the translated field label
- `src/components/annual-review/TeamReviewDetailContent.tsx` — pass `enableAudio` on the provider (the fix that made it visible on team/auditor/manager/skip/BU routes)
- `src/components/annual-review/CriteriaScoringMatrix.tsx` — re-add `<SpeakButton>` beside the three translated targets (criterion name, criterion description, option label)

**Restore admin toggle**:
- `src/components/annual-review/TemplateEditorDialog.tsx` — re-add the "Enable read-aloud (speaker icon)" Switch inside the Multilingual card, bound to `sections.settings.enable_audio`

**Docs**:
- `docs/adr/ADR-103.md` — flip Status back to **Accepted**, add a note "Re-instated on user request on 2026-07-03 after brief removal on 2026-07-02". Keep the graceful-fallback contract and browser matrix unchanged.
- `POLICY.md` + `DOCUMENTATION.md` — one-line entries recording restore.
- `mem/index.md` — re-add the speaker feature line if it was pruned.

## What stays out (scope guard)

- **No AI Gateway TTS fallback** (Phase 2). Linux desktops without an OS voice pack still see nothing — same behavior as before removal.
- No changes to translations, bilingual display, language switcher, autosave/draft work, or any other Annual Review logic.

## Data / DB impact

None. `enable_audio` is a boolean inside the JSON `sections.settings` blob — no column, no migration, no RLS. Existing templates default to `false` (feature off) until an admin toggles it on.

## Response-contract sections

- **Assumptions:** you want the exact Phase 1 behavior back (Web Speech only, per-template flag, silent fallback). If you want the AI Gateway fallback too, say so and I'll re-plan with billing controls.
- **Risk & Impact:** UI-only. Speaker icon appears beside translated content when (a) admin enables the flag on the template and (b) the device has an OS voice for the active language. Zero regression risk to any other module — the same code shipped and ran cleanly before.
- **Scalability:** Zero server cost; audio synthesized on-device.
- **Rollback:** re-delete the same files listed above; single revert commit.

## Verification

- `tsgo` clean.
- Vitest: 2 restored test files pass (`speech.test.ts`, `teamDetailEnableAudioWiring.test.tsx`).
- Manual: enable "Enable read-aloud" on a blue-collar template → open Team Review detail in Hindi → speaker icons render beside translated criteria/options → click plays audio.

Approve and I'll restore the files exactly as they were, or tell me if you also want the AI Gateway fallback layered on top.
