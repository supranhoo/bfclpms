
# Development Report — Month Filter + Auto-Capture Plan

Two concerns, addressed together:
1. **Month Filter** on the Development Report page.
2. **Auto-population** of entries so no one has to type them after each change.

---

## 1. Month Filter (UI)

### Where
Top filter row of `/reports/dev-report`, left of the existing search box:

```text
[ Month ▾ ]  [ Search title/description/module… ]                 [ Export XLSX ]
[ Cover | Features | Bugs Fixed | Timeline ]
```

### Behavior
- Single shadcn `Select` populated from **distinct `to_char(entry_date,'YYYY-MM')`** values present in `dev_report_entries` (DB-driven, no hardcoded months).
- Options: `All months` (default) + each available month in DESC order, labelled `Jun 2026`, `May 2026`, …
- Selecting a month:
  - Filters Features / Bugs / Timeline tabs (server-side `entry_date >= first_of_month AND < first_of_next_month`).
  - Updates the **Cover** KPI cards (Features / Bug Fixes / Timeline counts) and the **Reporting Period** row to that month's range.
  - Drives the XLSX export — exported file is scoped to the selected month, filename suffix `_YYYY-MM`.
- State persisted in URL (`?month=2026-06`) so deep-links and refresh keep the view.

### Data layer
- Extend `useDevReportEntries` to accept `{ month?: string }` and pass `gte/lt` filters.
- Extend `dev_report_summary(period_from, period_to)` call already in place — just feed the month's bounds.
- New tiny hook `useDevReportMonths()` → `SELECT DISTINCT to_char(entry_date,'YYYY-MM') ...` (cached 5 min).

---

## 2. Auto-Capture — no manual entry per change

Goal: every shipped change (feature / fix / migration / policy update) lands in `dev_report_entries` automatically. Manual entry stays as a fallback only.

### Source-of-truth signals we already have
| Signal | Maps to |
|---|---|
| New row in `supabase/migrations/*.sql` | `timeline` (type=migration) + `feature` if it adds tables/columns |
| Entry appended to `CHANGELOG_2026.md` | `feature` or `bug` (by `feat:` / `fix:` prefix) |
| New ADR file `ADR-XXX` | `timeline` (type=adr) with `adr_refs` populated |
| `POLICY.md` section change | `timeline` (type=policy) |
| `audit_logs` rows of type `schema_change` / `policy_change` | optional secondary feed |

### Pipeline (3 layers, additive)

**Layer A — Commit-time capture (primary, zero human effort beyond commit message)**
- Add a tiny **edge function `dev-report-ingest`** (admin/service-role only) that accepts a normalized payload:
  ```json
  { "entry_type":"feature|bug|timeline",
    "entry_date":"YYYY-MM-DD",
    "title":"...", "module_area":"...", "description":"...",
    "severity":"...", "timeline_type":"migration|adr|policy|release",
    "adr_refs":["ADR-090"], "linked_commit":"<sha>" }
  ```
- A repo script `scripts/devReportFromCommit.ts` runs on each push (or locally via `bun run devreport:sync`) and:
  1. Reads commits since last successful sync (cursor stored in `system_settings.dev_report_last_commit`).
  2. Parses Conventional Commit prefix (`feat:` → feature, `fix:` → bug, `chore(migration):` → timeline/migration, `docs(policy):` → timeline/policy).
  3. Detects new files in `supabase/migrations/` and `docs/adr/` for timeline entries.
  4. POSTs to `dev-report-ingest`.
- **Idempotent** on `(entry_type, entry_date, linked_commit, title)` — re-runs are safe.

**Layer B — DB-trigger capture (secondary, catches in-DB changes)**
- Trigger on `audit_logs` (or `pg_event_trigger` on DDL where safe) inserts a `timeline` row for migrations executed in production. Performer = `NULL` (per Core rule on automated actions).
- Filtered by an allowlist in `system_settings.dev_report_capture_config` (zero-hardcoding rule).

**Layer C — Manual UI (existing) — fallback only**
- Admin can still add/edit/delete from the page for items the automation missed (e.g. UX-only polish without a commit message).

### Governance hooks (already drafted, now activated)
- POLICY.md §131: every shipped change must produce a `dev_report_entries` row — Layer A makes this automatic.
- Pre-commit lint warns if `feat:`/`fix:` commit lacks a parseable scope/title.
- Nightly cron edge function `dev-report-reconcile` compares the last 7 days of `audit_logs` schema changes vs `dev_report_entries` and posts a Slack/email digest of any gaps to admin.

---

## Risk & Impact
- **Data**: additive only — no schema migration for the filter; auto-capture adds inserts, idempotency key prevents duplicates.
- **Workflow**: developers keep using Conventional Commits; no new manual step.
- **UI**: one new Select control; layout unchanged on mobile (filters wrap).
- **Regression**: month filter is opt-in (`All months` default = current behavior). Auto-capture writes via service-role edge function only — RLS unaffected.
- **Scalability**: month list query is small (DISTINCT on indexed `entry_date`); server-side pagination already in place.
- **Backup**: `dev_report_entries` already auto-included (no denylist row) — confirmed.

## Rollout
1. Ship Month filter + URL persistence + scoped export.
2. Ship `dev-report-ingest` edge function + idempotency.
3. Ship `scripts/devReportFromCommit.ts` and wire to CI (or local `bun run` until CI is desired).
4. Enable Layer B DB trigger behind feature flag `dev_report_auto_capture_enabled`.
5. Enable nightly reconciliation digest.

## Out of scope (v1)
- Multi-month range picker (single month + `All`).
- Slack webhook (email digest only first).
- Auto-classifying severity for bugs — defaults to `medium`, admin can edit.

## Tests
- `devReportMonthFilter.test.ts` — bounds inclusive/exclusive, URL sync, export filename suffix.
- `devReportIngestIdempotent.test.ts` — same commit twice = one row.
- `devReportCommitParser.test.ts` — Conventional Commit → entry mapping table.
- `devReportReconcile.test.ts` — gap detection between `audit_logs` and entries.

## Docs / Policy updates (same PR)
- DOCUMENTATION.md: new "Development Report → Auto-Capture Pipeline" section + Month filter behavior.
- POLICY.md §131: clarify automation is primary, manual entry is fallback; define commit-message contract.
