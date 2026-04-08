

## SSOT Bug-Risk Analysis — Triage Results

After detailed code inspection of all 5 flagged issues, here is the assessment of what needs fixing vs. what's already addressed.

---

### Issue 1.1: Reconciliation vs. Multi-Month Independence — NO CODE FIX NEEDED

**Finding**: The report claims `reconcile_workflow_statuses` violates §54 by auto-advancing multi-month siblings. This is **incorrect** — the reconciler operates on individual KPIs based on their own workflow stages and scores. It does NOT perform cross-month sibling logic. The `percolate_multimonth_score` trigger (separate from the reconciler) already has the workflow-stage guard (added in the April 5 migration):
- Already-approved siblings: scores only
- Terminal-stage siblings: approve + copy
- Mid-workflow siblings: skip, log `PERCOLATION_DEFERRED`

**Verdict**: No conflict exists. Both functions are safe and guarded. Already documented in POLICY §54.

---

### Issue 1.2: Daily KPI Bypass vs. Period Hard-Lock — NO CODE FIX NEEDED

**Finding**: The `prevent_locked_period_updates` trigger (latest migration `20260314...`) has clear precedence:
1. Legacy hard-lock (`is_period_locked`) → blocks everyone except admins
2. Daily bypass → only applies to `kra_set → self_review` transition
3. Sent-back bypass → only applies to `kra_set → self_review` with prior submission
4. Governance check → standard permission check

The Daily bypass fires AFTER the hard-lock check. If a period is hard-locked, the admin-only gate (line 12) fires first. Daily KPIs are NOT exempt from hard locks — only from governance-level restrictions.

**Verdict**: No conflict. The code hierarchy is correct. Minor documentation gap — POLICY could explicitly state "Daily bypass applies only to governance restrictions, not hard locks."

---

### Issue 2.1: N/A Reversibility and Data Loss — DOCUMENTATION FIX ONLY

**Finding**: The report references §19 claiming N/A is "fully reversible." However, §19 does not exist in POLICY.md (search returned no results). The actual N/A implementation in `UnifiedScorecard.tsx` (lines 1005-1012) allows reviewers to override N/A by submitting a new score (`is_na: false, na_marked_by_role: null`), which works correctly. The `trg_sync_submission_on_kra_set` trigger (just updated to preserve self-data) is irrelevant here — N/A marking does NOT transition status to `kra_set`.

**Verdict**: N/A override works correctly in code. If "fully reversible" language exists anywhere, it's aspirational — the practical behavior (reviewer overrides N/A with a score) is functional and correct. No code fix needed.

---

### Issue 2.2: Daily Binary KPI Rating Double-Conversion — ALREADY FIXED

**Finding**: `SelfReviewSheet.tsx` (lines 414-427) explicitly handles this:
```typescript
if (isDailyWeekly && isMissedDaysPenalty) {
  finalRating = Math.min(5, Math.max(0, Math.round(effectiveScore)));
  selfRating = scoreToRatingLevel(finalRating);
} else {
  const result = calculateScoreFromAchieved(effectiveScore, selectedKpi);
  // ...
}
```
The `missed_days_penalty` result is treated as the final rating (0-5) and is NOT re-mapped through thresholds. This fix was already applied in v2.15.42.

**Verdict**: Already fixed. No regression risk detected.

---

### Issue 3.1: Percolation Logic — Documentation Not Updated — DOCUMENTATION FIX NEEDED ✓

**Finding**: DOCUMENTATION.md v2.15.43 still says the trigger "automatically syncs scores and status to all sibling records." The workflow-stage guard (3-way branch: approved/terminal/mid-workflow) added in the April 5 migration is NOT reflected in DOCUMENTATION.md, though it IS correctly documented in POLICY.md §54 and ADR-047.

**Fix needed**: Update DOCUMENTATION.md to reflect the workflow-stage guard and `PERCOLATION_DEFERRED` behavior.

---

### Issue 3.2: System Performer Attribution in Edge Functions — MINOR GAP ✓

**Finding**: The `fix-corrupted-binary-scores` edge function uses `performed_by: performedBy` where `performedBy = body.performed_by || "system"` — this sets performer to the string `"system"` instead of `NULL`. This violates §55 (system actions should use `performed_by = NULL`). The other edge functions (`auto-reconcile-workflow`, `restore-backup`, `propagate-template-change`) correctly use `user.id` for human-initiated actions, which is correct since those are admin-triggered.

**Fix needed**: Update `fix-corrupted-binary-scores` to use `NULL` instead of `"system"` string for automated performer attribution.

---

### Summary: Only 2 items need fixes

| # | Issue | Status | Fix Type |
|---|-------|--------|----------|
| 1.1 | Reconciler vs §54 | Already safe | None |
| 1.2 | Daily bypass vs hard-lock | Already correct | Documentation clarification in POLICY |
| 2.1 | N/A reversibility | Working correctly | None |
| 2.2 | Binary double-conversion | Already fixed | None |
| 3.1 | Percolation docs outdated | DOCUMENTATION.md stale | Update DOCUMENTATION.md |
| 3.2 | Performer attribution | Minor gap in 1 edge function | Fix `fix-corrupted-binary-scores` |

### Files to Change

| File | Change |
|------|--------|
| `DOCUMENTATION.md` | Update v2.15.43 percolation entry to include workflow-stage guard and `PERCOLATION_DEFERRED` behavior; version bump |
| `POLICY.md` | Add clarification to Daily bypass section: applies to governance restrictions only, not hard locks |
| `supabase/functions/fix-corrupted-binary-scores/index.ts` | Change `performedBy = body.performed_by \|\| "system"` to use `null` for system-initiated actions per §55 |

### Risk Assessment
- **Data Impact**: None — documentation + one performer field fix
- **Workflow Impact**: None
- **Regression Risk**: Minimal — the edge function fix changes audit log attribution only

