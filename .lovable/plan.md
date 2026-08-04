# Development Report not updating — RCA and fix (ADR-246)

## Assumptions
- "Not getting updated" = `/reports/dev-report` still shows work only up to mid-June 2026; nothing from the last ~7 weeks (ADR-217 … ADR-245) appears.
- The report should stay current automatically, without anyone running a local script.

## Confirmed current state (verified, not assumed)
- `dev_report_entries`: 793 rows. Latest `entry_date` = **2026-06-15**; every row's `created_at` = **2026-06-15 11:06 UTC** — one single seeding event, nothing since.
- `cron.job` contains 20+ scheduled jobs; **none** of them calls `dev-report-ingest`. The function is only reachable by a manual admin HTTP call.
- `scripts/devReportReseed.ts` is a local Node script that writes SQL to `/tmp/dev_report_reseed.sql` for a human to apply. It has not been re-run since 15 Jun.
- Repo artefacts produced since then and absent from the report: **336 migrations**, ~30 ADRs (ADR-217 → ADR-245), plus CHANGELOG_2026.md sections.
- The report UI/export code is fine — it is faithfully rendering a stale table.

**Root cause:** the Development Report has no automated capture path. Its only writer is a manual script + manual SQL apply, so the table froze on the day of the initial seed.

## Five Whys
1. Report shows nothing after 15 Jun → no rows after 15 Jun exist.
2. No rows → nothing wrote to `dev_report_entries` since the seed.
3. Nothing wrote → `dev-report-ingest` was never invoked again.
4. Never invoked → there is no cron job and no in-app trigger for it.
5. No trigger → capture was designed as a one-off local script; POLICY §131 defined the *genuine-entry rule* but never an *automatic delivery* mechanism.

## Risk & Impact Report
- **Data impact:** additive inserts only. The `uq_dev_report_entries_ingest_key` unique index makes re-runs idempotent — no duplicates, no updates, no deletes.
- **Workflow impact:** none. No status, score or review logic is touched.
- **UI impact:** the Features / Bugs / Timeline tabs and the month filter start showing Jun–Aug 2026; a new admin-only "Sync from repo" button appears in the page header with a last-synced timestamp.
- **Regression risk:** low, isolated to the Development Report. The parsing logic moves into one shared module, so the script and the app can never drift apart.
- **Scalability:** ~1,100 additional rows after the backfill. Sync posts in batches of 200 and the page already filters server-side by month; existing pagination/limits stay.
- **Rollback:** every synced row carries `created_by IS NULL` and a `linked_commit`; a single scoped `DELETE` by `linked_commit` prefix reverses any run. No schema is dropped.

## Plan

**1. Extract the capture logic into one SSOT parser**
Move the parsing in `scripts/devReportReseed.ts` into `src/lib/devReport/capture.ts`, exporting `buildDevReportRows(sources)` — pure, no filesystem access. The script keeps its CLI behaviour by feeding it files; the app feeds it bundled text.

**2. Bundle repo artefacts into the app**
Use Vite `import.meta.glob('/docs/adr/*.md', { as: 'raw' })`, the same for `/supabase/migrations/*.sql` (filename + head of file only, to keep the bundle small) and `CHANGELOG_2026.md`. Every deploy therefore ships an up-to-date artefact set — the report can never fall more than one deploy behind.

**3. Admin "Sync from repo" action**
New `useSyncDevReport()` hook: builds rows via the SSOT parser, posts them to the existing `dev-report-ingest` edge function in batches, and reports `inserted / skipped_duplicates / rejected` in a toast. Button is admin-only, sits next to Export, and is disabled while running.

**4. Auto-sync on load (guarded)**
When an admin opens the report and the newest `entry_date` is older than the newest bundled artefact date, run the sync once automatically and refresh — so "open the page" is enough; the button stays for manual re-runs.

**5. Backfill 15 Jun → today**
Run the sync once to ingest the 336 migrations, the ADR-217…245 set and the CHANGELOG sections. Deliver a before/after count by month.

**6. Detection so it cannot silently freeze again**
A "Last captured" line under the Reporting Period card showing days since the newest entry, amber past 14 days — visible staleness instead of silent staleness.

## UI changes
- **Where:** `/reports/dev-report` header row.
- **What:** "Sync from repo" button (admin only, spinner while running, result toast). Under the Reporting Period KPI card: "Last captured: DD MMM YYYY (n days ago)", amber when > 14 days.
- **Interaction:** sync invalidates the entries / summary / months queries; tabs and filters refresh in place.
- **Responsive:** button joins the existing header action group, full-width under `sm`.

## Tests
- `devReportCapture.test.ts` — parser: floor date 2026-02-01 respected, ADR/migration/CHANGELOG rows carry a genuine `linked_commit`, dedupe key stable.
- `devReportSyncIdempotent.test.ts` — running the same source set twice yields zero new rows.
- `devReportStaleness.test.tsx` — staleness badge appears past the threshold, hidden inside it.

## Governance
- **ADR-246 — Development Report auto-capture delivery.**
- **POLICY §131 amended:** the genuine-entry rule stays; capture must run on every deploy/page-open, and staleness beyond 14 days must be visible in the UI. DOCUMENTATION.md and CHANGELOG_2026.md updated in the same change.

## Technical notes
No schema change and no new edge function — `dev-report-ingest` and its unique index are reused as-is. Migration files are read for their filename, first comment and `CREATE TABLE/FUNCTION/POLICY` heads only, so bundle growth stays modest.
