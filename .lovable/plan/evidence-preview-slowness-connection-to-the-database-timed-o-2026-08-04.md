# Evidence preview slowness & "connection to the database timed out"

## What was verified (no assumptions)

- **Files are not the problem.** `review-evidence` holds 26,738 objects, average **275 kB**, largest **2.0 MB**, zero files above 3 MB. A 275 kB image should render instantly.
- **The database is the bottleneck.** `pg_stat_statements` ranks the top query as an *unfiltered, full-table paged read of `kpis`*: **267,953 calls, 591 ms mean, 7.95 s max, 158,373 seconds of total server time**. Second place is the same table ordered by `created_at` (44,762 calls, 1,494 ms mean). Third is the paged `profiles` read (14,977 calls, 1,827 ms mean).
- **`statement_timeout` for logged-in users is 8 s**, and the worst observed executions land at 7.93–7.99 s — i.e. queries are being killed at the ceiling. The instance also reports **870,591 rolled-back transactions since boot**.
- Storage runs on the same Postgres: every file open resolves `storage.objects` through a row-level-security rule that joins `kpis` + `profiles` twice plus three sub-lookups. When the database is saturated by the reads above, the file lookup waits in the same queue — which is exactly what surfaces to Samir as a slow preview and, past the ceiling, as **"The connection to the database timed out"**.
- **Root cause of the load:** `useAllKpis` pages the **entire 20,254-row `kpis` table** (21 round-trips per call) through per-row security checks. It is mounted by Query Report, Performance Report, KRA Issuance, Department Report, Completion Report, Issues Report, Bottleneck Report, the Admin KPI create dialog, and All KRAs in "All Periods" mode.
- **Secondary cause (client side):** the preview dialog downloads the *whole* file into memory as a blob before painting anything. Nothing appears on screen until the last byte arrives, and there is no timeout, no retry, and no progress feedback. A transient failure is also mislabelled — the error normaliser maps every failure, including timeouts, to "You do not have access to this file", which is what the screenshot shows.

## Fix

### 1. Stop the full-table KPI scan (biggest win)
- Add a `SECURITY DEFINER` RPC `get_all_kpis_slim()` returning the same slim column set the hook already uses, applying the caller's visibility once instead of per row (pattern already proven by `get_reviewer_kpis_for_period`, POLICY §134-A).
- Repoint `useAllKpis` at it via `fetchAllRpcPaged`.
- Delete the dead `useReviewPageState` hook (confirmed: zero callers) so it can never be re-mounted.

### 2. Make file preview feel instant
- For images: render a short-lived signed URL directly in `<img>` so the browser streams and paints progressively, instead of buffering a blob first. Keep the blob path for PDFs.
- Add a 20-second guard on the fetch with an explicit **Retry** button.
- Prefetch the neighbouring file when a multi-file group is open, so Next/Previous is instant.

### 3. Report the real error
- Extend the error normaliser so timeout / network / 5xx / 544 failures read **"The file server is busy — please retry"** with a Retry action, and reserve the access-denied wording for genuine 403/404. Add unit tests for each branch.

### 4. Reduce storage-side lookup cost
- Rewrite the `review-evidence` SELECT policies to call `(select auth.uid())` once instead of evaluating `auth.uid()` six times per row, and move the participant test into a `STABLE SECURITY DEFINER` helper so Postgres caches it per statement. Behaviour-identical, additive migration, no permission change.

### 5. Confirm, don't guess
- Re-read `pg_stat_statements` after deployment and record before/after call counts and mean latency for the `kpis` and `profiles` patterns.
- If load stays high after these fixes, the next lever is increasing the Lovable Cloud instance size — I will only propose that once query volume is fixed, since resizing would just mask an avoidable 158,000 seconds of work.

## Deliverables
Risk & impact report, unit tests for the error normaliser and the new RPC contract, `docs/adr/ADR-250.md`, plus `DOCUMENTATION.md`, `POLICY.md` and `CHANGELOG_2026.md` updates.

## Rollback
Each step is independent and additive: revert the hook to the old paged read, revert the preview component, drop the new RPC/helper. No data is modified.