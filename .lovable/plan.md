

## RCA: Score Mismatch Between Employee Grid and Scorecard (Satyam & Dippendu)

### Root Cause

Two separate scoring functions use different handling for KPIs that have a `review_submissions` row but **all score fields are NULL** (empty submissions created by the `trg_sync_submission_on_kra_set` trigger).

| Component | Function | Behavior for all-null submissions |
|-----------|----------|----------------------------------|
| Employee Grid (`EmployeeSelectorGrid`) | `useEmployeeScoresForPeriod.getBestScore()` | Returns `null` → KPI **excluded** from weighted average |
| Scorecard Detail (`UnifiedScorecard`) | `getRelevantScore()` | Returns `0` (final fallback `?? 0`) → KPI **included** with score=0, deflating the average |

**Impact for Satyam (100017, Feb 2026):**
- Grid: 19 KPIs, weight=80, score=**3.9**
- Scorecard: 21 KPIs, weight=92, score=**3.4** (2 extra `kra_set` KPIs with empty submissions counted as 0)

**Dippendu (101773, Feb 2026):**
- Grid: 19 KPIs, weight=80, score=**3.9**
- Scorecard: 20 KPIs, weight=85, score=**3.7** (1 extra empty submission)

**System-wide**: 72 KPIs across 2026 have empty submission rows at `kra_set` status that would cause this deflation in any scorecard view.

### The Correct Behavior

Per Policy (weighted score exclusion rules and the 8-stage fallback chain): a KPI with no scores at any level should be **excluded** from the weighted average — identical to how N/A KPIs are treated. The grid hook (`getBestScore`) already implements this correctly. The scorecard's `getRelevantScore` has the bug.

### Fix

**Single change in `UnifiedScorecard.tsx`**: Make `getRelevantScore` return `null` instead of `0` when all scores are null, and update the scoring loop to skip null-scored KPIs (matching the grid hook's behavior).

```text
Before:  return submission.management_score ?? ... ?? submission.self_score ?? 0;
After:   return submission.management_score ?? ... ?? submission.self_score ?? null;

Scoring loop: if (score === null) skip (don't add to weighted sum or total weight)
```

### Files to Change

| File | Change |
|------|--------|
| `src/components/review/UnifiedScorecard.tsx` | Change `getRelevantScore` fallback from `?? 0` to `?? null`; update scoring loop to skip null scores |
| `DOCUMENTATION.md` | Document the fix and scoring alignment; version bump |
| `POLICY.md` | Clarify that KPIs with no scores at any level are excluded from weighted averages (same as N/A) |

### Risk Assessment
- **Data Impact**: None — display-only change. No database modifications.
- **Workflow Impact**: None — no status transitions affected.
- **Regression Risk**: Low — aligns scorecard with the already-correct grid hook logic. All other consumers (`useEmployeeScoresForPeriod`, `PreviousMonthsScoreMini`, Management Dashboard) already use the `null`-exclusion pattern.
- **UI Impact**: Scorecard scores will increase for employees who have unscored KPIs with empty submission rows, matching what the grid already shows. This is the correct behavior — unscored KPIs should not deflate averages.

