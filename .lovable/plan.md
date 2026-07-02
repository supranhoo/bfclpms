
## Cause — Team Annual Review (blue-collar) score reverts 4 → 5

The sheet has TWO writers fighting for the same row:

1. **Debounced autosave** — `useDebouncedResponseDraft` in `src/hooks/useAnnualReview.ts` schedules `setTimeout(persist, 2000)` after every `setDraft` and, on success, invalidates `annualReviewKeys.responses(instanceId)` which refetches `useInstanceResponses`.
2. **Explicit "Save draft" button** — `TeamReviewDetailContent.tsx:273` calls the same hook's `flush()`, which cancels the timer and persists immediately.

The reproducible race:

```text
t=0     click 5             → local draft = 5, autosave T1 armed for t=2000
t=~600  click "Save draft"  → flush() persists 5, invalidates `responses`
t=~900  click 4             → local draft = 4, autosave T2 armed for t=~2900
t=~1200 refetch of `responses` returns {X:5} (the value we just saved)
```

Two things then collide:

- The hook seeds its local `draft` from `opts.initial` **only on first mount** (`useState({ criteria_scores: opts.initial?.criteria_scores ?? {} ... })`). It never re-syncs. Good for the happy path — but this also means the moment ANYTHING remounts the sheet (parent switching between `isLoading`/`instance` during the refetch, a re-key on `instance`, the scroll-triggered re-render of `CriteriaScoringMatrix` when a parent memo boundary is crossed), the local `draft` is re-initialised from the freshly-refetched `myResponse`, which still says **5**.
- Meanwhile T2's `persist(4)` may not yet have fired, so the server never received the 4. Result: after a scroll, the visible score snaps back to the last server value, **5**.

This is exactly the pattern ADR-075 removed from `/admin/org-kpi-data`: whenever an explicit Save button exists on the same surface as a 2s debounce, the two paths race and the user loses edits.

## Fix — remove autosave here; keep only the explicit button

Scope is deliberately narrow: this is a UI/coordination bug, no DB / RLS / schema / service change.

1. **`src/hooks/useAnnualReview.ts` — `useDebouncedResponseDraft`**
   - Delete the `setTimeout(persist, delay)` scheduling inside `setDraft`. `setDraft` still marks `status='pending'` so the amber "Unsaved changes" pill lights up.
   - `flush()` stays as-is (persists immediately, sets `saved`).
   - Remove the `delayMs` option (now unused) — leave the signature otherwise untouched so no other caller breaks.
   - Add unsaved-guard: import `useUnsavedChanges` and call it with `status === 'pending'` so users get a `beforeunload` warning if they navigate away with dirty edits (same guard ADR-075 uses).

2. **`src/components/annual-review/TeamReviewDetailContent.tsx`**
   - Status pill text: extend the existing indicator (`'Saving…' | 'Draft saved' | 'Save error'`) with `pending → "Unsaved changes"` in amber, matching Org KPI Data Entry.
   - `handleSubmit` and `handleSendBack` already call `await flush()` first — no change needed; they will now be the only auto-flush points (submit/send-back/unmount cleanup).
   - Keep the unmount cleanup effect but change it to `await persist()` on cleanup so an unmount doesn't silently drop dirty edits. (Fire-and-forget — same pattern the hook already uses; failures surface on next mount as stale server data, and the beforeunload guard covers the tab-close case.)

3. **`src/pages/annual-review/EmployeeAnnualReview.tsx`** (only other caller of `useDebouncedResponseDraft`)
   - No code change required — it already renders a "Save draft" button and relies on `flush()`. Behaviour becomes: no more background autosave; save is explicit. Verify pill wording matches the team page.

4. **Tests**
   - New `src/test/annualReview/useDebouncedResponseDraft.noAutosave.test.ts`: assert `setDraft` does NOT schedule a `setTimeout` and does NOT call `svc.upsertResponseDraft`; `flush()` still persists and invalidates.
   - New `src/test/annualReview/teamReviewDetailNoRevert.test.tsx`: mount `TeamReviewDetailContent`, seed a response of `{X:5}`, click 4, force a refetch of `useInstanceResponses` returning `{X:5}`, assert the picker still shows **4** (not 5) — this pins the regression.

5. **Docs / policy**
   - Add `docs/adr/ADR-105.md` (short): "Annual Review team detail — remove 2s autosave, mirror ADR-075".
   - Update `mem://features/annual-review/overview` with a one-liner: "Team & self detail sheets use explicit Save-draft only; no debounced autosave."

## Not in scope

- No change to `annual_review_responses` schema, RLS, or `upsertResponseDraft` service.
- No change to the score picker component itself.
- No change to Self / Manager / Skip / HR / Auditor / Management PMS scorecards — those already follow the reviewer-draft hydration SSOT (POLICY §107) and don't have this race.

## Risk & rollback

- Risk: users who relied on "just close the tab and it saves" lose that behaviour. Mitigated by (a) the amber "Unsaved changes" pill, (b) the `beforeunload` warning, (c) the on-unmount `persist()` cleanup.
- Rollback: revert the two hook edits — `setDraft` re-schedules the timer, status pill reverts. Fully additive, no data migration.
