## Issue (Vivek 101784)

"Bulk Rollback failed — No propagated scopes found for this KPI" was shown on the Org KPI Data Entry page for "Handle all breakdowns and minimize the downtime…" (May 2026), even though the card displayed "3 propagated / 0 not propagated" and the dialog said "all 7 department scopes".

## Root Cause

`useBulkRollbackOrgKpiPropagation` (src/hooks/useRollbackOrgKpiPropagation.ts L183-195) filters `org_kpi_values` **strictly** on `status = 'propagated'`. Two real-world cases break this:

1. **Mixed status:** Across the rest of the app, the UI treats `status IN ('propagated','approved')` as "propagated" (OrgKpiDataEntry.tsx L1560, L1585, L1617). A card whose scopes are all in `approved` is still labelled "Propagated" and exposes the Rollback All Scopes button, but the bulk query returns zero rows.
2. **Stale UI after individual rollback** (Vivek's actual case): audit log for this KPI/May 2026 shows three single-scope `rollback_to_data_entry` actions at 10:44–10:45 that flipped the propagated rows to `pending`. The user then clicked "Confirm Bulk Rollback" on a stale card (cache not yet invalidated for that card) — the DB now has 0 propagated rows, so the strict filter throws.

The single-scope rollback path (L75-101) does NOT filter by status, which is why earlier individual rollbacks worked.

## Fix (surgical, hook-only)

`src/hooks/useRollbackOrgKpiPropagation.ts` — `useBulkRollbackOrgKpiPropagation` only:

1. Broaden the lookup filter:
   ```ts
   .in('status', ['propagated', 'approved'])
   ```
   Matches the UI definition of "propagated" used everywhere else and makes the bulk action align with what the button advertises.
2. When the lookup returns zero rows, **invalidate `org-kpi-values` before throwing** so the stale card refreshes immediately, and improve the message:
   > "All scopes for this KPI have already been rolled back or are not in a propagated/approved state. The view has been refreshed."
3. Mirror the same `queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] })` inside `onError` so any failure (not just zero-rows) leaves the UI fresh.

No changes to:
- The single-scope `useRollbackOrgKpiPropagation` (already status-agnostic).
- UI / dialog copy / button gating.
- RLS, schema, or audit-log shape.

## Tests

Add `src/test/bulkRollbackOrgKpiPropagation.test.ts`:
- Builds a fake `org_kpi_values` set with a mix of `propagated` + `approved` rows and asserts both are picked up.
- Asserts that when zero matching rows exist the hook throws the clearer message AND `queryClient.invalidateQueries(['org-kpi-values'])` was called.

## Documentation

- `DOCUMENTATION.md`: bump version, add note under "Org KPI Data Entry → Bulk Rollback" that the action covers `status IN ('propagated','approved')` and always refreshes the cache on failure.
- `POLICY.md` §ROLLBACK: codify that bulk rollback's "propagated" definition is the union `{propagated, approved}` to stay aligned with the UI badge logic.

## Risk & Impact

- **Data impact:** Bulk rollback may now also clear `approved` scopes for the same KPI/period. This matches what the dialog already promises ("clear propagated values across all X department scopes") and the reason field is mandatory; audit log entries are written per scope. No change to single-scope rollback or to `pending`/`entered` rows.
- **Regression risk:** Low — change is isolated to one hook function and adds a cache invalidation on the error path.
- **Rollback:** Trivial revert of the hook file.
- **Scalability:** No change to query shape; still a single `.in('id', ids)` update.

## Out of scope

- No structural refactor of card-status derivation.
- No change to single-scope rollback behaviour.
- No UI copy changes beyond the toast message.
