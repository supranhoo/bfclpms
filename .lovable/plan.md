

# Bulk Data Correction Plan: Corrupted Binary/Tiered KPI Scores

## Corruption Summary

| Category | Count | Description |
|---|---|---|
| **Binary KPIs, achieved=5, any score=0** | 85 distinct KPIs | Rating "5" stored as achieved value; score engine failed to reverse-map → score incorrectly stored as 0. **100% confirmed corruption.** |
| **Binary KPIs, achieved=0, self_score=0** | 49 KPIs | "0 incidents = good = R5" per scoring logic, but score stored as 0. **High confidence corruption** (confirmed by KPI descriptions: "Rating 5: 0 observations, Rating 0: any observation"). |
| **Tiered KPIs, score=0** | 12 KPIs | Similar reverse-mapping failure on tiered options. |
| **Total estimated** | ~100-140 distinct KPIs | Across ~870 binary + 31 tiered records |

### Score-Level Breakdown (Binary, achieved=5)

| Level | Corrupted Count |
|---|---|
| Self Score | 38 |
| Manager Score | 33 |
| Skip-Level | ~4 |
| HR PMS | ~5 |
| Auditor Score | 21 |
| Management Score | ~15 |
| Final Score | 18 |

Many KPIs have corruption at multiple levels simultaneously (e.g., self=0, auditor=0, final=0 while manager=5, hr_pms=5).

## Correction Strategy

### Phase 1: Safe Auto-Correction (achieved=5 → score should be 5)

These are unambiguous. The achieved value of `5` is the numeric rating itself (stored by the old binary input flow). Every score column that reads `0` for these records should be corrected to `5`.

**SQL correction (via edge function for audit trail):**

```sql
-- Fix self_score where achieved=5 but self_score=0
UPDATE review_submissions rs
SET self_score = 5, self_rating = 'blue', updated_at = now()
FROM kpis k
WHERE rs.kpi_id = k.id
  AND k.uom_type = 'binary'
  AND rs.achieved_value = 5
  AND rs.self_score = 0;

-- Repeat for manager_score, skip_level_score, hr_pms_score, 
-- auditor_score, management_score, final_score
```

### Phase 2: Conditional Correction (achieved=0 for "0 = good" KPIs)

For binary KPIs where "0 incidents/observations = Rating 5", the achieved value of `0` with score `0` is also corrupted. However, this requires confirming the KPI's intent.

**Approach**: Since all identified KPIs with achieved=0 and score=0 follow the "0 = good" pattern (safety norms, audit observations, compliance), correct these with the same logic: score should be `5`.

**Safeguard**: Only correct score columns that are `0` when a later reviewer already scored it as `5` (proving the correct value). For approved KPIs where final_score=0 but some reviewer gave 5, the final_score is clearly wrong.

### Phase 3: Tiered KPI Correction

For 12 tiered KPIs, recalculate scores based on `qualitative_options` and `achieved_value` using the same reverse-mapping logic now in `calculateRating`.

## Implementation Plan

### 1. Create a Correction Edge Function

Build `supabase/functions/fix-corrupted-binary-scores/index.ts` that:
- Queries all affected records
- Applies the correction logic
- Logs every change to `kpi_audit_logs` for full traceability
- Returns a summary report of changes made
- Supports a `dry_run` parameter to preview changes before committing

### 2. Add Admin UI Trigger

Add a button in the Admin Dashboard (or System Settings) to invoke the correction with dry-run preview, showing affected employees and KPIs before applying.

### 3. Recalculate Final Scores

For approved KPIs where `final_score` was corrupted, recalculate using the workflow's final stage score (the last non-null reviewer score in the workflow).

## Risk Assessment

- **Data Impact**: Corrects ~100+ records. All changes logged to audit trail.
- **Regression Risk**: Low. The scoring engine fix is already deployed, so new reviews will calculate correctly. This only fixes historical data.
- **Rollback**: Audit log entries capture old values, enabling manual rollback if needed.
- **False Positives**: Phase 1 (achieved=5) has zero false positive risk. Phase 2 (achieved=0) has minimal risk given all identified KPIs follow "0 = good" scoring.

## Files to Create/Modify

1. **New**: `supabase/functions/fix-corrupted-binary-scores/index.ts` - Edge function for bulk correction
2. **Modify**: Admin SystemSettings or AdminDashboard page - Add "Fix Corrupted Scores" action button with dry-run preview

