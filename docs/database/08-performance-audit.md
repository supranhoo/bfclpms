# 08 — Performance Audit

Database size 742 MB; 657 indexes.

## The real hotspot is RLS-driven sequential scanning

| Table | Live rows | Seq scans | Tuples read via seq scan |
|---|---:|---:|---:|
| `org_kpi_values` | 4,498 | 49,241,312 | 181,263,475,763 |
| `org_kpi_data_owners` | 250 | 87,358,319 | 20,239,937,793 |
| `access_profile_menu_rights` | 67 | 53,681,432 | 3,574,515,996 |
| `safety_incidents` | 50 | 64,424,698 | 1,812,435,243 |
| `safety_incident_routing_rules` | 19 | 80,190,811 | 1,332,209,371 |
| `access_profiles` | 1 | 107,759,558 | 430,622,206 |

These tables are tiny, so the planner correctly prefers a seq scan *per invocation* — but the invocation count is the problem. Scan counts in the tens of millions against single-digit-row tables are the signature of a **per-row RLS subquery**: every row check on a large table re-scans the small policy-lookup table. `access_profiles` at 107 M scans on 1 row is the clearest instance.

Mitigation pattern (no schema change required): wrap the lookup in a `STABLE SECURITY DEFINER` function so Postgres caches it once per statement instead of once per row, and reference `(select auth.uid())` rather than bare `auth.uid()` inside policies. Several helpers already do this; the ones behind the six tables above do not.

## Index findings

- **171 foreign keys have no supporting index** on their leading column (`data/fk_missing_index.csv`). Impact is on `ON DELETE CASCADE`/`SET NULL` parent deletes and on join-heavy report queries. Highest value additions are the reviewer-pointer and org-scope FKs: `access_profile_org_scope.{company_id,department_id,business_unit_id,division_id}`, `access_profile_assignments.user_id`.
- **139 non-unique indexes have never been scanned** (`idx_scan = 0`, `data/unused_indexes.csv`). Some belong to `auth.refresh_tokens` (Supabase-managed, leave alone). Application-owned dead weight includes `idx_email_logs_event_type` (1,040 kB), `arps_employee_idx`, `dev_report_entries_adr_refs_idx`. Note that counters reset on restart — confirm over a full review cycle before dropping.
- `kpis` has recorded 609 M index scans versus 54 k seq scans — the KPI access path is healthy.

## Client-side query shape

`docs/database/data/unpaged_queries.csv` lists **597** `.from(x).select(...)` call sites with no `.range()`, `.limit()`, `.single()`, `.maybeSingle()` or count-only hint within the chain. PostgREST hard-caps responses at 1,000 rows, so each of these is a silent-truncation risk of the exact class that hid employee 102028 from User Management. Many are legitimately small lookups; the list needs triage against expected row counts, prioritising `profiles`, `kpis`, `review_submissions`, `org_kpi_values` and `notifications`.

## Policy count as a performance factor

21 permissive policies on `review_submissions` and 19 on `profiles` mean every access evaluates the OR of all of them. Consolidating overlapping SELECT policies into a single predicate backed by one security-definer helper would cut planner work on the two busiest tables in the system.
