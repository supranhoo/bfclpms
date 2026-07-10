## Bug: Self‑review draft appears blank on reopen (Upendra Singh, 201091)

### What the user sees
- Fill self-review form → click "Save draft" → toast "Saved".
- Reload / reopen the page → all text boxes and score pickers are empty.
- Admin looking at the same `annual_review_responses` row sees the saved values — the data is safe in the DB, only the UI fails to hydrate.

### Assumptions
- Upendra's row is stage `pending_self` and not locked (so the draft hook is enabled).
- RLS on `annual_review_responses` is fine for self (admin can read, and the row is present — the fetch is not blocked; the values just aren't shown). We verify this before shipping.

### 5‑Why
1. **Why are the text boxes blank on reopen?** The draft state passed to the form is empty (`criteria_scores={}`, `qualitative_responses={}`, `notes=null`) even though the DB row has values.
2. **Why is the draft state empty?** `useDebouncedResponseDraft` seeds its local state from `opts.initial` via `useState(...)` **only on the very first render**.
3. **Why does that first render see no data?** On mount, `useResponses(instance.id)` hasn't resolved yet, so `myResponse = responses.find(r => r.reviewer_role === 'self') ?? null` is `null`. The hook seeds with all-empty defaults.
4. **Why doesn't the hook re-seed when the query resolves?** There is no `useEffect` that syncs `draft` when `opts.initial` transitions from `null` → the fetched row. `useState` initializers only run once.
5. **Why did this survive review?** ADR‑105 removed the debounced autosave to stop a *revert-to-server* race, but the same code path still has a *seed-once-from-null* bug. Tests cover "no autosave" and "flush persists", but there is no test for "initial arrives late → draft rehydrates". The Team detail sheet remounts on open so it accidentally re-seeds; the standalone Employee page mounts once and exposes the bug.

### Root cause
`src/hooks/useAnnualReview.ts` → `useDebouncedResponseDraft`:

```ts
const [draft, setDraftState] = useState<DraftPayload>({
  criteria_scores: opts.initial?.criteria_scores ?? {},
  qualitative_responses: opts.initial?.qualitative_responses ?? {},
  evidence: opts.initial?.evidence ?? [],
  weighted_score: opts.initial?.weighted_score ?? null,
  notes: opts.initial?.notes ?? null,
});
```

`useState` runs the initializer once. `opts.initial` is `null` at first paint (query still loading) and later becomes the persisted response, but `draft` is never reconciled. Result: pickers render from an empty object; on save/flush the empty object overwrites nothing (nothing changed), but on Submit / next edit the empty state can even wipe fields.

This is the *inverse* of the risk ADR‑105 called out, and it maps 1‑to‑1 with the "Auth Readiness Query Gate" and Reviewer‑Draft‑Hydration invariants already in project memory (POLICY §107): saved values must render verbatim.

### Corrective action (CA) — surgical, one hook

**File: `src/hooks/useAnnualReview.ts` (`useDebouncedResponseDraft`)**

1. Track the identity of the seed with a ref (`seededResponseIdRef`).
2. Add a `useEffect` that, when `opts.initial` becomes non-null (or its `id`/`updated_at` changes) AND the local `status` is not `'pending'` (user hasn't started editing), re-seeds `draft` from `opts.initial` and sets `status = 'idle'`.
3. Never overwrite a `'pending'` draft — that would resurrect the ADR‑105 revert bug. If the user is mid-edit and a refetch lands, keep local edits.

Pseudocode:

```ts
const seededIdRef = useRef<string | null>(null);
useEffect(() => {
  const init = opts.initial;
  if (!init) return;
  const key = `${init.id}:${init.updated_at ?? ''}`;
  if (seededIdRef.current === key) return;
  if (statusRef.current === 'pending' || statusRef.current === 'saving') return;
  seededIdRef.current = key;
  setDraftState({
    criteria_scores: init.criteria_scores ?? {},
    qualitative_responses: init.qualitative_responses ?? {},
    evidence: init.evidence ?? [],
    weighted_score: init.weighted_score ?? null,
    notes: init.notes ?? null,
  });
  setStatus('idle');
}, [opts.initial?.id, opts.initial?.updated_at]);
```

No other files change. `EmployeeAnnualReview.tsx` and `TeamReviewDetailContent.tsx` already pass `initial={myResponse}`.

### Preventive actions (PA)

1. **Regression test** (`src/test/annualReview/useDebouncedResponseDraftLateInitial.test.ts`):
   - Mount hook with `initial: null`.
   - Rerender with `initial: { id:'r1', updated_at:'t1', criteria_scores:{X:5}, notes:'hi' }`.
   - Expect `draft.criteria_scores.X === 5` and `notes === 'hi'`, `status === 'idle'`.
   - Second scenario: set `draft` locally (status = pending), then rerender with a new `initial` — expect local edits preserved, no re-seed.
2. **Extend existing test** (`useDebouncedResponseDraftNoAutosave.test.ts`) to assert that a late-arriving `initial` after a `pending` edit does **not** clobber the local draft — locks in the ADR‑105 invariant while fixing this one.
3. Update `docs/adr/ADR-105.md` with an addendum, and add a memory note under `mem://features/annual-review/operations` about the "seed once + refetch" pitfall so future hooks that mirror this pattern don't repeat it.

### Risk & impact

- **Data**: none. Read path only; no schema, RLS, or write changes.
- **Workflow**: none. No stage transitions altered.
- **UI/UX**: forms now show saved draft on reopen (the intended behavior).
- **Regression risk (ADR‑105 revert)**: mitigated by the `status !== 'pending'` guard and the second regression test.
- **Scalability**: negligible — one shallow effect keyed on `id`+`updated_at`.

### Rollback

Delete the added `useEffect` and ref. Fully additive; no data migration.

### Verification steps

1. Log in as Upendra (or any self-review user with an existing draft), open `/annual-review/self`, confirm previously saved criteria scores, qualitative answers, and notes render immediately.
2. Edit a field, do NOT save, wait for a background refetch (invalidate) — confirm the edit is preserved (not reverted).
3. Save draft, reload — confirm values still render.
4. `bun vitest run useDebouncedResponseDraft` — both tests green.

### Deliverables
- Edit: `src/hooks/useAnnualReview.ts`
- Add: `src/test/annualReview/useDebouncedResponseDraftLateInitial.test.ts`
- Edit: `src/test/annualReview/useDebouncedResponseDraftNoAutosave.test.ts` (one extra case)
- Edit: `docs/adr/ADR-105.md` (addendum)
- Memory: append note to `mem://features/annual-review/operations`
