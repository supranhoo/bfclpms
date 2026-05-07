## Why the file comes back

The remove button only clears the file URL in local React state, then waits for the debounced auto-save. During the next 2–5 seconds, realtime/query refetches still return the old `evidence_url` from the database, and the card merge logic treats `null` local evidence as “missing data” and restores the database URL.

There is a second risk in the same area: the merge logic in `OrgKpiEntryCard.tsx` explicitly does this for scoped rows:

```text
row.evidenceUrl === null && dbRow.evidenceUrl !== null → restore db evidenceUrl
```

That is correct for initial loading, but wrong after a user intentionally clicks remove.

## Risk & Impact Report

- **Data Impact:** No schema/RLS/storage changes. Existing historical rows remain intact. The fix only changes when `org_kpi_values.evidence_url` is updated to `null`.
- **Workflow Impact:** File removal will become an intentional saved edit, same as upload. It will not change approvals, propagation, score logic, or permissions.
- **UI/UX Consistency:** The file will disappear immediately and stay removed after refetch/autosave. Existing upload/view/remove UI remains unchanged.
- **Regression Risk:** Medium-low. The sensitive part is preserving the existing “merge DB data after refetch” behavior for untouched rows while blocking it only for rows whose evidence was intentionally edited.
- **Mitigation Plan:** Add explicit evidence-touch tracking and a regression test around merge behavior/removal persistence.

## Implementation Plan

1. **Track evidence edits explicitly**
   - In `OrgKpiEntryCard.tsx`, add tracking for organization-level evidence and per-scoped-row evidence changes.
   - When `OrgKpiFileUpload` calls `onUploadComplete(null)`, mark that evidence field as intentionally touched before auto-save runs.

2. **Stop refetch merge from restoring removed evidence**
   - Update the scoped-row merge logic so `dbRow.evidenceUrl` is only merged into local state when that row’s evidence has not been touched in the current edit session.
   - Do the same for organization-scope evidence so an old DB value cannot overwrite a local removal before save completes.

3. **Persist removal immediately through the existing save path**
   - Keep using the existing `onSave` / `useBulkUpsertOrgKpiValues` flow so `evidence_url: null` is saved to `org_kpi_values`.
   - Ensure removal sets dirty state and triggers the same debounce/autosave behavior as upload.

4. **Regression coverage**
   - Add or update a focused unit test covering:
     - untouched empty evidence may hydrate from DB,
     - intentionally removed evidence is not rehydrated by a later DB/refetch snapshot,
     - saved payload can carry `evidence_url: null`.

5. **Documentation sync**
   - Update the relevant internal documentation/policy note for org-KPI evidence removal behavior and add a version-history entry, as required by project instructions.