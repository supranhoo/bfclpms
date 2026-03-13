
# Fix: KPI Journey Section Showing Wrong Scores — IMPLEMENTED ✅

## Root Cause
`KpiJourneySection.tsx` prioritized recalculated scores (`recalc?.score ?? storedScore`) over deliberately stored reviewer scores. For binary KPIs where a reviewer intentionally gave 0, the recalculation from an inherited achieved value overrode it to 5.

## Changes Made

### 1. `KpiJourneySection.tsx` — Display priority fix
- Changed `score: recalc?.score ?? storedScore` → `score: storedScore ?? recalc?.score`
- Changed `rating: recalc?.rating ?? storedRating` → `rating: storedRating ?? recalc?.rating`
- Stored reviewer scores now take precedence; recalculation only fills in when no stored score exists

### 2. `ManagementScorecard.tsx` — Removed cross-stage fallback
- Changed `management_achieved_value ?? auditor_achieved_value ?? achieved_value` → `management_achieved_value` only
- Prevents stale self-review values from being inherited into management stage

### 3. `AuditScorecard.tsx` — Removed cross-stage fallback
- Changed `auditor_achieved_value ?? manager_achieved_value ?? achieved_value` → `auditor_achieved_value` only
- Prevents stale previous-stage values from being inherited into audit stage

## Impact
- Zero changes to scoring rules, thresholds, or KPI logic
- Zero changes to the final_score fallback chain
- Display-only fix for Journey panel + pre-fill fix for review sheets
