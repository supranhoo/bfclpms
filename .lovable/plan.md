## Goal
Add one sequential Play button per criterion block that reads the criterion name → description → all 6 option labels aloud in order, using the existing browser Web Speech API. Keep the individual speaker icons intact for one-off replays.

## Risk & Impact
- **Data / RLS / schema:** none — pure client-side UI/audio.
- **Workflow:** none — same `enable_audio` template flag governs visibility.
- **Regression:** low. New component reuses `speech.ts`; existing `<SpeakButton>` remains untouched.
- **Scope:** `CriteriaScoringMatrix.tsx` only (the block shown in the screenshot). Employee, team, auditor, manager, skip, BU annual-review routes already render this component, so they inherit the change automatically.

## Changes

1. **`src/lib/annualReview/speech.ts`** — add `speakSequence(texts: string[], lang, { onIndex, onDone })` that queues utterances via `speechSynthesis` back-to-back using `utter.onend`, plus `stopSpeaking()` reused for cancel. No behavior change for `speak()`.

2. **New `src/components/annual-review/ReadAllButton.tsx`** — accepts `texts: string[]`. Same visibility gating as `SpeakButton` (`enableAudio`, non-default lang, `speechSynthesis` present, voice available, non-empty list). States: idle → playing (shows Pause/Stop icon + current index e.g. "3/8"). Click while playing = stop. Uses `speakSequence`. Cleans up on unmount.

3. **`src/components/annual-review/CriteriaScoringMatrix.tsx`** — render `<ReadAllButton>` once at the criterion header row (next to the existing name-level `<SpeakButton>`), passing `[criterionName, criterionDesc, ...optionLabels]` (empty strings filtered). Individual `<SpeakButton>`s stay as-is.

## Verification
- Build/typecheck.
- Unit test `speakSequence` with a mocked `speechSynthesis` (sequential dispatch, cancel mid-queue, empty input no-op).
- Manual: switch to Hindi on a blue-collar template with `enable_audio` on → single Play reads all 8 items in order; Stop halts immediately; hidden when audio disabled or on default language.

## Docs
- Update `docs/adr/ADR-103.md` with a "v1.1 (2026-07-03)" note: sequential Read-All button added per criterion; per-item icons retained.
- No POLICY.md change (behavior still governed by `enable_audio`).

## Not Applicable
Backend, RLS, migrations, pagination, backup coverage.
