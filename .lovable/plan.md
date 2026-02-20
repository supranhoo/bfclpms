

# RCA: Approved KPIs Missing final_score — Root Cause and Fix Plan

## Root Cause

The bug is in `src/components/review/UnifiedScorecard.tsx` **lines 444-448**:

```ts
// For management, set final score
if (viewLevel === 'management') {
  updateData.final_rating = rating;
  updateData.final_score = score;
}
```

`final_score` and `final_rating` are **only populated when the reviewer is "management"**. However, in many workflow templates, the terminal reviewer (the last stage before `approved`) is NOT management — it can be HR PMS, Auditor, or even Skip-Level.

When HR PMS (or any non-management role) is the last stage and clicks "Approve", the code correctly sets `kpis.status = 'approved'` via `resolveForwardStatus()`, but **never writes `final_score`/`final_rating`** to the `review_submissions` row.

This same bug exists in **4 separate approval paths** within UnifiedScorecard:
1. Normal approval (line 444-448)
2. N/A forwarding (line 694)
3. N/A override approval (line 749-752)
4. N/A confirmation (line 804)

## Impact Assessment

| Period | Affected KPIs | Employees |
|---|---|---|
| January 2026 | 72 non-N/A KPIs | 8 employees (Jitendra Bharti, Abhiranjan, Aditya, Avinash, Debadutta, Dileshwar, Purnima, Randhir) |
| December 2025 | 7 non-N/A KPIs | 1 employee (Ashish Kataria — fast-tracked without scores) |
| **Total** | **79 KPIs** | **9 employees** |

All affected KPIs have `status = 'approved'` but `final_score = NULL`.

### Downstream Impact
Every report and dashboard that reads `final_score` shows blank/dash for these employees:
- Dashboard overall score chart
- Monthly Scorecard Report (UI + PDF)
- Performance Report rating distribution
- Employee Performance Summary
- KPI Detail Report
- KPI Tracker Modal trend chart

## Fix Plan (2 files + data repair)

### 1. Fix: `src/components/review/UnifiedScorecard.tsx`

Replace the management-only check with a dynamic check: **if the forward status is `approved`, set `final_score`/`final_rating`** from the current reviewer's score.

All 4 approval paths need the same fix. Change:

```ts
if (viewLevel === 'management') {
  updateData.final_rating = rating;
  updateData.final_score = score;
}
```

To:

```ts
// When this approval moves KPI to 'approved', sync final score
// regardless of which role is the terminal reviewer
if (approve && config.forwardStatus === 'approved') {
  updateData.final_rating = rating;
  updateData.final_score = score;
}
```

Apply the same pattern to the N/A forwarding path, N/A override path, and N/A confirmation path.

### 2. Data Repair: Backfill 79 affected KPIs

Run a one-time SQL update to populate `final_score`/`final_rating` for the 79 already-approved KPIs using the authoritative fallback chain:

```sql
UPDATE review_submissions rs
SET 
  final_score = COALESCE(
    rs.management_score, rs.auditor_score, 
    rs.hr_pms_score, rs.skip_level_score, 
    rs.manager_score, rs.self_score
  ),
  final_rating = COALESCE(
    rs.management_rating, rs.auditor_rating,
    rs.hr_pms_rating, rs.skip_level_rating,
    rs.manager_rating, rs.self_rating
  )
FROM kpis k
WHERE rs.kpi_id = k.id
  AND k.status = 'approved'
  AND rs.final_score IS NULL
  AND rs.is_na IS NOT TRUE;
```

### 3. Update: `DOCUMENTATION.md`

- Version bump to 1.45.37
- Document: terminal-reviewer final_score sync fix

## What Will NOT Change

- `ManagementScorecard.tsx` — already correctly sets `final_score` (hardcoded management is always terminal there)
- `useAdminDataEntry.ts` — already handles final_score sync on approved (lines 239-252)
- Fast Track hook — already handles final_score correctly
- No report code changes needed — once `final_score` is populated, all reports will show correct data automatically

## Expected Outcome

| Element | Before (Bug) | After (Fix) |
|---|---|---|
| Jitendra Bharti Jan dashboard | Blank score | Shows weighted 4.50 / 5.00 |
| 72 January approved KPIs | final_score = NULL | final_score = last reviewer's score |
| 7 December approved KPIs | final_score = NULL | final_score = last reviewer's score |
| Future HR PMS terminal approvals | final_score not set | final_score auto-set on approve |

