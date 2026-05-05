# Fix: "Data Owners" dialog shows empty for some Org KPIs

## Root Cause (verified against DB)

A `Data Owner` (Biswajit Sahoo) IS assigned for the highlighted "Consumable cost per MW" KPI — the assignment exists in `org_kpi_data_owners`. The dialog renders empty because of a **line-ending mismatch** between two storage points of `kpi_name`:

- `org_kpi_data_owners.kpi_name` for the MW card stores it with **CRLF** (`\r\n`, hex `0d0a`)
- The current `kpis.kpi_name` (passed by the card to the dialog) uses **LF only** (`\n`, hex `0a`)

The dialog and ownership-map queries do strict equality:
```ts
.eq('kpi_name', kpiName)               // useOrgKpiOwners
key = `${cat}||${kra}||${kpi.toLowerCase()}`  // useOrgKpiOwnershipMap / Names
```
…so the CRLF row never matches and the dialog reports "No data owners assigned." The sibling KW/Hour KPI was inserted with LF and matches correctly — which is exactly the asymmetry visible in your screenshot (MW = empty, KW = has owner).

This is the same class of issue covered in the existing memory **`copy-kras-org-kpi-integrity`**: text from import/copy paths can carry stray `\r` that breaks downstream string matching.

## Risk & Impact Report

- **Data Impact**: One-time UPDATE to `org_kpi_data_owners` to strip `\r`. No deletes, idempotent. Same normalization applied (defensively) on `kpis.kpi_name` so future inserts via either path stay aligned.
- **Workflow Impact**: None — only display/lookup correctness restored. RLS unchanged.
- **UI/UX**: Dialog now lists previously hidden owners; "Data Owner: X" badges on scorecards reappear for affected rows.
- **Regression Risk**: Low. Normalization is `replace(kpi_name, E'\r', '')`. Same hardening added on the client (`nk()` already collapses whitespace — extend to also strip `\r`).
- **Mitigation**: Unit test asserting `nk('Foo\r\nBar') === nk('Foo\nBar')`; DB trigger on insert/update of `org_kpi_data_owners` and `kpis` to strip `\r` from `kra_name` and `kpi_name`.

## Plan

### 1. DB migration (one-time + guard trigger)
- `UPDATE org_kpi_data_owners SET kpi_name = replace(kpi_name, E'\r', ''), kra_name = replace(kra_name, E'\r', '') WHERE kpi_name LIKE '%' || E'\r' || '%' OR kra_name LIKE '%' || E'\r' || '%';`
- Same UPDATE on `public.kpis` (kpi_name, kra_name) — defensive cleanup.
- BEFORE INSERT/UPDATE trigger `trg_strip_cr_kpi_text` on both tables that nulls out `\r` in `kpi_name` and `kra_name`.

### 2. Client hardening
- `src/hooks/useOrgKpiDataOwner.ts`: in `useOrgKpiOwners` and `useIsOrgKpiDataOwner`, strip `\r` from `kraName` / `kpiName` before the `.eq()` filters. In `useOrgKpiOwnershipMap` and `useOrgKpiDataOwnerNames`, strip `\r` when building both the map key and the lookup key.
- Existing `nk()` helper extended: `s => s.replace(/\r/g, '').toLowerCase().replace(/\s+/g, ' ').trim()`.

### 3. Tests
- New `src/test/orgKpiOwnerLineEndingMatch.test.ts`: verifies CRLF and LF variants of the same KPI name resolve to the same ownership map key and that `useOrgKpiOwners` filters tolerate stray `\r`.

### 4. SSOT updates
- `POLICY.md` §88.x: add normalization rule — all `kpi_name` / `kra_name` writes MUST strip `\r` (DB trigger enforced, client defensive).
- `DOCUMENTATION.md` v2.66.11: bug fix note.
- `CHANGELOG_2026.md` May W1: entry.
- `mem://features/admin/copy-kras-org-kpi-integrity`: append rule that `\r` stripping is now trigger-enforced on `org_kpi_data_owners` and `kpis`.

## Files

**Created**
- `supabase/migrations/<ts>_strip_cr_from_kpi_text.sql`
- `src/test/orgKpiOwnerLineEndingMatch.test.ts`

**Edited**
- `src/hooks/useOrgKpiDataOwner.ts`
- `POLICY.md`, `DOCUMENTATION.md`, `CHANGELOG_2026.md`
- `mem/features/admin/copy-kras-org-kpi-integrity`

Approve to apply.
