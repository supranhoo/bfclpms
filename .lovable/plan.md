

# Fix: Show "N/A" for Completed Stages That Submitted Without a Score

## Problem

When an employee marks a KPI as N/A during self-review and a reviewer later overrides it (e.g., manager gives a score of 5), the global `is_na` flag flips to `false`. This causes:

- **KPI Table**: Self column shows "--" (dash) instead of "N/A"
- **Review Journey**: Self stage shows "Not Set" instead of "N/A"

The user expects: if a reviewer at any level submitted N/A (no score), that level should always display "N/A" -- even after a later reviewer overrides the global flag.

## Root Cause

Both the table and journey only check the global `is_na` flag. Once a downstream reviewer overrides N/A (sets `is_na = false`), every stage loses its N/A indication -- even stages that genuinely submitted without a score.

## Data Evidence (Employee 200679, January 2026)

| KPI | is_na | self_score | manager_score | skip_level_score | Status |
|-----|-------|------------|---------------|------------------|--------|
| HRMS | false (overridden) | null | 5 | 5 | skip_level_check |
| CLMS | false (overridden) | null | null | 5 | skip_level_check |

Both KPIs were originally N/A from self-review, then overridden by downstream reviewers. Self column should show "N/A", not "--".

## Solution

### 1. KPI Table -- Show "N/A" for completed stages with no score (`KpiDetailsTable.tsx`)

Add a reverse mapping from column key to workflow stage. For each score column, determine if the KPI's current status has progressed past that column's stage. If yes and score is null, show "N/A" instead of "--".

**Logic:**
```
Column key -> stage name (e.g., 'self_score' -> 'self_review')
If KPI status index > stage index (stage is completed) AND score is null:
   Show "N/A" badge
Else:
   Show score or "--"
```

This means:
- Self column: status is `skip_level_check` (past `self_review`), self_score=null -> shows "N/A"
- Manager column: status is `skip_level_check` (past `manager_check`), manager_score=null -> shows "N/A"  
- Manager column: manager_score=5 -> shows "5" (score visible even if override happened)

### 2. Review Journey -- Show "N/A" for completed stages with no score (`ReviewStageCard.tsx`)

Change the "Not Set" label (line 108) to "N/A" for completed stages. A completed stage that has no score means the reviewer at that stage submitted N/A.

**Before:** `{isPending ? 'Pending' : 'Not Set'}`  
**After:** `{isPending ? 'Pending' : 'N/A'}`

This single change handles all cases:
- Completed + no score = "N/A" (correct -- reviewer said N/A)
- Pending + no score = "Pending" (correct -- hasn't been reviewed yet)
- Has score = shows the score badge (unchanged)

### 3. Documentation update

Update DOCUMENTATION.md to version 1.33.2 reflecting the implicit N/A display for completed stages.

## Files Changed

| File | Change |
|---|---|
| `src/components/review/KpiDetailsTable.tsx` | Add column-to-stage mapping; show "N/A" for completed stages with null scores |
| `src/components/review/ReviewStageCard.tsx` | Change "Not Set" to "N/A" for non-pending stages |
| `DOCUMENTATION.md` | Update version and N/A display documentation |

## Expected Result

**KPI Table (image-99 scenario):**
- Self: "N/A" (completed stage, no score)
- Manager: "N/A" for CLMS (no score), "5" for HRMS (has score)
- Skip-Level: "5" (has score)

**Review Journey (image-100 scenario):**
- Self: "N/A" badge instead of "Not Set"
- Manager: Rating 5 badge (unchanged -- has score)
- Skip-Level: Rating 5 badge (unchanged -- has score)
- HR PMS: "Pending" (unchanged -- not yet reached)

## Risk

- Minimal -- affects only display logic, no database changes
- Any completed stage without a score was necessarily an N/A submission, so "N/A" is always the correct label

