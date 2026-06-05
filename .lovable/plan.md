# Fix: iPhone /dashboard crash for auditor001 (Shekhar Sharad)

## 1. Assumptions
- Diagnostic telemetry (last turn) captured the real crash. Reported error is the iOS-only `history.replaceState()` 100/10s throttle.
- The throttle is triggered by our own URL-writes (filters, viewMode, selectedEmployee, deep-link cleanups) inside `Dashboard.tsx` + `EmployeeSelectorGrid.tsx`. Android Chromium has no such cap, which matches "works on Android, crashes on iPhone/iPod".
- No backend / RLS / scoring / Menu Setting / workflow change is needed. Fix is purely client-side hardening of the URL-state hook layer.
- Behaviour goal: identical UX — filters/viewMode/employee still persist to URL on refresh — just stop emitting redundant or hot-loop writes.

## 2. Risk & Impact Report
- **Data Impact:** none (no DB/RLS touched).
- **Workflow Impact:** none — scoring, queries, observations, audit, evidence untouched.
- **UI/UX Impact:** URL still updates with filter/employee/view; just coalesced to one write per microtask and skipped when value is unchanged. User-visible behaviour identical.
- **Regression Risk (low):** Two narrow surfaces — `useUrlFilterState[/Nullable]` setter, and Dashboard mentioned-kpi cleanup effect dep array. Both have unit-testable contracts.
- **Scalability:** strictly reduces write pressure. No new state, no new subscriptions.
- **Browsers:** Fix is Safari-driven but applies on all browsers (pure no-op guard + coalescer). Cannot make Chromium worse — fewer writes.

## 3. Root Cause (evidence-backed)
Captured stack points at `reportEmployeeFilter` chunk → `EmployeeSelectorGrid` rendered on `/dashboard`. Code review confirms:

1. `useUrlFilterState` (src/hooks/useUrlFilterState.ts) calls `setSearchParams((prev) => new URLSearchParams(prev), { replace: true })` even when the resulting URL is identical to the current one. React Router still triggers a real `history.replaceState`.
2. `Dashboard.tsx` has multiple URL-writing effects:
   - line 103 `useEffect(..., [searchParams])` — mentioned-kpi cleanup re-runs on every URL change.
   - line 244 — viewMode → URL sync (writes on every viewMode change, also on mount).
   - line 257 — selectedEmployee → URL sync.
   - line 293 `handleModeChange` — bulk filter clear.
   - Plus EmployeeSelectorGrid has 8+ `useUrlFilterState*` hooks (q, status, dept, desig, grade, mgr, auditor, emp_status, page, size).
3. Each filter change cascades: filter setter → URL write → `searchParams` identity change → re-render of every consumer of `useSearchParams` → effects depending on `[searchParams]` re-fire → some of those write URL again. On iOS this can push past 100 writes/10s during heavy typing+filter use, then Safari throws.

## 4. Step-by-step Plan (each step → verification)

### Step 1 — No-op guard in `useUrlFilterState` and `useUrlFilterStateNullable`
Before calling `setSearchParams`, read current value via `searchParams.get(paramName)`; if it equals the desired next value, **return without writing**. This single change eliminates the majority of redundant `replaceState` calls (every render-driven setter call that doesn't actually change the param).

**Verify:** unit test — calling setter with the same value N times produces exactly 0 setSearchParams calls; calling with new value produces 1.

### Step 2 — Microtask coalescer for URL writes
Add a small module-scoped queue in `useUrlFilterState.ts` (NOT exported): when any setter (including `useClearAllFilters`) wants to write, it pushes a `(prev) => next` mutator onto a queue and schedules a `queueMicrotask` flush. The flush composes all queued mutators into a single `setSearchParams` call. Multiple synchronous setter calls in the same tick → **one** `replaceState`.

**Verify:** unit test — invoking 5 different filter setters synchronously results in exactly 1 `setSearchParams` call carrying all 5 changes; URL ends in expected combined state.

### Step 3 — Narrow Dashboard `mentioned_kpi` cleanup effect dep
Change line 115 dep from `[searchParams]` to `[searchParams.get('mentioned_kpi'), searchParams.get('mentioned_employee')]`. The effect already only acts when those two are present; this stops it from re-running on every unrelated URL update. No behaviour change — same one-time cleanup.

**Verify:** manual — opening dashboard with `?mentioned_kpi=...&mentioned_employee=...` still strips the params and selects the KPI exactly once.

### Step 4 — iOS safety net (hard cap)
In the coalescer flush path only, count writes in a rolling 10s window. If the next flush would exceed 60 writes/10s (well below Safari's 100 cap), defer it to the next animation frame and merge any further writes that arrive in the meantime. This guarantees that any future unrelated regression can never trip the Safari throttle.

**Verify:** unit test — simulating 200 setter calls across 1s produces ≤ 60 actual `setSearchParams` calls and the final URL still reflects the last intent.

### Step 5 — Re-verify telemetry
Keep the existing `client_error_reports` table live. After publish, ask Shekhar to repro:
- expectation: zero new rows for `account_code = 'shekhar.sharad'` with the `history.replaceState` message.
- if any new crash arrives, the captured stack will name the next offender and a follow-up surgical fix can be scoped from real evidence.

## 5. UI Changes
**Not Applicable.** No visual change. URL still updates, filters/employee/view still persist on refresh, all dialogs/grids render the same.

## 6. Implementation (files touched)
- `src/hooks/useUrlFilterState.ts` — add no-op guard + microtask coalescer + 60/10s rate-limit safety net. Public API unchanged.
- `src/pages/Dashboard.tsx` — narrow one effect's dep array (lines 103-115 only). No other changes.
- `src/test/useUrlFilterState.test.ts` (new) — unit tests for guard, coalescer, rate-limit.
- `DOCUMENTATION.md` — add "URL filter state — write coalescer + iOS Safari throttle guard" subsection.
- `POLICY.md` — note that URL persistence MUST go through `useUrlFilterState*` / `useClearAllFilters` (already de-facto policy; codify it).
- `docs/adr/ADR-073.md` (new) — RCA + decision record for the iOS history.replaceState throttle hardening.

Explicitly NOT touched:
- `EmployeeSelectorGrid.tsx` — the recent backspace fix stays exactly as-is.
- `ErrorBoundary.tsx`, `reportClientError.ts`, `lastRpc.ts`, `DashboardLayout.tsx` — telemetry stays as deployed.
- Any RLS / workflow / scoring / Menu Setting / Custom Tabs / role / auditor-data code.
- `client_error_reports` table — keep live until RCA is closed (≥ 1 week of clean iOS sessions), then drop in a separate change.

## 7. Tests
- `useUrlFilterState.test.ts`:
  1. setter with identical value → 0 underlying writes
  2. setter with new value → 1 write, URL param updated
  3. nullable setter with `null` removes param; second call with `null` → 0 writes
  4. 5 synchronous setters across hooks → exactly 1 batched write
  5. `useClearAllFilters` clears all `FILTER_PARAM_NAMES` in 1 write
  6. 200 sequential setter calls within 1s → ≤ 60 actual writes; final URL matches last intent
- Existing Menu CAPA suite, ErrorBoundary tests, EmployeeSelectorGrid tests must remain green.

## 8. DOCUMENTATION.md updates
Add subsection under "Client URL state" describing: guard + microtask coalescer + 60/10s safety net, and that iOS Safari enforces a 100/10s `history.replaceState` cap which would otherwise crash `/dashboard`.

## 9. POLICY.md updates
Codify: all URL-persisted filter / view / selection state on dashboards MUST flow through `useUrlFilterState`, `useUrlFilterStateNullable`, or `useClearAllFilters`. Direct calls to `setSearchParams` or `window.history.replaceState` from feature code are prohibited.

## 10. Post-implementation notes
- Rollback: revert the two source files + delete the new test + ADR. No migration to undo.
- Telemetry table remains; re-query after publish + Shekhar repro. If clean for 7 days, schedule removal of `client_error_reports` in a dedicated change.
- Guardrails respected: no Menu Setting / Custom Tabs change, `menu_overrides_enabled=false` untouched, no RLS / scoring / role grants, no speculative refactors. Only evidence-driven surgical hardening.
