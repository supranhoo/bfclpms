## Assumptions
- The reported case is Metal Sizing, June 2026, employee code `SK130`, day `11`, value `2`.
- The user-visible issue is real because the grid’s load query is capped by the backend default row limit and can omit SK130 even though the database row exists.
- No destructive data repair is needed for SK130: database verification shows `daily_values = {"11": 2}` for SK130 in Metal Sizing / June 2026.

## Clarifications
Not Applicable.

## Risk & Impact Report
- **Data Impact:** No schema deletion or historical data rewrite. A read-path fix is needed so all June 2026 Metal Sizing rows are loaded, not just the first 1,000.
- **Workflow Impact:** Administrators and incentive data-entry users will see persisted entries correctly after refresh; save behavior remains explicit through **Save All**.
- **UI/UX Impact:** No layout redesign. Only persistence/feedback safeguards may change if needed.
- **Regression Risk:** Medium. Incentive grids deal with large row counts, filters, totals, and save batching; changing fetch behavior must not slow the page or break totals.
- **Scalability Impact:** High relevance. Current Metal Sizing June 2026 has 2,412 daily-entry rows; unranged reads cap at 1,000. Reads must be paged and ordered.
- **Mitigation Plan:** Add targeted tests that fail on unranged `production_daily_entries` reads and verify paged reads preserve SK130-like rows beyond index 1,000.
- **Rollback Strategy:** Revert the daily-entry hook/service changes and documentation entries; no data rollback required.

## RCA Summary
- **Database check:** SK130 exists and is active. The Metal Sizing program exists. The SK130 row exists in `production_daily_entries` with day 11 value `2`.
- **Observed failure mode:** The browser GET request for `production_daily_entries` requests all June 2026 rows without pagination/range. Backend responses are capped at 1,000 rows by default.
- **Proof:** A limited first-1,000 query for Metal Sizing / June 2026 does **not** contain SK130, while the full database query by employee does contain `{"11": 2}`.
- **Root cause:** `useProductionDailyEntries()` performs an unranged `.select('*')` against a table that now exceeds 1,000 matching rows. The grid seeds local state from that incomplete snapshot, so SK130 appears blank after refresh even though the value was saved.
- **Contributing cause:** The existing dirty-cell fix protects unsaved input during re-renders, but it does not solve post-refresh hydration when the saved row is outside the first 1,000 rows.

## Five Whys
1. **Why did SK130’s day-11 value disappear after refresh?** The refreshed grid did not hydrate SK130’s saved row into local state.
2. **Why was the row not hydrated?** The daily entries query returned only the first 1,000 rows for Metal Sizing / June 2026.
3. **Why only 1,000 rows?** The query used an unranged `.select('*')`, and the backend applies a default 1,000-row cap.
4. **Why did the code assume this was safe?** Earlier datasets were smaller, and pagination rules were already enforced for mappings/exports but not for the editable daily-entry load path.
5. **Why was this not caught earlier?** Tests covered mapping pagination and dirty-state preservation, but not daily-entry hydration for >1,000 saved rows.

## Step-by-step Plan
1. **Create a paged daily-entry fetch path**
   - Update `src/hooks/useProductionDailyEntries.ts` to load `production_daily_entries` through `fetchAllPaged` with deterministic ordering.
   - Keep query scope limited to `(program_id, month, year)`.
   - Keep `refetchOnWindowFocus: false`.

2. **Stabilize save/read cache after Save All**
   - Update `useBulkUpsertDailyEntries` to refresh or patch the exact `['production-daily-entries', programId, month, year]` cache after successful save instead of only broad invalidation.
   - Preserve the existing success toast and dirty-cell clearing behavior.
   - Avoid adding backend writes or schema changes.

3. **Add regression tests**
   - Add a focused test for `useProductionDailyEntries.ts` source contract: daily entries must use `fetchAllPaged`, `.range(from, to)`, and must not embed `profiles`.
   - Add a pure helper/test if needed to simulate 2,412 rows and assert SK130-like records beyond the first 1,000 are retained.
   - Ensure tests cover success and failure guardrails for the large-dataset scenario.

4. **Update SSOT documentation**
   - Update `DOCUMENTATION.md` version history with the RCA, five whys, CAPA, rollback, and test coverage.
   - Update `POLICY.md` under incentive paging rules to explicitly forbid unranged reads for editable `production_daily_entries` hydration, not only exports.

5. **Validate**
   - Run the targeted test file(s).
   - Re-check the DB read evidence for SK130 and confirm the code path no longer uses an unranged daily-entry query.

## UI Changes
- **Visual changes:** Not Applicable.
- **Location:** `/admin/incentive-data-entry`, Production Data tab remains unchanged.
- **Interaction impact:** After refresh, saved entries beyond the first 1,000 rows should display correctly.
- **Responsiveness:** Not Applicable; no layout change.

## Implementation
Pending approval. No code changes will be made until this plan is approved.

## Tests
- Add/extend Vitest coverage for daily-entry paged loading and no-profile-embed safety.
- Validate the >1,000-row SK130-like hydration case.

## DOCUMENTATION.md updates
- Add a new version-history entry documenting RCA/CAPA for SK130 daily entry disappearing after refresh.

## POLICY.md updates
- Extend `§INCENTIVE-MAPPING-PAGING` with editable daily-entry hydration rules: all list reads of `production_daily_entries` for grids must be paged, ordered, and profile-free.

## Post-implementation notes
- Existing SK130 data is not lost; it is present in the database.
- The corrective action is to fix the read/hydration path so saved data remains visible after refresh.