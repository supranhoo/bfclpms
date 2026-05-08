## Risk & Impact Report

- **Data Impact:** No historical KPI values will be rewritten. The fix should change the read model / status derivation only, so existing scorecards remain intact.
- **Workflow Impact:** Propagation workflow stays the same; only the displayed “propagated / not propagated” truth becomes aligned with actual scorecard rows.
- **UI/UX Impact:** The summary badges remain visible and should show truthful numbers, including `50 propagated / 0 not propagated`.
- **Regression Risk:** Medium, because Org KPI Data Entry currently mixes snapshot data, `org_kpi_values.status`, and direct `review_submissions` fallback reads.
- **Mitigation:** Add regression tests for all-propagated counts and normalize the same KPI key contract across snapshot, fallback, and row summary.

## RCA

The screenshot still showing `0 propagated / 50 not propagated` means the UI summary renderer is working, but the row status input is wrong.

Current issue:
- The table summary counts `ScopedRow.status`.
- `ScopedRow.status` is marked `propagated` only when `useOrgKpiSubmissionFallback` returns a matching `review_submissions` fact.
- That fallback hook independently queries `kpis` + `review_submissions` and builds keys client-side.
- The main page uses the snapshot RPC as the canonical mapped employee list.
- These two paths can drift in normalization, RLS visibility, grouping, or query coverage.

So the page can render 50 employees from the snapshot, while the fallback map fails to attach the existing 50 scorecard submissions, making every row look “Not propagated”.

## Implementation Plan

1. **Move propagation truth into the snapshot read model**
   - Extend `get_org_kpi_data_entry_snapshot` to include per KPI/employee propagation facts derived directly from `review_submissions`.
   - Return a map keyed by the same definition key + employee id used by the page.
   - Count a row as propagated when the employee KPI has a `review_submissions` row with a value or N/A flag.

2. **Use snapshot propagation facts in `OrgKpiDataEntry.tsx`**
   - Derive employee row status from the snapshot propagation map first.
   - Keep `org_kpi_values.status = approved` as an approved override only.
   - Use `org_kpi_values` only for entered-but-not-propagated state.

3. **Keep the summary badges always truthful**
   - Keep current summary visibility behavior.
   - Ensure counts come from the same row statuses used by inline pills.
   - Preserve `0 not propagated` display when all rows are propagated.

4. **Retire or reduce the fragile fallback dependency**
   - Keep `useOrgKpiSubmissionFallback` only for achieved-value display if needed.
   - Do not use it as the primary propagation-status truth.

5. **Regression tests and documentation**
   - Add/update tests for: all rows propagated, mixed rows, and fallback map empty while snapshot propagation facts exist.
   - Update `POLICY.md` and `DOCUMENTATION.md` to define: propagation status is based on backend scorecard facts from the snapshot, not browser-side joins or `org_kpi_values.status`.