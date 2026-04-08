

## RCA: Employee 100360 — HR PMS "Re-review" Badge + Inflated Weighted Score

### Issue 1: HR PMS column shows "Re-review" when it should show nothing (or "Pending")

**Root Cause**: The "Re-review" badge logic in `KpiDetailsTable.tsx` (line 587):

```typescript
const showReReview = score === null && isAtCurrentStage && !showNA && col.key !== 'self_score';
```

This triggers whenever a KPI is **at** a stage and the score for that stage is null. For employee 100360's March KPIs, status = `hr_pms_review` and `hr_pms_score = NULL`. So the condition fires: `null === null ✓`, `'hr_pms_review' === 'hr_pms_review' ✓` → shows "Re-review".

**The problem**: This badge was designed for **rollback scenarios** (a reviewer's score was cleared after a rollback). But it fires identically for KPIs that are simply **waiting** for their first HR PMS review. There's no way to distinguish "rolled back, needs re-review" from "never reviewed at this stage yet".

**Fix**: Add a rollback detection check. Show "Re-review" only if the `kpi_audit_logs` contain a rollback/status-step-back event for this KPI at this stage. Otherwise, the null score simply means the stage is pending — show a dash `—` (the default).

However, querying audit logs per-cell would be expensive. A simpler approach: check if any **downstream** stage has a non-null score. If skip-level already scored (it has), and HR PMS hasn't, this is a normal forward progression, not a rollback. A rollback would clear downstream scores too (per the cascade-clear invariant in POLICY §33).

**Simplest correct fix**: `showReReview` should additionally require that the stage was **previously completed** — i.e., at least one score existed before being cleared. We can detect this by checking if any stage AFTER the current one has a score (impossible in normal flow if current stage hasn't been scored yet) OR by checking if the KPI has been at a later status before. The cleanest approach: only show "Re-review" if a **later** stage in the workflow already has a score, which would indicate the KPI was sent back.

For this case: status = `hr_pms_review`, `hr_pms_score = NULL`, but no later stage (auditor, management) has a score → normal pending → show `—`.

### Issue 2: Weighted Score shows 450/450 (100%) but should be lower

**Root Cause**: When `viewLevel = 'self'` (employee viewing their own dashboard), `getRelevantScore` returns `submission.self_score ?? 0`, which is 5.0 for all 8 submitted KPIs.

The employee self-scored all KPIs as 5, but skip-level has given lower scores (0, 2, 3, 5 mix). The dashboard ignores all reviewer scores and shows only the self-assessment — making it appear as 100% when actual performance (per reviewer scores) is significantly lower.

**Fix**: For the employee's own dashboard (`viewLevel = 'self'`), `getRelevantScore` should use the **most advanced available score** in the fallback chain rather than only the self-score. This aligns with the 8-stage fallback chain (Final → Management → Auditor → HR PMS → Skip-Level → Manager → Self).

Updated logic for `viewLevel === 'self'`:
```typescript
if (viewLevel === 'self') {
  return submission.hr_pms_score 
    ?? submission.skip_level_score 
    ?? submission.manager_score 
    ?? submission.self_score 
    ?? 0;
}
```

This way, the employee sees the most current assessment of their performance, not just their own self-rating.

### Files to Change

| File | Change |
|------|--------|
| `src/components/review/KpiDetailsTable.tsx` | Fix `showReReview` to only trigger when a later workflow stage has a score (evidence of rollback) |
| `src/components/review/UnifiedScorecard.tsx` | Update `getRelevantScore` for `viewLevel='self'` to use full fallback chain |
| `DOCUMENTATION.md` | Version bump |

### Risk Assessment
- **Data Impact**: None — display-only changes
- **Workflow Impact**: None — no status transitions affected
- **Regression Risk**: Low — Re-review fix is additive condition; score fallback change aligns with existing 8-stage chain convention
- **UI Impact**: Employee dashboards will show more accurate (likely lower) scores reflecting reviewer assessments rather than inflated self-scores. This is the correct behavior.

