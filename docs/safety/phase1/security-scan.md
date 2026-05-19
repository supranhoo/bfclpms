# Security Scan — Safety Scope

## Method

- `supabase--linter` run on the live database.
- Findings filtered to Safety-relevant objects (`safety_*`, `mv_safety_*`,
  Safety SECURITY DEFINER functions).

## Safety-relevant findings

| ID | Severity | Object | Summary | Disposition |
|---|---|---|---|---|
| F-SEC-01 | WARN | `mv_safety_trir`, `mv_safety_severity_rate`, `mv_safety_incidents_open_vs_closed`, `mv_safety_training_compliance`, `mv_safety_audit_scoreboard`, `mv_safety_permit_throughput` | Materialized views are exposed via PostgREST. MVs cannot carry RLS. | **Phase-1.5 fix request** — REVOKE select on these MVs from `anon`/`authenticated`, expose only via `safety-analytics` edge fn (already the canonical reader). |
| F-SEC-02 | WARN | Multiple SECURITY DEFINER fns | `search_path` not set on several functions. Safety helpers `has_safety_role`, `has_any_safety_role`, `has_safety_module_access`, `can_view_safety_incident`, `transition_safety_incident` already pin `set search_path = public`; confirm during fix-pass. | **Defer** to consolidated security hardening migration. |
| F-SEC-03 | INFO | None Safety-specific | Project-wide `Function Search Path Mutable` for non-Safety functions. | Out of Phase 1 scope. |

## Stop-condition check

- F-SEC-01 is a **production data-leak risk** if any of the MVs aggregate
  cross-BU data and PostgREST exposes them to authenticated callers
  unrestricted. Per the governance standard's Stop Conditions, this is
  flagged but does **not** block Phase 1 deliverables (no runtime change
  has been made). It is logged as a Phase-1.5 ticket requiring its own
  approval gate and migration.

## Phase 1 disposition

- **Open tickets created (file-based):**
  - `docs/safety/phase1/tickets/T-001-revoke-mv-safety-public-read.md` (Phase 1.5)
  - `docs/safety/phase1/tickets/T-002-search-path-audit.md` (deferred consolidated)
  - `docs/safety/phase1/tickets/T-003-backup-coverage.md` (Phase 1.5; see `backup-coverage.md`)

No code changes made.