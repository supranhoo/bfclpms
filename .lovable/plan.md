# TNI report shows August evidence for an Apr–Jun filter (ADR-252c)

## RCA — what I verified

1. Your export's evidence column reads `Aug 2026: 0.00` on every row, and only 3 rows survived while the banner says 1000 were excluded.
2. Running `tni_qualified_kpis` directly for April/May/June 2026 (threshold 2, minimum 3) returns **only Apr/May/Jun months** — the SQL function is correct and never emits August.
3. `training_needs` has **no August 2026 rows at all** (April 816, May 687, June 803, March 511, July 1). So the August evidence cannot come from the data either.
4. The global React Query config in `src/App.tsx` sets `placeholderData: (prev) => prev` for **every** query. That returns the *previous cache key's* data while a new key is fetching, and `isLoading` stays `false`.

**Root cause.** `TNIReport` opens on the single-month default (current month = August). When you switch to Custom Apr→Jun, the qualified-KPI query gets a new key and is refetched, but `placeholderData` hands back the **August** result-set in the meantime, with no loading state. The page (and Export) then filter the freshly-fetched Apr–Jun `training_needs` against the **August** qualification index — so only the handful of KPIs that happen to match the August index survive, the evidence column prints August months, and the "excluded" count is nonsense.

### 5 Why
1. Why August scores in an Apr–Jun report? The qualification index used was the August one.
2. Why was it August? React Query returned the previous key's data as placeholder.
3. Why was it displayed as final? `isLoading` is false for placeholder data, and the page only checks `isLoading`.
4. Why no guard? The qualified result carries no stamp of the range it was computed for, so a mismatch is undetectable.
5. Why did it reach the user? No test covers "filter changes mid-flight"; the export has no staleness gate.

## CAPA

**Corrective (this range renders correctly)**
1. `useTniQualifiedKpis` and `useTrainingNeeds` opt out of the global placeholder (`placeholderData: undefined`) — for filter-scoped analytics, showing the previous filter's numbers is worse than a spinner.
2. The qualified payload carries a `rangeKey` stamp (`Apr|2026,May|2026,June|2026`). `TNIReport` ignores the index when the stamp does not match the active range, and treats that state as loading.
3. Loading state becomes `isLoading || isFetching || stamp mismatch`, so cards, tables, banner counts and the "excluded" number never render against a stale set.
4. Export button is disabled while data is stale/fetching, and the export gains a **Range** column (`Apr 2026 → Jun 2026`) so any future sheet is self-describing.

**Preventive**
5. Default the detect-month dropdown to the last month **in the selected range** instead of the calendar month, so the header no longer says "Detect TNI (Aug)" for an Apr–Jun report.
6. Drop the obsolete 2-argument overload of `tni_qualified_kpis` (both versions currently exist; only the 3-arg one is used) to remove any resolution ambiguity.
7. Tests: a range-stamp unit test (stale index is rejected) and a guard test asserting the TNI hooks disable placeholder carry-over.
8. `docs/adr/ADR-252c.md`, `POLICY.md` §PMS-CONTINUITY-AT-OR-BELOW (new sub-clause: range-scoped results must be stamped and never rendered from another range), `DOCUMENTATION.md` version entry.

## Expected effect

With Apr–Jun 2026 @ threshold 2 / minimum 3, the report will show the real qualifying set (the SQL already computes it correctly) instead of the 3-row August-contaminated view, and evidence will read `Apr 2026: … , May 2026: … , Jun 2026: …`.

## Risk

Frontend + one function-drop migration; no data change. Slight loss of "keep previous numbers while refetching" on this report only — intentional. Rollback: revert the hook options and restore the dropped overload.
