## Assumptions
- The selected Assessment Year is stored as `2025-26`, while the UI label renders it as `AY 2025-26`.
- HR/Admin save and import permissions are working because the database contains the imported row for employee `Jaspal (101125)`.
- No schema change is required unless we decide to add a database-level foreign key later; the immediate defect is in frontend query/display logic.

## Clarifications
Not Applicable.

## Risk & Impact Report
- **Data Impact:** Existing `increment_inputs` rows are safe. I will not alter historical data.
- **Workflow Impact:** No change to save/import/calculate workflow; only the read/display path changes.
- **UI/UX Impact:** Rows will appear in the same table after manual save/import; search by employee name/code remains available.
- **Regression Risk:** Low-medium because the current list query relies on an embedded relationship name that is not actually present in the database metadata.
- **Scalability Impact:** Preserve server-side pagination at 50 rows/page. Employee enrichment will be batched only for visible page rows, avoiding full dataset loads.
- **Mitigation Plan:** Replace fragile embedded join reads with a two-step paginated read: fetch `increment_inputs`, then fetch only the visible employees from `profiles` by ID and merge in memory. Add unit coverage for enrichment so this cannot regress.

## RCA
- **Symptom:** Toast says “Saved” / “Imported 1 rows”, but table still shows `0 total`.
- **Database finding:** The row exists in `public.increment_inputs` for AY `2025-26`, and it maps to profile `Jaspal / 101125`.
- **Root cause:** The page query uses PostgREST embedded relationship syntax:
  `employee:profiles!increment_inputs_employee_id_fkey(...)`.
  However, the live `increment_inputs` table has no discoverable foreign-key constraint for `employee_id`, so the relationship embed is not reliable. That makes the list query fail/drop the result path even though the upsert itself succeeds.
- **Why both manual and upload fail visually:** Both write to the same table successfully, then the same broken list query is used to reload the table.

## Step-by-step Plan
1. Update `src/hooks/useIncrementInputs.ts` so `useIncrementInputs`:
   - queries `increment_inputs` directly by `assessment_year`, ordered by `updated_at`, paginated at 50 rows;
   - fetches only the visible page’s employee profiles by `employee_id`;
   - merges `{ employee: { id, full_name, employee_code } }` into each row;
   - applies employee name/code search safely without relying on a missing embedded FK.
2. Keep `useUpsertIncrementInput` and `useBulkImportIncrementInputs` write behavior unchanged, but ensure query invalidation still refreshes all variants of the inputs list for the AY.
3. Update/confirm `src/pages/incentive/IncrementInputs.tsx` only if needed for the new hook return shape; table rendering should remain visually unchanged.
4. Add a focused regression test and mock data for the two-step enrichment/search behavior.
5. Update `DOCUMENTATION.md` version history and `POLICY.md` to record the invariant: Increment Inputs display must read by stored `employee_id` and enrich via profiles, not rely on an implicit FK embed.

## UI Changes
- **Exact location:** Increment Inputs > Enter Inputs tab > Employee Inputs table.
- **Visual change:** No redesign. Rows that were already saved/imported will now display.
- **Interaction impact:** Manual Add, Excel Import, Edit, Search, and pagination remain the same.
- **Responsiveness:** No new layout changes; existing table behavior retained.

## Implementation
Pending approval. No files changed in plan mode.

## Tests
- Add/adjust a unit test covering:
  - direct input rows are enriched with employee name/code;
  - search by employee code/name filters correctly;
  - rows are not lost when no embedded FK relationship is available.

## DOCUMENTATION.md updates
- Add a version entry documenting the RCA and frontend read-path fix.

## POLICY.md updates
- Add an Increment Inputs display/read-path policy: save/import/calculate continue using canonical `employee_id`; frontend display/search must enrich profiles explicitly and preserve server-side pagination.

## Post-implementation notes
- Rollback strategy: revert the hook to the previous embedded join query if needed, with no database rollback required.
- Backup impact: no new tables; existing automatic backup coverage remains unchanged.