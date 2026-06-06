# Data Owners not visible — RCA & Fix

## Root Cause

`OrgKpiOwnerDialog` reads owners via `useOrgKpiOwners`, which does:
```
.eq('category_id', …).eq('kra_name', …).eq('kpi_name', …)
```

For the "Implement 5S practices" KPI the dialog shows **No data owners assigned**, but `org_kpi_data_owners` actually contains 2 rows for this exact category + KRA.

Byte-level diff of `kpi_name`:
- `kpis` master (source of truth used by the card):  
  `…efficiency.\n- Formula:…\n- Scoring Logic:…`  (real newlines)
- `org_kpi_data_owners` row:  
  `…efficiency. - Formula:… - Scoring Logic:…`  (newlines collapsed to ` - `)

Same length, different bytes → `eq` never matches.

Scope of the corruption (DB scan):
- Total owner rows: **233**
- Rows whose `(category_id, kra_name, kpi_name)` does **not** exist in `kpis`: **228**
- Of those, **227 are recoverable** by whitespace-normalized match against `kpis`
- 1 truly orphan row (KPI no longer exists)

So this is not a UI bug — owner rows were persisted in a non-canonical form (older insert path collapsed `\r\n` / `\n` to ` - `), and every subsequent exact-match lookup misses them. The owners are effectively invisible everywhere: the dialog, `useIsOrgKpiDataOwner` access gate, and the `Data Owner: …` badges built from `useOrgKpiOwnershipMap`.

## Risk & Impact

| Area | Impact |
|---|---|
| Data | Repair updates 227 rows in `org_kpi_data_owners`. Reversible via timestamped backup table. |
| Workflow | Restores edit permission for designated data owners (non-admins) on org-level KPIs they were assigned to. No new permissions granted. |
| UI/UX | Dialog will show the actual current owners; badges across scorecards re-appear. |
| Regression | Low. Hook signatures unchanged. Canonicalization at insert only normalizes the row to match `kpis`. |
| Scalability | One-time UPDATE, ~233 rows. Negligible. |
| Mitigation | Backup table `org_kpi_owner_key_backup_2026_06` written before UPDATE; 1 unrecoverable row logged, not deleted. |

## Plan

### Step 1 — Migration (data repair + safety)

1. `CREATE TABLE public.org_kpi_owner_key_backup_2026_06 AS SELECT *, now() AS backed_up_at FROM public.org_kpi_data_owners;` (plus GRANTs to `service_role`, RLS enabled, admin-only policy — same pattern as existing `org_kpi_owner_key_backup_2026_05`).
2. `UPDATE public.org_kpi_data_owners o SET kra_name = k.kra_name, kpi_name = k.kpi_name FROM public.kpis k WHERE k.category_id = o.category_id AND regexp_replace(k.kra_name,'[[:space:]]+',' ','g') = regexp_replace(o.kra_name,'[[:space:]]+',' ','g') AND regexp_replace(k.kpi_name,'[[:space:]]+',' ','g') = regexp_replace(o.kpi_name,'[[:space:]]+',' ','g') AND (k.kra_name <> o.kra_name OR k.kpi_name <> o.kpi_name);`
3. Log a `RAISE NOTICE` with the count of remaining orphan rows (expected 1) — kept for admin review, not deleted.

**Verification:** post-migration query `SELECT count(*) FROM org_kpi_data_owners o WHERE NOT EXISTS (SELECT 1 FROM kpis k WHERE k.category_id=o.category_id AND k.kra_name=o.kra_name AND k.kpi_name=o.kpi_name)` should return ≤ 1.

### Step 2 — Canonicalize on insert (prevent regression)

In `src/hooks/useOrgKpiDataOwner.ts`, `useAssignOrgKpiOwner.mutationFn`:
- Before insert, look up the canonical `kra_name`/`kpi_name` in `kpis` using `regexp_replace(...,'[[:space:]]+',' ','g')` equality (single RPC or a select that ANDs `category_id` + LIKE on first 80 chars + whitespace-normalized match in JS).
- If found, insert canonical values; if not found, insert as-is and surface a toast: "KPI not found in master — owner saved against current text".

Keep the read hooks (`useOrgKpiOwners`, `useIsOrgKpiDataOwner`, `useOrgKpiDataOwners`) unchanged — they continue to use `.eq()` which is correct once stored data is canonical.

### Step 3 — Tests

- `src/test/orgKpiOwnerCanonicalization.test.ts` — unit test on the canonicalize helper: `\r\n` and `\n` variants resolve to the master's exact string.
- Mock-data: extend existing owner fixtures with one "collapsed whitespace" row to assert the repair migration logic against a SQL fixture (executed by `vitest`'s SQL helper if present, otherwise pure JS simulation).

### Step 4 — SSOT updates

- `DOCUMENTATION.md`: add note under Org KPI Data Owners — canonical storage rule.
- `POLICY.md`: add invariant "Owner rows must store `kra_name`/`kpi_name` byte-identical to `kpis`".
- `docs/adr/ADR-076.md`: record decision (canonicalize on write; repair migration with backup).
- `mem/features/admin/org-kpi-key-normalization` — append the owner-rows clause.

## UI Changes

None. Only the dialog content changes from "No data owners assigned" → the actual list of owners (and the `Data Owner: …` badges on scorecards re-appear) once data is canonicalized.

## Rollback

Re-apply `org_kpi_data_owners` from `org_kpi_owner_key_backup_2026_06` (single SQL: `UPDATE … FROM backup WHERE id = backup.id`). Step-2 code change is additive and safe to revert independently.

## Files

- New: `supabase/migrations/<ts>_repair_org_kpi_owner_canonical_keys.sql`
- New: `docs/adr/ADR-076.md`
- New: `src/test/orgKpiOwnerCanonicalization.test.ts`
- Edit: `src/hooks/useOrgKpiDataOwner.ts` (canonicalize on insert only)
- Edit: `DOCUMENTATION.md`, `POLICY.md`, `mem/features/admin/org-kpi-key-normalization`, `mem/index.md`

## Out of Scope

- Changing read-side lookup logic.
- Touching the 1 unrecoverable orphan (left for admin review).
- Any change to `kpis` master or to the dialog UI.
