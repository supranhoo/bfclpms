

## RCA & Fix: Stale Management Score After Rollback

### Root Cause

Two independent code paths have the same off-by-one bug — they clear stages **after** the rollback target but not the target stage itself:

1. **`useKpiRollbackRequests.ts` line 183**: `if (idx > targetIdx)` — when target is `management_review` (last stage), nothing gets cleared except `final_score/final_rating`.
2. **`useAdminDataEntry.ts` line 640**: `if (targetIdx < indexOf('management_review'))` — uses strict `<`, so when target IS `management_review`, management fields are preserved.

Result: Rolling back from `approved` → `management_review` leaves `management_score = 5` in the DB, which the UI displays as-is.

### Fix (Two Parts)

**Part A — Clear target stage fields on rollback/step-back** (DB cleanup)

| File | Change |
|------|--------|
| `src/hooks/useKpiRollbackRequests.ts` | Line 183: change `idx > targetIdx` → `idx >= targetIdx` so the target stage's own fields are also cleared |
| `src/hooks/useAdminDataEntry.ts` | Lines 622/631/640: change `<` → `<=` for all three checks so target stage fields are included in the clear set |

**Part B — Show "Under Re-review" stale indicator** (UI)

| File | Change |
|------|--------|
| `src/components/review/KpiDetailsTable.tsx` | In the score column rendering: if KPI has a recent rollback/step-back audit log AND score is null for that stage, show an amber "Re-review" badge instead of "—". Uses existing `sentBackKpiIds` set or a new prop derived from `kpi_audit_logs` |

### Logic Detail

**Part A** — The clearing logic change:
```typescript
// useKpiRollbackRequests.ts — before:
CANONICAL_ORDER.forEach((stage, idx) => {
  if (idx > targetIdx && STAGE_FIELD_MAP[stage]) { ... }
});
// after:
CANONICAL_ORDER.forEach((stage, idx) => {
  if (idx >= targetIdx && STAGE_FIELD_MAP[stage]) { ... }
});
```

```typescript
// useAdminDataEntry.ts — before:
if (targetIdx < FULL_STATUS_ORDER.indexOf('management_review')) { ... }
// after:
if (targetIdx <= FULL_STATUS_ORDER.indexOf('management_review')) { ... }
// Same change for audit, hr_pms, skip_level, manager blocks
```

**Part B** — Stale indicator: When score is null (cleared) and KPI status matches a stage that was rolled back to, the cell shows an amber "Re-review" badge. This is derived from comparing `kpi.status` against the column stage — if the KPI is AT that stage (meaning it needs re-review), show the indicator.

### Files Modified

| File | Change |
|------|--------|
| `src/hooks/useKpiRollbackRequests.ts` | Fix `>` → `>=` in cascade-clear loop |
| `src/hooks/useAdminDataEntry.ts` | Fix `<` → `<=` in all stage-clear conditions |
| `src/components/review/KpiDetailsTable.tsx` | Add "Re-review" amber badge for null scores at current stage |
| `DOCUMENTATION.md` | v2.15.2 — rollback cascade-clear fix |
| `POLICY.md` | Invariant: rollback target stage fields must be cleared |

### Risk Assessment
- **Regression**: Low — changes only affect rollback/step-back flows; normal forward progression unaffected
- **Data**: Existing stale scores from past rollbacks won't auto-fix (already written), but new rollbacks will clear correctly
- **UI**: "Re-review" badge only appears when score is null AND status matches — no false positives

