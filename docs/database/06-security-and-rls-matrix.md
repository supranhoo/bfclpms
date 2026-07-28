# 06 — Security & RLS Matrix

## Posture summary (live-verified)

| Control | State |
|---|---|
| Base tables with RLS enabled | **248 / 248** |
| Tables RLS-enabled but with zero policies (deny-all) | **0** |
| Total policies | 736 |
| Policies referencing `auth.uid()` | 503 (68%) |
| Tables granting anything to `anon` | **0** |
| SECURITY DEFINER functions | 375 |
| SECURITY DEFINER functions without pinned `search_path` | **0** |
| Materialized views exposed to `anon`/`authenticated` | **0** (T-001 closed) |

## Policy mix

| Command | Policies |
|---|---|
| SELECT | 325 |
| INSERT | 110 |
| UPDATE | 103 |
| DELETE | 64 |
| ALL | 134 |

## Security-definer helpers doing the heavy lifting

| Helper | Policies using it |
|---|---|
| `has_role(uuid, app_role)` | 340 |
| `has_safety_role(...)` | 50 |
| `has_menu_access_override(...)` | 42 |
| `is_implementation_admin_for(...)` | 11 |
| `is_permit_approver`, `get_skip_level_manager` | 7 each |
| `is_functional_manager_of`, `has_any_safety_role` | 6 each |
| `can_view_safety_incident` | 4 |

This is the correct pattern: roles live in `user_roles` / `safety_user_roles` (never on `profiles`), and recursion is broken by SECURITY DEFINER lookups.

## Most heavily policied tables

`review_submissions` (21), `profiles` (19), `kpis` (13), `kpi_queries` (12), `incentive_vessel_rates` (11), `performance_reviews` (10), `kpi_observations` (10).

## Gaps

1. **76 write-capable policies have no `WITH CHECK`.** For `FOR ALL` / `FOR UPDATE` policies this means the USING clause gates which rows can be *read for update*, but nothing constrains the *post-image* — a permitted actor can rewrite a row into a scope they do not own. Examples: `app_settings / Admins can update app_settings`, `employee_incentive_records / HR can manage incentive records`, `backup_logs / Service role can manage backup logs`, `business_units / Admins can manage business_units`. Full list: `docs/database/data/policies.csv` filtered on empty `with_check`. Risk is bounded because most are admin-scoped, but the pattern already caused a production defect once (ADR-152).
2. **Policy sprawl on hot tables.** 21 overlapping permissive policies on `review_submissions` means Postgres ORs all 21 predicates on every row — a correctness *and* performance liability (see `08-performance-audit.md`).
3. **Credentials embedded in `cron.job.command`.** 13 of 14 jobs inline a bearer token / apikey header. Anyone able to read the `cron` schema reads a live service credential, and rotation requires editing 13 job definitions.
