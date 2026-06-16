## 1. Assumptions
- The reported red toast is the Org KPI Data Entry error: `row(s) holding 0 were not propagated`.
- The row visibly shows `0`, has been saved, and should be eligible for Propagate without retyping `0`.
- This is a frontend state/validation bug, not a backend permission/RLS failure.

## 2. Clarifications
- Not Applicable — the screenshot and current code path identify the exact failure.

## 3. Risk & Impact Report
- **Data Impact:** No schema or data migration. Prevents valid persisted `0` values from being skipped during propagation.
- **Workflow Impact:** Data owners/admins can Save `0` once, then Propagate normally. Unsaved visible `0` values remain blocked.
- **UI/UX Impact:** Removes the false destructive toast for saved zero rows; existing Save/Propagate buttons and layout remain unchanged.
- **Regression Risk:** Medium in Org KPI Data Entry only, because zero handling was intentionally guarded after prior incidents.
- **Mitigation Plan:** Preserve the guard for `0` values that are not confirmed persisted; add regression tests for saved vs unsaved zero rows.
- **Scalability Impact:** No new queries, no extra API calls, no rendering expansion. Existing scoped-row filtering remains intact.
- **Backup/Data Integrity:** No database/table changes, so backup coverage is unaffected.
- **Rollback:** Revert the small frontend/test/docs changes; no data rollback needed.

## 4. Step-by-step Plan
1. **Root-cause fix in `OrgKpiEntryCard.tsx`**
   - Include each scoped row’s persisted DB value (`dbAchievedValue`) in the Save/Propagate payload.
   - After a successful explicit row/card Save, update the local row snapshot so `dbAchievedValue` matches the saved value, including `0`.
   - Keep sibling unsaved rows dirty and untouched exactly as today.

2. **Validation fix in `OrgKpiDataEntry.tsx`**
   - Change the untouched-zero skip guard from “skip any `_touched: false` + value `0`” to “skip only when `_touched: false` + value `0` + DB-persisted value is not `0`”.
   - This preserves protection against stale/fallback visible zeros while allowing explicitly saved zeros.
   - Update the toast text to remove obsolete “autosave” wording and match the explicit Save model.

3. **Tests**
   - Add/update Org KPI regression tests for:
     - unsaved untouched `0` is still blocked;
     - saved/persisted untouched `0` is allowed;
     - touched `0` remains allowed in direct Save → Propagate;
     - partial-save guard remains unchanged.

4. **DOCUMENTATION.md updates**
   - Add a new version-history entry documenting the RCA and fix: saved zero rows now propagate; unsaved visible zeros remain blocked.

5. **POLICY.md updates**
   - Amend §112 to state that the untouched-zero guard applies only when the browser cannot confirm the `0` exists in `org_kpi_values.achieved_value`.
   - Clarify microcopy must say “Save row” / “Save changes”, not “autosave”.

## 5. UI Changes
- **Location:** Admin → Org KPI Data Entry → scoped employee/department rows → Propagate actions.
- **Visual change:** No layout or component redesign.
- **Message change:** The destructive toast should no longer appear for saved zero rows. If a visible zero is not saved, the message will instruct the user to click Save row / Save changes before Propagate.
- **Interaction impact:** Users can enter `0`, click Save, then click Propagate without retyping the value.
- **Responsiveness:** No responsive layout changes.

## 6. Implementation
- Pending approval. No code changes made in plan mode.

## 7. Tests
- Add/adjust targeted unit tests only; no broad suite required.

## 8. DOCUMENTATION.md updates
- Required and included in the implementation plan.

## 9. POLICY.md updates
- Required and included in the implementation plan.

## 10. Post-implementation notes
- After implementation, verify the relevant tests and ensure the screenshot scenario no longer triggers the false red toast.