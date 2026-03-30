

## Fix: Final Score Not Updating on Already-Approved KPIs

### Root Cause (Confirmed)

**File: `src/hooks/useAdminDataEntry.ts` line 311**

```typescript
const shouldRecomputeFinal = newStatus === 'approved' || (advance_status !== false && newSubmission && !newStatus);
```

When the KPI is already approved:
- Line 199-201: `newStatus` is set to `null` (correctly — no status change needed)
- Line 311: The recompute condition requires `advance_status !== false`
- But `advance_status` is **irrelevant** for already-approved KPIs — its purpose is to control workflow advancement, not final score sync
- If the admin dialog has `advanceStatus` toggled off (or defaults to off for certain roles), the recompute is skipped entirely

### Fix (Surgical, 1 line)

**File: `src/hooks/useAdminDataEntry.ts` — line 311**

Replace the condition with one that explicitly handles the already-approved case independently of `advance_status`:

```typescript
// Before:
const shouldRecomputeFinal = newStatus === 'approved' || (advance_status !== false && newSubmission && !newStatus);

// After:
const kpiWasAlreadyApproved = !newStatus && currentKpiStatus === 'approved';
const shouldRecomputeFinal = newStatus === 'approved' || (kpiWasAlreadyApproved && newSubmission);
```

This requires hoisting `currentKpiStatus` so it's accessible at line 311. Currently it's scoped inside the `if (advance_status !== false)` block (line 198). We extract it to the outer scope before that block.

### Exact Changes

**`src/hooks/useAdminDataEntry.ts`:**

1. **Before the `advance_status` gate (line ~170):** Fetch the KPI's current status unconditionally for non-self roles, store as `currentKpiStatus` in outer scope
2. **Line 311:** Replace condition with `newStatus === 'approved' || (currentKpiStatus === 'approved' && newSubmission)`
3. Remove the `advance_status !== false` gate from the recompute — it has no business being there

### Why This Has Zero Regression Risk

- **Normal forward flow** (`newStatus === 'approved'`): Unchanged — still triggers recompute
- **Already-approved edits**: Now always recomputes, regardless of advance toggle — correct behavior
- **Non-approved KPIs with advance off**: `currentKpiStatus !== 'approved'` and `newStatus !== 'approved'` → recompute skipped → correct (no final score to sync yet)
- **N/A KPIs**: `is_na` path clears all scores including `final_score` before upsert; recompute finds all nulls → no patch → correct

### Impact Coverage

| Surface | Impact |
|---------|--------|
| Dashboard score tiles | Correct — reads `final_score` which is now patched |
| Previous month tiles | Correct — same query path |
| KPI Details panel | Correct — reads same `review_submissions` |
| Reports (Performance, Scorecard, etc.) | Correct — all read `final_score` |
| Weighted average calculations | Correct — uses `final_score` |
| Audit logs | No change — already logged correctly |
| Non-approved KPIs | No change — recompute only fires for `approved` status |

### Data Repair

Use the insert tool (not migration) to fix existing stale records:

```sql
UPDATE review_submissions rs
SET final_score = rs.management_score,
    final_rating = rs.management_rating
FROM kpis k
WHERE rs.kpi_id = k.id
  AND k.status = 'approved'
  AND rs.management_score IS NOT NULL
  AND (rs.final_score IS NULL OR rs.final_score != rs.management_score)
  AND k.review_year >= 2026;
```

### Files Modified

| File | Change |
|------|--------|
| `src/hooks/useAdminDataEntry.ts` | Hoist `currentKpiStatus`; fix recompute condition |
| `DOCUMENTATION.md` | v2.15.6 changelog |
| `POLICY.md` | Clarify §34: recompute is independent of advance_status toggle |
| DB data repair | Fix existing stale final_scores via insert tool |

