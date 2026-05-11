**Finding**
- Ankit’s screenshot is closer to the database truth for May 2026.
- Vivek’s `Total Employees = 1000` is not correct: the database has `2,532` active employees, so Admin View should show `2,531` after excluding the logged-in viewer.
- Small differences between Vivek and Ankit can be valid only where the UI intentionally excludes the logged-in user’s own KPIs: Vivek has 4 May KPIs, Ankit has 9 May KPIs. But a drop from `2,531` to `1,000` means the UI is using a truncated/partial roster or stale query result.

**Risk & Impact Report**
- **Data Impact:** Read-only counter fix; no historical KPI/review data will be changed.
- **Workflow Impact:** Admin View remains org-wide; self-review remains excluded from reviewer grids per existing policy.
- **UI/UX Impact:** Only the numbers and consistency of stat cards should change; layout stays the same.
- **Regression Risk:** Medium, because these counters feed multiple reviewer tabs and use shared hooks.
- **Mitigation:** Add regression tests for the 1,000-row cap and for viewer-specific self-exclusion so future changes cannot silently undercount.

**Plan**
1. **Make the counters authoritative**
   - Add a backend reporting RPC for Pending Self / Pending Manager / Pending Skip counters that returns the stat-card counts directly from the database for the selected period.
   - Count active employees and KPI totals server-side, with explicit logged-in-viewer exclusion only where the existing reviewer-grid policy requires it.

2. **Fix the partial roster source**
   - Update the frontend hook(s) so stat cards no longer derive headline counts from a possibly truncated `profiles`/roster response.
   - Keep employee cards paginated/windowed for performance, but make stat cards use the full authoritative count.

3. **Preserve correct KPI split logic**
   - For Pending Self Review, keep the current split:
     - main number = regular pending self KPIs,
     - subtitle = org KPI count + bi-monthly/quarterly count,
     - total KPIs = all period KPIs in the authorized scope.

4. **Add regression coverage**
   - Add tests proving the dashboard must not use only the first 1,000 profiles for totals.
   - Add tests that Vivek/Ankit-style admin users get consistent org-wide employee counts, with only their own KPI exclusion causing small KPI-count differences.

5. **Update SSOT docs/policy**
   - Update `DOCUMENTATION.md` version history with this RCA.
   - Add/update `POLICY.md` rule: reviewer dashboard headline counters must come from authoritative paged/server-side counts, never from a capped client roster.