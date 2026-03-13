

# RCA: Biswajit's KPI Scoring + Systemic Issues

## Biswajit's Specific KPI

**KPI**: Logistics Cost Variance (Provision vs. Actual) — January 2026
**Config**: Achieved=110%, Criteria="Lower is Better", UOM=%, Thresholds: R5≤98%, R4≤99%, R3≤100%, R2≤101%, R1≤102%
**Result**: Score = 0 (because 110% > 102% — worst band)

The score of **0 is mathematically correct** per the configured thresholds. 110% cost variance means 10% over budget — the scoring logic correctly assigns 0 for anything above 102%. Management recognized this and marked the KPI as **N/A** with remarks: *"we will need to understand this KRA or change it."*

However, investigating this KPI exposed **two systemic bugs** affecting many employees.

---

## Bug 1: N/A KPIs Missing final_score (313 records)

**Impact**: 313 out of 4,068 approved KPIs have `final_score = NULL`. Every single one is an N/A-marked KPI.

**Root cause**: When a reviewer (management, auditor, etc.) marks a KPI as N/A and it transitions to "approved" status, the code does **not** sync `final_score` / `final_rating`. The memory spec says N/A should clear all scoring fields, but the approval path for N/A KPIs skips the final_score sync entirely.

**Fix**:
- In `UnifiedScorecard.tsx` and `AuditScorecard.tsx`: when submitting an N/A approval, explicitly set `final_score = null` and `final_rating = null` (or 0) in the same update
- Write a one-time data repair migration to set `final_score = NULL, final_rating = NULL` for all 313 existing approved N/A records (confirming they're intentionally excluded from calculations)

## Bug 2: Auditor Score Defaulting to 0 (30+ records)

**Impact**: ~30 approved non-NA KPIs have `final_score = 0` while `self_score > 0`. These span all UOM types (%, Number, Date, Amount).

**Root cause**: The old `AuditScorecard` component (line 387) initialized the auditor's achieved value as:
```
auditorAchieved = (existing as any)?.auditor_achieved_value ?? null;
```
It did **not** fall back to `existing?.achieved_value` (the self-review value). So when the auditor hadn't entered their own achieved value:
1. Recalculation was skipped (no achieved value to calculate from)
2. Score fell back to `manager_score` which was often null
3. Auditor clicked "Forward" with score=0 or null, saving `auditor_score = 0`
4. Approval synced this 0 to `final_score`

The current `UnifiedScorecard` (now used for all views) already has the correct fallback chain at line 755. The legacy `AuditScorecard` and `EmployeeScorecard` components are no longer used from the Dashboard but still exist.

**Fix**:
- **AuditScorecard.tsx** line 387: Add fallback → `?? existing?.achieved_value ?? null`
- **Data repair migration**: Recalculate `final_score` for the ~30 affected approved non-NA KPIs using the scoring engine logic, matching achieved_value against thresholds

---

## Plan Summary

| File / Action | Change |
|---|---|
| `src/components/review/AuditScorecard.tsx` | Fix achieved value fallback (line 387) to match UnifiedScorecard pattern |
| `src/components/review/UnifiedScorecard.tsx` | Ensure N/A approval path sets `final_score = null` explicitly |
| Database migration | Repair 313 N/A records (confirm NULL final_score) and recalculate ~30 non-NA records with wrong final_score=0 |

