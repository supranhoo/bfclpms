# Fix: "Scan for duplicates" fails — function similarity(text, text) does not exist

## What is broken

The KPI Library merge queue is empty and the scan button errors. This is not a missing feature: the scan itself aborts before it can write any proposals.

Confirmed cause (verified against the live database):

- The fuzzy matcher `public.scan_kpi_duplicate_groups` calls `similarity(...)` (from the `pg_trgm` extension) in two places.
- `pg_trgm` is installed in the `extensions` schema, not `public`.
- Both `scan_kpi_duplicate_groups` and its caller `bu_console_generate_merge_proposals` are declared `SET search_path TO 'public'`, so `similarity` is unresolvable at runtime and Postgres raises `function similarity(text, text) does not exist`.

So every scan fails, the proposal table stays empty, and the UI correctly shows "Nothing in this list" plus the raw error toast.

## Risk & impact

- Data: none. Read-only scan; only `kpi_merge_proposals` rows get inserted once it works. No schema change to existing tables.
- Workflow: unblocks the duplicate-merge queue only. Approvals already never touch past scores.
- Regression: low. Change is confined to two function bodies/definitions.
- Scalability: the current matcher does a lateral self-join over distinct normalized KPI names per category (O(n^2) similarity comparisons). With a few thousand distinct names this is slow and can time out. Mitigated below.

## Plan

1. Migration: recreate `public.scan_kpi_duplicate_groups` with `SET search_path TO 'public', 'extensions'` so `similarity` resolves. Apply the same search_path to `bu_console_generate_merge_proposals` for consistency.
2. Inside the matcher, gate the expensive comparison with the trigram operator `%` (`m.norm_kpi % n.norm_kpi`) before computing `similarity`, and set `pg_trgm.similarity_threshold` from the passed threshold, so a GIN index can prune candidates instead of full cross-comparison.
3. Add a GIN trigram index supporting the lookup on the normalized KPI name source (`public.kpis` lower(trim(kpi_name))) so the scan stays bounded as KPI volume grows.
4. UI: in the merge-queue panel, surface scan failures as a readable message ("Duplicate scan could not run — ...") instead of the raw Postgres error string, and keep the empty-state copy distinct from the error state.
5. Verify: run the scan RPC directly, confirm it returns groups and inserts pending proposals, then reload the KPI Library tab and confirm rows render in Pending.

## Docs and policy

- DOCUMENTATION.md: add ADR-266 — extension-schema search_path requirement for SECURITY DEFINER functions using `pg_trgm`.
- POLICY.md: extend the BU Console section — duplicate scanning must fail loudly with a readable message and must never present an error state as an empty queue.

## Technical notes

- No new extension install is needed; `pg_trgm` already exists in `extensions`.
- Rollback: re-apply the previous function definitions; the index can be dropped independently.
