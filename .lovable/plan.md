
## What's wrong today

I validated the live data on `/reports/dev-report`:

- All 65 entries (20 features / 20 bugs / 25 timeline) are dated **2026-06-01 → 2026-06-04**. They are catch-all seed rows written when the module was first built, not per-event dates. They fail your "only genuine entries" bar.
- The page has a **Cover** tab and a "Reporting Period" KPI card driven by `MIN/MAX(entry_date)` across *all* data, not by the month filter — so the period the user sees does not reflect what they filtered to.
- One factual note: the repo's first migration is **2025-12-20**, not Feb 2026. Genuine dev evidence exists from Dec 2025 onward (Dec: 17, Jan: 32, Feb: 94, Mar: 83, Apr: 93, May: 166, Jun: 115 migrations). I'll **start the rebuild from Feb 2026** as you asked and treat Dec 2025 / Jan 2026 as pre-period unless you say otherwise.

## Risk & Impact

- **Data**: Destructive — purges 65 existing `dev_report_entries` rows. Mitigation: take a one-shot backup row-copy into `dev_report_entries_archive_seed` before delete, so restore is one SQL away. Backup engine already covers `dev_report_entries`; new archive table will be auto-included.
- **Workflow**: Admin manual entries (if any added since launch) will be preserved — purge will filter out rows whose `linked_commit IS NOT NULL` OR `created_by IS NOT NULL` (i.e. only delete the original seed batch, identifiable by `created_by IS NULL AND linked_commit IS NULL AND entry_date BETWEEN '2026-06-01' AND '2026-06-04'`).
- **UI**: Cover tab and Cover-only KPI/Export plumbing removed; tab defaults to Features. Reporting Period card becomes filter-driven.
- **Regression**: Export workbook currently has 4 sheets (Cover/Features/Bugs/Timeline). Removing Cover sheet would break the column-order regression test. We will keep the Cover **sheet** in the XLSX export (matches the 101785 evidence schema, locked by `devReportExportSchema.test.ts`) but drive its values from filter context + cover meta. Only the in-app **Cover tab** is removed.
- **Scalability**: Reseed inserts ~400-600 rows in one migration batch (well under limits).

## Plan

### 1. Reseed pipeline (genuine sources only)

Run a one-off ingestion script (`scripts/devReportReseed.ts`, executed locally then captured as a SQL migration of `INSERT … ON CONFLICT DO NOTHING` rows) that walks:

| Source | Becomes | Date | Title | Idempotency key |
|---|---|---|---|---|
| `supabase/migrations/<ts>_<slug>.sql` filename | `timeline` (type=`migration`) | parsed from filename prefix `YYYYMMDD` | slug (humanised) + first comment line of SQL if present | `(timeline, entry_date, '', filename)` |
| New table / RLS / RPC inside that migration (regex on `CREATE TABLE`, `CREATE POLICY`, `CREATE FUNCTION`) | `feature` | same date | "<verb> <object>" | same as above + object name |
| `docs/adr/ADR-XXX.md` | `timeline` (type=`adr`) with `adr_refs=['ADR-XXX']` | file `git log -1 --format=%cs` or first date in front-matter; fallback file mtime | ADR title (H1) | `(timeline, entry_date, '', 'ADR-XXX')` |
| `CHANGELOG_2026.md` entries with `feat:` / `fix:` prefix | `feature` / `bug` | date from changelog heading | line title | `(entry_type, entry_date, '', title)` |
| `POLICY.md` / `DOCUMENTATION.md` section headings with dates | `timeline` (type=`policy` / `doc`) | parsed date | section title | same |

Rules:
- **Floor**: skip anything with `entry_date < 2026-02-01` (per your instruction).
- **Idempotent**: uses the existing unique index `uq_dev_report_entries_ingest_key`. Re-runs are safe.
- **Description**: short factual line from the source; never invented.
- **Severity (bugs)**: only set when the source explicitly says so (`bug: critical:` / `hotfix:`); otherwise left NULL — no fake severities.
- **Module/area**: derived from path segment (`safety`, `admin`, `incentive`, `review`, etc.) — only when unambiguous; otherwise NULL.
- Anything without a usable date is **skipped**, not back-dated.

### 2. Purge + reseed migration

Two-step SQL migration:

1. `CREATE TABLE public.dev_report_entries_archive_seed AS SELECT * FROM public.dev_report_entries;` (one-off archive, GRANTed to service_role only, RLS on, admin-read policy)
2. `DELETE FROM public.dev_report_entries WHERE created_by IS NULL AND linked_commit IS NULL;` — removes only the original seed batch, preserves any genuine admin entries.
3. `INSERT INTO public.dev_report_entries (…) VALUES …` for the reseed batch (generated offline, written into the migration body).

### 3. UI changes (`src/pages/reports/DevelopmentReport.tsx`)

- Remove the `<TabsTrigger value="cover">` and its `<TabsContent>`.
- Default tab → `'feature'`. Remove `'cover' | …` from the tab state union.
- Remove the `useDevReportCoverMeta` hook **from the page render** (keep it imported only inside `lib/devReportExport.ts` so the XLSX Cover sheet still works).
- "Reporting Period" KPI card now shows:
  - When a month is selected → `"Jun 2026 (2026-06-01 – 2026-06-30)"`
  - When `All months` → `"All months (<min> – <max>)"` from summary.
- Cover meta query only runs when `handleExport` is invoked (lazy `refetch`), so the page no longer fetches Cover data on mount.
- Export filename and XLSX scope already respect the month filter (no change).

### 4. Tests

- `devReportReseedFloor.test.ts` — asserts the reseed pipeline emits no row with `entry_date < 2026-02-01`.
- `devReportReseedIdempotent.test.ts` — running the pipeline twice produces the same row count (uses the unique index).
- `devReportPageNoCoverTab.test.tsx` — renders the page and asserts no `Cover` tab trigger; default selected tab is `Features`.
- `devReportReportingPeriodCard.test.tsx` — with `?month=2026-03`, the Reporting Period card renders `"Mar 2026 (2026-03-01 – 2026-03-31)"`.
- Existing `devReportExportSchema.test.ts` stays green (XLSX Cover sheet retained).

### 5. Docs / Policy

- `DOCUMENTATION.md` → "Development Report" section: remove Cover tab, document Reporting Period = filter-driven, document the reseed source list.
- `POLICY.md` §131: add **"Genuine-entry rule"** — every `dev_report_entries` row must trace to a concrete artefact (migration filename, ADR id, changelog line, or admin-authored manual entry). Synthetic / catch-all dates are forbidden. Floor date = 2026-02-01.

## Out of scope (v1)

- Re-running the reseed automatically on every push (Layer A auto-capture, already planned in `.lovable/plan.md`, remains future work).
- Backfilling Dec 2025 / Jan 2026 (kept out per your "since Feb 2026" instruction).
- Touching the XLSX export schema.

## Rollback

`INSERT INTO public.dev_report_entries SELECT * FROM public.dev_report_entries_archive_seed ON CONFLICT DO NOTHING;` restores the original seed batch verbatim.

## One question before I build

The repo's first commit/migration is **2025-12-20**, not Feb 2026. Do you want me to:

- **(A)** Hard-cut at 2026-02-01 as you said (recommended — matches your instruction; Dec 25 / Jan 26 ignored), or
- **(B)** Include the genuine Dec 2025 + Jan 2026 evidence too (49 more migrations)?

I'll proceed with **(A)** unless you say otherwise.
