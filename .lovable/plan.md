## Build: Web Speech API Read-Aloud (Phase 1) for Blue-Collar Self Review

### Assumptions
- Approach **A** confirmed: `window.speechSynthesis`, zero server cost, zero new deps.
- Scope: **on-demand** speaker icon beside translated criterion name + description, each option label, and each self-review qualitative field label. Only renders when `template.settings.enable_audio === true` AND active language ≠ default AND OS has a matching voice.
- No voice **input**, no auto-read on focus, no full-page "read all" — out of scope for v1.

### Risk & Impact
- **Data:** None — no schema change, no DB migration, no RLS touch.
- **Workflow:** None — additive, feature-flagged.
- **UI/UX:** Adds a 32×32 icon button beside existing text. Reserved space (no layout shift when hidden).
- **Regression:** Near-zero — gated by `enable_audio` flag (default `false`); existing templates unchanged.
- **Scalability:** Zero — 100% client-side, OS-native engine.
- **Backup:** No schema change → automatic coverage preserved.
- **Rollback:** Toggle off `enable_audio` in template → component renders `null`. No data residue.

### Files to add / change

**Add**
1. `src/lib/annualReview/speech.ts` — singleton wrapper:
   - `isSpeechSupported()` — feature-detects `window.speechSynthesis`.
   - `getVoiceFor(lang)` — finds best match (`hi`, `hi-IN`, `es`, etc.), handles Chrome's empty-on-first-call quirk via `voiceschanged` event + cache.
   - `speak(text, lang)` — cancels any prior utterance, creates `SpeechSynthesisUtterance`, sets `voice`, `lang`, `rate=0.95`. Returns a promise resolving on `onend`/`onerror`.
   - `cancel()` — stops current playback.
   - Tab-visibility resume (Chrome auto-pauses backgrounded tabs).
2. `src/components/annual-review/SpeakButton.tsx` — icon-only `Button` (Volume2 ↔ Square toggle), `aria-label`, 32 px, `min-h-[32px] min-w-[32px]`. Disabled while voices load (<300 ms). Returns `null` when no voice available — silent graceful degrade. Tracks playing state per-instance; clicking another button auto-cancels the first via the shared singleton.
3. `src/lib/annualReview/speech.test.ts` — vitest with mocked `speechSynthesis`:
   - supported / unsupported feature detect
   - cancel-on-replace
   - voice match by `lang` prefix (`hi` → `hi-IN`)
   - no-voice → `speak()` no-op returns `false`
4. `src/test/annualReview/speakButton.test.tsx` — renders nothing when `enable_audio=false`; renders nothing when no voice; renders speaker icon and toggles on click; aria-label correct in Hindi.
5. `docs/adr/ADR-103.md` — *Web Speech API read-aloud for blue-collar self review*. Records: chosen approach, rejected alternatives (Lovable AI TTS deferred to v2, pre-generated MP3 rejected as over-engineering), graceful-fallback contract, flag default = off.

**Edit**
6. `src/types/annualReview.ts` — add `enable_audio?: boolean` to `TemplateSettings`.
7. `src/components/annual-review/AnnualReviewI18nContext.tsx` — extend context with `enableAudio: boolean`; accept `enableAudio` prop on provider. Default `false` for safety.
8. `src/components/annual-review/TemplateEditorDialog.tsx` — under the Multilingual card, add a `Switch` for "Enable read-aloud (speaker icon)" gated by `multilingual === true`, with helper text: *"Adds a speaker icon beside translated text. Uses the user's device voice — no internet required after first use."*
9. `src/components/annual-review/CriteriaScoringMatrix.tsx` — pull `enableAudio`, `currentLanguage` from context; render `<SpeakButton text={...} lang={currentLanguage} />` beside:
   - criterion `name` (top-right of title block)
   - criterion `description` (inline after text)
   - each option `label` (small, top-right of option card)
   Use the **translated** text (the resolved `tTemplate*` value), not the English source.
10. `src/pages/annual-review/EmployeeAnnualReview.tsx` — pass `enableAudio={template?.sections.settings?.enable_audio === true}` into both `AnnualReviewI18nProvider` instances. Render `<SpeakButton>` beside each `self_review_fields` `Label`.

### Step-by-step plan
1. Add `enable_audio` to `TemplateSettings` type. ✓ verify type compiles.
2. Build `speech.ts` singleton + unit tests. ✓ run `bunx vitest run speech.test`.
3. Build `SpeakButton.tsx` + component tests. ✓ run vitest.
4. Wire `enableAudio` through `AnnualReviewI18nContext`. ✓ existing i18n tests stay green.
5. Add admin toggle in `TemplateEditorDialog`. ✓ manual check: toggle persists in `sections.settings.enable_audio`.
6. Mount `SpeakButton` in `CriteriaScoringMatrix` (3 spots) + `EmployeeAnnualReview` field labels. ✓ Playwright sanity check on `/employee/annual-review` with Hindi active.
7. Write `ADR-103.md`; append `DOCUMENTATION.md` §Annual Review → Multilingual; append `POLICY.md` §Multilingual subsection "Read-aloud (audio)".
8. Final build/typecheck (auto-run by harness).

### UI Changes (explicit)
- **Where:** Inside the Blue-Collar self-review form only (any template with `enable_audio=true`).
- **What:** A 32 px Volume2 speaker icon `Button variant="ghost" size="icon"` placed:
  - top-right of each criterion title row (no layout shift; flex `gap-2`)
  - top-right corner of each option button card (`absolute top-2 right-2`)
  - to the right of each qualitative field `Label` (inline-flex)
- **Interaction:** click → plays translated text via OS voice; icon swaps to a stop square while playing; clicking any other speaker auto-stops the previous one (singleton enforces single-utterance).
- **States:** idle (Volume2), playing (Square), loading-voices (Loader2 spinner, ≤300 ms), unsupported / no-voice (button not rendered).
- **Responsiveness:** identical on mobile and desktop. Tap target ≥32 px (meets shop-floor minimum given surrounding padding).
- **No layout shift** for templates without `enable_audio` — button tree returns `null` early.

### Tests
- `src/lib/annualReview/speech.test.ts` — 4 cases (feature-detect, voice match, cancel-on-replace, no-voice).
- `src/test/annualReview/speakButton.test.tsx` — 4 cases (flag-off → null, no-voice → null, click toggles state, aria-label localised).
- Existing `i18nContext.test.tsx` and `i18nDisplayMode.test.tsx` must still pass — new context field is optional with safe default.

### Documentation & Policy
- `DOCUMENTATION.md` → §Annual Review → Multilingual: new subsection *"Read-aloud (audio)"* documenting the flag, browser support matrix, graceful-fallback contract, and v2 (Lovable AI TTS) roadmap pointer.
- `POLICY.md` → §Multilingual: add bullet *"Read-aloud is a presentation aid only. The written translation remains the source of truth; absence of audio (unsupported device / missing voice) does not invalidate the form."*
- New `docs/adr/ADR-103.md`.

### Rollback
- Per-template: admin toggles `enable_audio` off → component returns `null` immediately, no rebuild needed.
- Global revert: remove `SpeakButton` imports, delete `speech.ts`, delete `enable_audio` field. Migration-free.

### Out of scope (deferred to v2)
- Lovable AI TTS fallback for devices without OS Hindi voice (Linux desktops, very old Androids).
- IndexedDB cache for repeated phrases.
- Spanish/other language voice testing — flag will work, but field-test before promoting.
- Auto-read on focus.
- Voice input / dictation (separate feature).
