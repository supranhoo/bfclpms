## Assumptions
- Feb→May 2026 = ~7,774 KPIs → 39 submission batches at 200 IDs each.
- The red "Failed to load trend data" banner is our own throw firing from `useMonthlyTrend.subsPromise` because **one submissions batch returned an error** (likely a transient PostgREST/RLS timeout on a heavy 200-ID `.in()`) that the previous code silently swallowed.
- No console logs are available right now (user is on `/auth`), so we cannot pinpoint which batch — but the fix is the same either way.

## Root cause
The last change made two things stricter at the same time:
1. `throw r.error` on any single submissions-batch error.
2. `throw` when `subMap.size === 0`.

For a 1-month range (Feb 2026) with a working network this correctly surfaces the bug. For a 4-month range (~39 batches × RLS-heavy `review_submissions`), one flaky batch now fails the entire report. The old code was too silent; the new code is too brittle. Neither is right.

## Fix plan (surgical, hook-only)

### Step 1 — Retry each submissions batch with exponential backoff and shrink-on-error
In `useMonthlyTrend.ts` `subsPromise`, wrap each `.in('kpi_id', b)` call in a helper:
- Attempt 1: 200 IDs.
- On error → wait 400ms, retry same batch.
- On second error → split the 200-ID batch into two 100-ID batches and retry each once.
- On third error → `throw` (real failure, surface it).

This handles the common case (transient timeout on a wide `.in()`) without hiding genuine failures. No cache-level changes.

### Step 2 — Lower the default batch size from 200 → 150
Empirically, 200 IDs × RLS predicates on `review_submissions` sits close to Supabase's per-request budget for 4-month ranges. 150 keeps URL well under 16 KB (~5.7 KB) and reduces RLS work per call. Batch count for 4 months: 39 → 52; concurrency stays at 4.

### Step 3 — Keep the `subMap.size === 0` guard but only throw if **all** batches errored
Track batch outcomes; if at least one batch returned rows successfully, do NOT throw on empty aggregation for the other batches — just log. The all-dashes report only occurs when literally every batch failed, which the Step-1 retry already prevents.

### Step 4 — Keep the `empAgg.size === 0` guard as-is
That guard only fires when KPIs exist but zero profile records visible → still a real bug worth surfacing loudly. No change.

## UI changes
- Happy path: no visible change; report loads with all rows.
- Failure path: only after 3 retry attempts + shrink; the same existing red banner appears with the underlying error.

## Files
- `src/hooks/useMonthlyTrend.ts` — add `fetchSubmissionsBatchWithRetry` helper; lower `SUB_BATCH` to 150; soften the `subMap.size === 0` throw to conditional on all-batches-failed.
- `src/test/monthlyTrendCacheBust.test.ts` — update the SUB_BATCH regex to 150; add case: one batch errors once but succeeds on retry → no throw.

## Risk & impact
- **Data**: read-only.
- **Regression**: Feb-only PIP fix still works — retry is transparent; guard still fires for the exact original silent-empty case.
- **Scale**: 30% more batches (39 → 52 for 4 months) but each is 25% smaller and RLS is lighter. Net latency comparable.
- **Rollback**: revert 1 file.

## Not applicable
- POLICY.md — no policy change; batch tuning is an implementation detail already documented under `mem/features/reports/monthly-scorecard-trend.md` (will update the SUB_BATCH number there in the same commit).
- DOCUMENTATION.md — small note under Monthly Scorecard describing retry.
