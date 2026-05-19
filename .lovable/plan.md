Risk & Impact Report
- Data Impact: No schema, RLS, or historical data changes. This is display-only sorting.
- Workflow Impact: No approval, skip, or registry creation logic changes.
- UI/UX Consistency: Keeps the existing card UI; only changes ordering and adds/adjusts tests.
- Regression Risk: Low, but current behavior shows the previous implementation treated Exact as 100%, which explains Exact appearing before Fuzzy 100%.
- Mitigation Plan: Update pure sorting helpers and tests so fuzzy percentages sort strictly high-to-low, while Exact uses 100% only as a tie score and does not incorrectly outrank Fuzzy 100%.

Plan
1. Fix group-level Match% sorting in `buildRegistrySort.ts`
   - Compute a numeric display score from the variants.
   - Fuzzy groups sort by their highest `similarity` value.
   - Exact groups sort as `1.0` only for score comparison, not as a special “always first” category.
   - Tie-breakers stay stable: more rows, more variants, then KPI text alphabetically.

2. Fix variant ordering inside each Standardization card
   - Before rendering `group.variants.map(...)`, sort variants by match strength high-to-low.
   - This will make the sequence inside a group show `Fuzzy 100%`, then `Exact`/other 100% ties, then 49%, 46%, 40%, etc., instead of database-return order.
   - Preserve bucket assignment behavior by carrying the original variant index through the sorted render list, so approvals still reference the correct variant.

3. Add regression tests
   - Cover the user-reported order: Exact, 40%, 100%, 46%, 46%, 49% should render/sort as 100%, Exact/100 tie, 49%, 46%, 46%, 40% depending on tie-breakers.
   - Cover that Fuzzy 100% is no longer placed below Exact just because Exact is present.
   - Keep existing row-count and alphabetical tie-breaker tests.

4. Documentation sync
   - Update `DOCUMENTATION.md`, `POLICY.md`, and the current changelog entry to document that Standardization scanner ordering is Match% high-to-low for admin review efficiency.