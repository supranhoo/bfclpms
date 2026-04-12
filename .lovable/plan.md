

## RCA: Admin Data Entry Remarks Not Shown in Review Journey Tiles

### Database Evidence (Employee 101943, March 2026)

| Time | Action | Effect |
|------|--------|--------|
| 08:52:31 | ADMIN_DATA_ENTRY_MANAGER | manager_remarks set, auto_advance_reason = "on behalf of manager", status → manager_check |
| 08:53:22 | ADMIN_STATUS_OVERRIDE | Status → kra_set. **Cascade clear nullifies all scores/remarks BUT does NOT clear `auto_advance_reason`** |
| 08:55:40 | ADMIN_DATA_ENTRY_SELF | self_remarks = "as per tracker", auto_advance_reason overwritten to "on behalf of self" |
| 08:56:21 | STATUS_TRANSITION | Status → manager_check (re-entry of manager data) |

**Current DB state:** status=manager_check, self_remarks='as per tracker', manager_remarks='as per tracker, self review entry was made through admin'. Data IS present.

### Root Cause: Two Issues

**Issue 1: `auto_advance_reason` not cleared during cascade step-back**

In `useAdminDataEntry.ts`, `buildCascadeClearFields()` (line 614-651) clears all scores, ratings, remarks, and evidence fields when stepping back — but **does not** clear `auto_advance_reason`. Only `buildFullResetFields()` (line 607) clears it.

This creates an inconsistent state where the "System Auto-Advanced" banner still displays despite all tile data being nullified. The user sees the banner but all tiles show "Pending" with "No remarks" — making it appear as if entered remarks disappeared.

**Issue 2: `self_evidence_urls` not cleared in cascade step-back**

`buildCascadeClearFields` clears `self_evidence_url` (singular) but does NOT clear `self_evidence_urls` (the multi-file array column). Same issue for other stage evidence_urls arrays (skip_level, hr_pms, etc.).

### Fix Plan

| # | File | Change |
|---|------|--------|
| 1 | `src/hooks/useAdminDataEntry.ts` | Add `auto_advance_reason: null` to `buildCascadeClearFields` when target is before `self_review` |
| 2 | `src/hooks/useAdminDataEntry.ts` | Add missing `*_evidence_urls` (array) clear fields alongside existing `*_evidence_url` (singular) fields in `buildCascadeClearFields` |
| 3 | `DOCUMENTATION.md` | Document fix |
| 4 | `POLICY.md` | Version sync |

### Technical Detail

**Fix 1 — Clear auto_advance_reason** (in `buildCascadeClearFields`, after line 625):
```typescript
if (targetIdx < FULL_STATUS_ORDER.indexOf('self_review')) {
  clearFields.self_rating = null; clearFields.self_score = null; clearFields.self_remarks = null;
  clearFields.self_evidence_url = null; clearFields.self_evidence_urls = null; // Fix 2
  clearFields.achieved_value = null;
  clearFields.auto_advance_reason = null; // Fix 1
}
```

**Fix 2 — Clear multi-file evidence arrays** for each stage block:
```typescript
// In each cascade stage, add the _urls array alongside the singular _url:
clearFields.manager_evidence_urls = null;
clearFields.skip_level_evidence_urls = null;
clearFields.hr_pms_evidence_urls = null;
clearFields.auditor_evidence_urls = null;
clearFields.management_evidence_urls = null;
```

### Risk Assessment
- **Data impact**: None — only affects null-clearing during step-back operations
- **Regression risk**: Low — additive null assignments that match existing full-reset behavior
- **UI/UX**: Auto-advance banner will no longer display misleadingly after a step-back; evidence arrays properly cleaned up

