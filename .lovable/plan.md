## RCA — "Saved as 103 / rating 0, reopens as 99 / rating 4"

### Confirmed from DB (kpi `f8a9da89…`, "Control Specific Coal Consumption", Lower-is-Better, R0=>102):

```
auditor_score = 0.00              (saved by auditor)
auditor_rating = red
auditor_remarks = "Total Coal Consumption - 1.22 ..."
auditor_achieved_value = 103      (saved by auditor)
achieved_value = 99               (employee's self submission)
```

The KPI Journey tile reads from `submission.auditor_*` and **correctly** shows Value:103 / Rating:0.
The picker form reads via `UnifiedScorecard.openReviewSheet` → `AchievedValueScoreInput` and **incorrectly** shows 99 / 4 (employee value + auto-calc rating).

### Why-Why

1. **Why does the picker show 99 instead of 103?** — `reviewerAchievedValue` was set to the employee's `achieved_value` (99) instead of the auditor's `auditor_achieved_value` (103) at hydration time.
2. **Why was it set to the employee's value?** — One of two race/branch paths in `UnifiedScorecard.tsx` lines 952–979 collapsed to the "no-draft" else branch (line 974), so `baseAchieved = existing.achieved_value = 99`.
3. **Why did the "draft exists" branch fail?** — Either (a) `submissionMap.get(kpi.id)` returned `undefined` on first paint because `kpiIds` (line 359) is **not memoized** — every render creates a new array, the `useReviewSubmissions` queryKey thrashes, and the freshly-saved row hasn't repopulated in time when the sheet reopens, OR (b) hydration succeeded with 103 but `AchievedValueScoreInput`'s auto-recalc `useEffect` (lines 73–87) silently overwrote score on a stale prop chain.
4. **Why is the auto-recalc effect dangerous?** — It runs `onScoreChange(result.rating, …)` **whenever** `result.rating !== score`, with no guard that the reviewer already has a persisted score. A single transient render where `score` is briefly stale or `achievedValue` flips to the employee fallback will overwrite the reviewer's saved 0 with the auto-derived 4.
5. **Why does the same risk apply elsewhere?** — All five reviewer stages (Manager, Skip-Level, HR PMS, Auditor, Management) flow through the same `openReviewSheet` + `AchievedValueScoreInput` pair in `UnifiedScorecard.tsx`. The legacy `AuditScorecard.tsx` has the identical pattern (lines 408–467). `SelfReviewSheet` has it for qualitative (already partly hardened — see `mem/features/review/auditor-draft-qualitative-hydration`) but NOT for numeric KPIs.

### Root cause (single sentence)

`UnifiedScorecard` does not snapshot the reviewer-owned hydration values before handing them to `AchievedValueScoreInput`, and `AchievedValueScoreInput` then re-derives a score from achievedValue on every effect run, so any transient mismatch between the two state slots silently rewrites the reviewer's saved score back to the employee-derived value.

---

## Risk & Impact Report

| Area | Impact |
|---|---|
| Data | Picker UI mis-renders saved reviewer scores; if reviewer clicks Save Draft again without noticing, the auto-derived score (4) overwrites the persisted 0. **Silent data corruption risk on every re-open.** |
| Workflow | Every reviewer stage (5 roles) affected. Most visible for Lower-is-Better KPIs where auto-calc and reviewer judgement diverge sharply. |
| UI/UX | Auditor sees a different value than what they saved → loss of trust, repeated re-work. |
| Regression | Fix touches one hot path (`UnifiedScorecard.openReviewSheet`) and one shared input (`AchievedValueScoreInput`). Must not break: qualitative drafts (binary/tiered), N/A overrides, daily-binary reviewer agree/disagree, sessionStorage drafts. |
| Scalability | Memoizing `kpiIds` also fixes a per-render refetch storm on `review_submissions` (separate perf win). |

Mitigation: snapshot+guard pattern, full unit-test matrix across the 5 reviewer stages × 3 UOM types × 2 criteria, plus an `effect-self-heal` guard that refuses to overwrite a non-null saved reviewer score.

---

## Plan

### Step 1 — Stabilise the `submissions` cache feeding `submissionMap`

File: `src/components/review/UnifiedScorecard.tsx`

- Memoize `kpiIds` (line 359) → `useMemo(() => kpis?.map(k => k.id) || [], [kpis])`. Prevents the `useReviewSubmissions` queryKey churn that races sheet-open hydration.
- Verify: same fix for `allKpiIds` (already memoized at line 370 — keep).

### Step 2 — Make reviewer-draft hydration deterministic and snapshot-based

File: `src/components/review/UnifiedScorecard.tsx`, `openReviewSheet` (lines 922–1052).

- Extract hydration into a pure helper `hydrateReviewerDraft(existing, kpi, viewLevel, scoreFieldPrefix)` returning `{ achievedValue, score, remarks, evidenceUrls, source }` where `source` is `'reviewer-draft' | 'employee-prefill' | 'empty'`.
- Hardening rules inside the helper:
  - `hasReviewerDraft` = any of `*_score`, `*_rating`, non-empty `*_remarks`, `*_achieved_value`, `*_evidence_url(s)`.
  - If `hasReviewerDraft`: `achievedValue = existing[*_achieved_value]` (never `existing.achieved_value`). For qualitative, derive label from `*_score` (existing rule from §96 / qualitative-hydration memo).
  - If NOT `hasReviewerDraft`: prefill from employee's `achieved_value` (current "fresh review" UX).
  - Never recompute score from achievedValue here — the score that goes into state must be the reviewer's saved `*_score` verbatim.
- After computing the bundle, store it in a `lastHydratedRef.current = { kpiId, ...bundle }` to guard against effect-driven overwrites (see Step 3).

### Step 3 — Stop `AchievedValueScoreInput` from silently overwriting a saved reviewer score

File: `src/components/review/AchievedValueScoreInput.tsx`, lines 73–87.

- Replace the unconditional recompute with a *user-input-driven* trigger:
  - Add a `prevAchievedValueRef = useRef(achievedValue)`.
  - Only run auto-recalc when `achievedValue` **transitions** AND the transition was initiated locally (via `handleAchievedValueChange`), OR when `score === null`.
  - Never call `onScoreChange` when `score !== null && achievedValue` is the **initial** value handed in by the parent (i.e., on mount).
- Concretely: on mount, set `prevAchievedValueRef.current = achievedValue` and skip the effect's auto-correction. On subsequent updates, only correct when `prevAchievedValueRef.current !== achievedValue`.
- Public API unchanged. Modes `manual`, `suggested_override`, qualitative branch, and Date branch untouched.

### Step 4 — Cross-stage parity sweep

- `UnifiedScorecard` covers Manager / Skip-Level / HR PMS / Auditor / Management via the same `openReviewSheet`. Single fix handles all 5.
- `src/components/review/AuditScorecard.tsx` (legacy, lines 401–467) — apply the same `hydrateReviewerDraft` rule (it already uses `auditor_achieved_value` correctly but still runs the dangerous auto-recalc through `AchievedValueScoreInput`).
- `src/components/review/SelfReviewSheet.tsx` — confirm self_achieved_value hydration uses `self_achieved_value`, not `achieved_value` from a non-existent prior cycle.
- `src/components/admin/AdminDataEntryDialog.tsx` & `AdminDailyEntryDialog.tsx` — verify admin-on-behalf draft hydration follows the same rule for whichever stage they are populating.

### Step 5 — Tests (regression-protection bundle)

New file: `src/test/unifiedScorecardHydration.test.ts`

Mock data factories: `generateMockKpi({ criteria, r0..r5, uom_type })`, `generateMockSubmission({ stage, achieved, score })`.

Matrix:

```
stages           = [self, manager, skip_level, hr_pms, auditor, management]
uom_types        = [numeric, binary, tiered]
criteria         = [Higher is Better, Lower is Better]
hydration_cases  = [
  reviewer-saved-draft   → picker shows reviewer's value + score verbatim
  no-reviewer-draft      → picker prefills from employee's achieved_value
  reviewer-score-only    → picker shows that score, achievedValue null
  reviewer-achieved-only → picker shows that achievedValue, score derived ONCE
]
```

Plus one explicit regression test for THIS bug:

```ts
it('BUG-XXX: auditor saved 103/0 Lower-is-Better → reopen still 103/0', () => {
  const kpi = generateMockKpi({ criteria: 'Lower is Better', r0: '>102', r1:'102', r2:'101', r3:'100', r4:'99', r5:'98', target_value: 98 });
  const sub = generateMockSubmission({ stage: 'auditor', achieved: 103, score: 0, employee_achieved: 99 });
  const bundle = hydrateReviewerDraft(sub, kpi, 'auditor', 'auditor');
  expect(bundle).toEqual({ source: 'reviewer-draft', achievedValue: 103, score: 0, remarks: expect.any(String), evidenceUrls: [] });
});
```

Update existing tests:

- `src/test/auditorDraftHydration.test.ts` — extend to numeric path.
- `src/lib/carriedScoreResolver.test.ts` — unaffected, but add a note: hydration vs cascading-fallback are two different concerns.

### Step 6 — Documentation & Policy

- `DOCUMENTATION.md` — add section "Reviewer Draft Hydration Invariant".
- `POLICY.md` §107 (new): *"When a reviewer reopens their own draft, the picker MUST display the reviewer's saved `*_achieved_value` and `*_score` verbatim. The picker MUST NOT recompute or overwrite either field from the employee's `achieved_value` or from threshold auto-calc. Threshold auto-calc only fires when the reviewer explicitly edits the achievedValue input."*
- `mem/features/review/reviewer-draft-hydration` (new memo): cross-stage canonical rule, the snapshot/guard pattern, and the `hydrateReviewerDraft` helper as SSOT.
- Update `mem/features/review/auditor-draft-qualitative-hydration` to reference the new numeric coverage.
- ADR-084: "Reviewer Draft Hydration & AchievedValueScoreInput auto-recalc guard."

### Step 7 — Diagnostic console logs (one release, behind a feature flag)

Add `console.debug('[hydrateReviewerDraft]', { kpiId, stage, source, achievedValue, score })` gated behind `import.meta.env.VITE_DEBUG_HYDRATION` (off in prod by default). Remove after one release.

---

## Files changed (estimate)

- `src/components/review/UnifiedScorecard.tsx` (memoize kpiIds; extract + call `hydrateReviewerDraft`; ref-guard)
- `src/components/review/AchievedValueScoreInput.tsx` (guard auto-recalc effect)
- `src/components/review/AuditScorecard.tsx` (use same helper)
- `src/lib/reviewerDraftHydration.ts` (new — pure helper, SSOT)
- `src/test/unifiedScorecardHydration.test.ts` (new — full matrix)
- `src/test/auditorDraftHydration.test.ts` (extend)
- `DOCUMENTATION.md`, `POLICY.md`, `mem/features/review/reviewer-draft-hydration`, `docs/adr/ADR-084.md`

## Rollback strategy

Pure-frontend change. To revert: drop the helper and restore the inline hydration block in `openReviewSheet` plus the original `AchievedValueScoreInput` effect. No schema or RPC changes. No data migration. Zero risk to persisted data.

## Out of scope (explicitly NOT changed)

- No changes to `review_submissions` schema.
- No changes to save-path mutations (`submitReview` / `executeAuditSubmit`) — they already persist the correct values; the bug is on the read/hydrate side only.
- No changes to `KpiJourneySection` (already correct).
- No changes to scoring/cascading logic (`carriedScoreResolver`, `ratingCalculation`).

Awaiting approval to implement.
