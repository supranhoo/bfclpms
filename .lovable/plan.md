

## Root Cause: KPI Marked as N/A by Admin — Final Score is NULL by Design

### Investigation Findings

This KPI (`f457fd99`) belongs to **Dippendu Das (101773)**, February 2026. The database shows:

| Field | Value |
|-------|-------|
| `is_na` | `true` |
| `na_marked_by_role` | `admin` |
| `self_score` | 5 |
| `auditor_score` | 0 |
| `management_score` | 0 |
| `final_score` | **NULL** |
| `final_rating` | **NULL** |
| `status` | `approved` |
| `auto_advance_reason` | "Scored by Admin on behalf of management" |

**What happened:** An admin marked this KPI as **N/A** during management data entry on March 31. Per policy (ADR-048 / weighted-score-calculation-logic), when a KPI is marked N/A and approved, `final_score` and `final_rating` are explicitly set to NULL so it is **excluded from weighted average calculations**.

The Self=5, Auditor=0, Mgmt=0 scores are residual values from before the N/A flag was applied — they were not cleared.

### The Real Problem (UX)

The Final column shows "—" (a dash) for N/A KPIs, which looks identical to "not yet scored" KPIs. Users cannot distinguish between "N/A — excluded from scoring" and "stuck — no final score computed." The table doesn't surface the N/A status in the score columns at all.

### Fix — 2 changes in `src/components/review/KpiDetailsTable.tsx`

1. **Final column: Show "N/A" badge instead of "—"** when `submission.is_na === true` and status is `approved`
2. **Score columns: Dim/grey-out scores for N/A KPIs** — show the residual scores but with a visual indicator (e.g., strikethrough or muted text) so users understand these scores are not counted

### Technical Detail

In `getScoreForColumn` (line 137-139):
```typescript
case 'final_score':
  // If N/A, return a sentinel or handle in renderer
  if (submission.is_na) return 'N/A'; // handled specially in cell renderer
  return kpiStatus === 'approved' ? (submission.final_score ?? null) : null;
```

In the cell renderer for score columns, check `submission.is_na` and render scores with `line-through text-muted-foreground` styling + an "N/A" badge in the Final column.

### Additional: Data Integrity Question

If this KPI was **not** supposed to be N/A (admin error), the fix is a data correction — not a code change. The admin can use the existing Admin KPI Editor to unmark N/A and re-approve. The plan above addresses the UX confusion regardless.

### Files Modified

| File | Change |
|------|--------|
| `src/components/review/KpiDetailsTable.tsx` | Show "N/A" in Final column for N/A KPIs; dim residual scores |
| `DOCUMENTATION.md` | Version bump |

