## Goal
The Auditor (Ayush) sees Self / Manager / Auditor as "N/A" inside the Audit Review sheet, while Admin's "View KPI Details" shows the real scores (Self=5, Manager=5) for the same KPI / employee / period. Make the auditor always see what is actually in `review_submissions`, regardless of how recently the KPI moved to the audit stage.

## RCA (what the database and RLS already prove)

For the reported case (Jyoti Prakash Dwivedi · Environment Compliance · April 2026):

- `kpis.id = 468b853f…`, `status = 'audit'`, `is_org_level = true`, `weightage = 2`.
- `review_submissions` row exists (`07568aa7…`) with `self_score = 5`, `manager_score = 5`, `auditor_score = NULL`, `is_na = false`, `updated_at = 2026-06-11 11:21:11`.
- RLS on `review_submissions` includes `"Admins and auditors can view all submissions"` (qual: `has_role(auth.uid(), 'auditor')`). RLS on `kpis` allows any auditor via `can_view_kpi_row()`.

So the data is there and Ayush is allowed to read it. The N/A in the journey tiles can only come from the client passing `submission = null` to `KpiJourneySection`. Three contributing client-side issues were found:

1. **Stale `useReviewSubmissions` snapshot.** `AuditScorecard` calls `useReviewSubmissions(kpiIds)` with `queryKey: ['review-submissions', kpiIds]`. When a KPI is just promoted to `audit` and the auditor opens the sheet, React Query may still serve the previous snapshot (which did not include the row keyed by the new `kpi_id`), so `submissionMap.get(selectedKpi.id)` returns `undefined` and the panel renders all stages as N/A. There is no realtime invalidation on `review_submissions` from `AuditScorecard`.
2. **Indistinguishable "no submission" vs "loading" in `KpiJourneySection`.** When `submission` is `null/undefined` the section unconditionally renders `null` scores → "N/A" tiles, even while the submissions query is still in flight. So a transient loading state looks identical to "really no data".
3. **`submissionMap` is built only from the current-period `submissions`** (the 150-line block), but the journey panel is also opened from places that already have `allSubmissions` cached. There is no fallback to `allSubmissions.find(s => s.kpi_id === selectedKpi.id)` when the current-period query is empty/stale.

## Fix plan

Surgical, frontend-only. No schema or RLS changes — the DB and policies are correct.

### 1. Force a fresh fetch of submissions when the audit sheet is opened
`src/components/review/AuditScorecard.tsx`

- On the `setReviewSheetOpen(true)` path (and on initial mount of the sheet for `selectedKpi`), invalidate the `['review-submissions', kpiIds]` and `['kpis', employee.id]` query keys so the panel always reads the current row.
- Also fire `queryClient.invalidateQueries({ queryKey: ['review-submissions'] })` after any `transition`-style mutation that already exists in the file (these already happen on auditor actions — we just need to add an explicit refetch when the sheet opens, not only after mutations).

### 2. Fallback lookup in the sheet
Same file, around line 877:

```ts
const liveSubmission =
  submissionMap.get(selectedKpi.id) ??
  allSubmissions?.find(s => s.kpi_id === selectedKpi.id) ??
  null;
```

Pass `liveSubmission` to `<KpiReviewPanel submission={liveSubmission} />`. `allSubmissions` is already fetched (line 163) across all periods, so this gives us a second, broader source of truth at zero extra request cost.

### 3. Differentiate "loading" from "no data" in the journey tiles
`src/components/review/KpiJourneySection.tsx`

- Accept an optional `isLoading?: boolean` prop (default `false`) and, when true, render a `Skeleton` block for each stage tile instead of the "N/A" pill. Wire it from `KpiReviewPanel` → `AuditScorecard` (`useReviewSubmissions(...).isLoading`). This prevents the auditor from ever seeing a misleading "N/A" while data is still arriving.

### 4. Subscribe the audit sheet to realtime `review_submissions` updates for the open KPI
`AuditScorecard.tsx` — when the sheet is open, attach a Supabase channel filtered to `kpi_id = selectedKpi.id`. On any insert/update, call `queryClient.setQueryData(['review-submissions', kpiIds], ...)` (or just invalidate). This guarantees that if a manager just submitted seconds before the auditor opened the sheet, the auditor still sees it.

## UI changes

- **Where:** Audit Review sheet → Review Journey card (right column).
- **Behaviour change:**
  - While submissions are loading → 3 stage tiles render as 40 px Skeleton bars instead of `N/A` pills.
  - Once loaded with a real row → `Self: 5`, `Manager: 5`, `Auditor: -` exactly like admin's view.
  - No layout, color, or token changes. No new controls.
- **Responsiveness:** Skeletons inherit the existing tile grid; `grid-cols-2 lg:grid-cols-3` is unchanged.

## Risk & impact

- **Data impact:** Read-only client change. No writes. No schema or RLS change.
- **Workflow impact:** None — auditor permissions, transitions, and the existing N/A flow are untouched.
- **UI/UX impact:** Skeletons replace momentary "N/A" flashes for ~150–300 ms during the initial fetch. Everyone benefits, not only auditors.
- **Regression risk:** Low. `liveSubmission` fallback is additive; the existing primary lookup is tried first. Realtime channel is scoped to the open sheet and torn down on close.
- **Mitigation:** Unit tests below cover the loading→loaded transition and the `allSubmissions` fallback path.

## Tests (mandatory)

- `src/test/auditScorecardSubmissionFallback.test.ts` (new)
  1. `submissionMap` empty + `allSubmissions` has a matching row → panel receives the real submission (not `null`).
  2. `submissionMap` has the row → it wins over `allSubmissions`.
  3. Both empty → `null` (true N/A case preserved).
- `src/test/kpiJourneySectionLoadingState.test.tsx` (new)
  1. `isLoading=true` + `submission=null` → renders Skeletons, not "N/A" pills.
  2. `isLoading=false` + `submission=null` → renders existing "N/A" pills (current behaviour preserved).
  3. `isLoading=false` + `submission={ self_score:5, manager_score:5 }` → renders `5` and `5`.

Mock data uses the existing `ReviewSubmission` shape with realistic fields (id, kpi_id, self_score, manager_score, updated_at, is_na, evidence arrays empty).

## DOCUMENTATION.md / POLICY.md sync

- Add a short note under "Review Journey rendering" describing the loading-vs-empty contract for `KpiJourneySection`.
- Add a one-line entry in the auditor section of POLICY clarifying: *"The auditor's Review Journey tiles must reflect `review_submissions` as-of sheet open; stale snapshots are not acceptable."*

## Out of scope (explicitly)

- RLS changes on `review_submissions` or `kpis` — already correct.
- Any change to admin's `View KPI Details` modal — it already renders correctly.
- KPI Standardization / canonical-rename flow — not the cause here; the same `kpi.id` is used by both views.

## Verification steps after build

1. Log in as Ayush (auditor), open Jyoti Prakash Dwivedi → April 2026 → Environment Compliance → "Audit Review".
2. Expect: `Self: 5`, `Manager: 5`, `Auditor: -` (current stage), `is_na = false`.
3. Re-open immediately after a manager submits a different KPI in another tab → no stale N/A flash.
4. Run the two new test files; both pass.
