## Confirmed finding

For the KPI shown in your screenshot — **Training & Development / Completion of Mandated Average Training Hours / April 2026** — I checked the live backend data directly:

- **13 active employee KPI rows exist**
- **13 / 13 have scorecard `review_submissions` data**
- **0 / 13 remain in `kra_set`**

So I do **not** think this is a data propagation failure anymore. The backend data and employee dashboard/Impact view are consistent: these employees are propagated.

## Why the screen still says “13 not propagated”

The incorrect statement is coming from stale frontend row state inside `OrgKpiEntryCard`:

1. `OrgKpiDataEntry.buildCardData()` now correctly rebuilds `data.scopedRows` using scorecard truth from the snapshot/fallback.
2. But `OrgKpiEntryCard` copies `data.scopedRows` into local state as `scopedValues`.
3. The reset guard uses `scopedRowsSignature()`, which currently only compares **row IDs**, not row propagation `status`.
4. After propagation, the same 13 employee IDs remain, so the signature appears “same”.
5. The component therefore does **not** replace local `scopedValues`, and the scoped table keeps rendering old `status: 'entered'` rows.
6. `OrgKpiScopedEntryTable` counts `status === 'entered'` as “not propagated”, so it shows **0 propagated / 13 not propagated** even though the backend has 13/13 propagated.

In short: **the data is propagated; the expanded card’s local display state is stale.**

## Risk & Impact Report

- **Data Impact:** None expected. This fix should be frontend/read-model only; no schema, no RLS, no historical data rewrite.
- **Workflow Impact:** None. Propagation, repair, rollback, and reviewer locks should remain unchanged.
- **UI/UX Impact:** Only the propagation count/badges in the expanded Org KPI employee table should update correctly after refetch/propagation.
- **Regression Risk:** Medium if we reset local rows too aggressively, because Org KPI entry rows also preserve unsaved edits/evidence removal.
- **Mitigation:** Merge non-editable row metadata (`status`, target/uom display fields, `isNa` fallback) without overwriting active user-entered values; add regression tests for status-only row changes.

## Implementation plan

1. **Fix scoped row state synchronization**
   - Update the row-sync logic in `OrgKpiEntryCard` so backend/refetched `data.scopedRows[].status` always flows into local `scopedValues`.
   - Preserve editable local fields while dirty: achieved value, remarks, evidence removals, and sub-factor edits must not be overwritten.
   - Allow non-editable/refetched fields to update: `status`, `targetValue`, `uom`, `uomType`, `qualitativeOptions`, and fallback `isNa` where safe.

2. **Strengthen the row signature guard**
   - Update `scopedRowsSignature()` or add a dedicated metadata signature so it detects status-only changes like:
     - same employee IDs
     - same values/remarks/evidence
     - but `entered → propagated`
   - This prevents the exact stale “13 not propagated” state from surviving a refetch.

3. **Add regression coverage**
   - Extend `src/test/orgKpiCounts.test.ts` or add a focused test proving the signature changes when row `status` changes.
   - Add/extend a UI-level test around `OrgKpiScopedEntryTable` or the row merge helper so rows changing from `entered` to `propagated` update the header from `0 propagated / 13 not propagated` to `13 propagated / 0 not propagated`.

4. **Policy/documentation sync**
   - Update `POLICY.md §111.3` to clarify that not only the parent `data.scopedRows`, but also any local component copy of scoped rows, must sync propagation status from scorecard truth.
   - Update `DOCUMENTATION.md` Version History with this RCA: “stale local scoped row status after successful propagation”.

5. **Validation after implementation**
   - Run the targeted tests for Org KPI row counts/status.
   - Verify the live query still shows 13/13 propagated and confirm the UI logic now displays `13 propagated / 0 not propagated` after data refresh.

## Not planned

- No new repair RPC.
- No data rewrite.
- No change to propagation business rules.
- No quick-fix hiding the badge; the badge should remain, but with the correct truth.

<lov-actions>
  <lov-open-history>View History</lov-open-history>
</lov-actions>

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>