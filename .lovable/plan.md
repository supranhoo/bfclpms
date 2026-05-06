## Why-Why RCA — Org KPI Data Entry blank for data owner

**Symptom**  
Admin sees Ankan listed as data owner with 1 pending KPI for April 2026.  
Logged in as Ankan, `/admin/org-kpi-data` shows "No Organization-Level KPIs Found" + empty grid.

### 5-Why chain

1. **Why is the page blank?** `useOrgLevelKpisWithEmployees` returns 0 rows for Ankan.
2. **Why 0 rows?** PostgREST `select * from kpis where is_org_level=true and review_period='April' and review_year=2026` returns nothing under his JWT.
3. **Why nothing?** RLS policy `Data owners can view assigned org-level KPIs` is the only one that could pass for an `employee` role, and its `EXISTS` subquery returns false for every row.
4. **Why does EXISTS return false?** It compares `org_kpi_data_owners.kra_name = kpis.kra_name` and `…kpi_name = kpis.kpi_name` with **strict `=`** (case-sensitive, whitespace-sensitive, CR-sensitive).
5. **Why doesn't strict `=` match?** The owner-table rows and the `kpis` rows for the same KPI differ by whitespace (e.g. `Completion of Mandated  Training Hours` vs `Completion of Mandated Training Hours`), embedded `\r`, and a description suffix appended in one table but not the other. Verified live:  
   - exact `=` join: **0** owned KPIs for April 2026  
   - normalized join (lower + collapse whitespace): **69** owned KPIs

### Why this slipped past prior fixes

ADR-053/054 normalised joins on the **client** (`normalizeKpiKey`) and in the propagation **RPCs** (server functions running as `SECURITY DEFINER`, bypassing RLS). The raw `SELECT … FROM kpis` issued by the React Query hook still goes through RLS, which was never updated. Admins/auditors hit a different, role-based policy first, so they never reproduced the bug.

### Blast radius

Same exact-equality predicate exists on at least:
- `kpis` — `Data owners can view assigned org-level KPIs` (root cause here)
- `org_kpi_values` — equivalent owner-read/insert/update policies
- `kpi_audit_logs` / observation policies that key off the same triple

All three need the same normalisation, otherwise the next blank-screen will be on the value/audit side.

---

## Fix Plan

### 1. SQL helper (idempotent, immutable)

Create `public.normalize_kpi_text(text)` returning `lower(regexp_replace(replace(coalesce($1,''),E'\r',''), '\s+',' ','g'))` trimmed — mirrors the JS `normalizeText` in `src/lib/orgKpiKey.ts`. Mark `IMMUTABLE STRICT PARALLEL SAFE` so it can be used in expression indexes and policy predicates without performance regression.

Add supporting expression indexes:

```text
org_kpi_data_owners (category_id, normalize_kpi_text(kra_name), normalize_kpi_text(kpi_name), owner_id)
kpis                (category_id, normalize_kpi_text(kra_name), normalize_kpi_text(kpi_name)) WHERE is_org_level
org_kpi_values      (category_id, normalize_kpi_text(kra_name), normalize_kpi_text(kpi_name))
```

### 2. Replace the affected RLS policies

For each of the policies below, drop and recreate the predicate using `normalize_kpi_text()` on **both** sides of the kra_name/kpi_name comparison. `category_id` stays a UUID equality.

- `kpis` → `Data owners can view assigned org-level KPIs`
- `org_kpi_values` → all owner-scoped SELECT/INSERT/UPDATE policies
- (audit policies confirmed during migration drafting; only patch ones that join on the same triple)

### 3. Defensive cleanup of owner table

One-shot UPDATE inside the same migration to canonicalise `org_kpi_data_owners.kra_name` / `kpi_name` to the trimmed/CR-stripped form (lossless — only strips `\r` and collapses whitespace; preserves original casing for display). Snapshot original to a backup table mirroring the existing `org_kpi_owner_key_backup` pattern from ADR-054 before mutating. This makes the new indexes maximally selective and protects future joins that don't yet use the helper.

### 4. Frontend — no behaviour change required

`normalizeKpiKey` already produces the same canonical form, so once RLS opens up, all existing hooks (`useOrgLevelKpisWithEmployees`, `useOrgKpiOwnershipMap`, `useOrgKpiValues`, `usePropagateOrgKpiValue` preview) will start returning Ankan's rows automatically. No component edits needed.

Add one tiny UX safety net: in `OrgKpiDataEntry.tsx`, when `ownershipFilteredKpis.length === 0` AND the user is non-admin AND `useIsAnyOrgKpiDataOwner()` returned true, show "We couldn't load your assigned KPIs. Please refresh or contact admin." instead of the generic empty state — so a future RLS regression is visible, not silent.

### 5. Tests / Regression guard

- New SQL test `supabase/migrations/.../README` note + `src/test/orgKpiOwnerRls.test.ts` (vitest) that:
  - inserts an owner row with whitespace-mangled `kra_name`/`kpi_name`
  - inserts a `kpis` row with the canonical form
  - asserts the owner JWT can `select` the kpi (uses anon key + `auth.uid()` mock via existing test harness if available; otherwise pure SQL via `supabase--read_query` doc).
- Extend `src/test/orgKpiKeyNormalization.test.ts` with a parity case proving `normalizeText('A  B\r')` matches the SQL helper output.

### 6. Docs

- `docs/adr/ADR-057.md` — "Normalised RLS join for Org-KPI ownership" — records the why, the helper contract, and the migration order.
- `CHANGELOG_2026.md` — v2.66.13 entry.
- `mem/architecture/auth-readiness-query-gate` is unrelated; update `mem/features/admin/org-kpi-key-normalization` to add a §"RLS predicates" rule: any policy joining the org-KPI triple **must** wrap kra_name / kpi_name in `normalize_kpi_text()`.

---

## Risk & Impact Report

- **Data impact:** No row deletions. Owner-table values are canonicalised in-place (whitespace/CR only); originals snapshotted. Expression indexes are additive.
- **Workflow impact:** Data owners regain the access they were always intended to have — no other role's visibility changes (admin/auditor/manager policies untouched).
- **UI/UX:** Identical layout; tile that was hidden simply becomes visible. Empty-state copy improvement is additive.
- **Regression risk:** Low. The new policy predicate is a strict superset of the old one (anything matching exact-equal also matches normalised-equal). Worst case: a hypothetical owner row whose stored name differs only by case from another KPI would now match both — verified with `select count(*) … group by normalised_triple having count > 1` in the migration's pre-flight query; abort if any duplicates appear in the same category.
- **Mitigation:** Migration runs the duplicate-check first and raises if violated. Tests lock the contract. The non-admin empty-state fallback ensures a silent re-regression becomes a loud, user-visible message.

---

## Deliverables (in order)

1. `supabase/migrations/<ts>_normalize_kpi_text_and_rls.sql` — helper, indexes, owner-table canonicalisation + backup, policy replacement, duplicate guard.
2. `src/pages/admin/OrgKpiDataEntry.tsx` — empty-state fallback copy.
3. `src/test/orgKpiOwnerRls.test.ts` + extension to `orgKpiKeyNormalization.test.ts`.
4. `docs/adr/ADR-057.md`, `CHANGELOG_2026.md`, `mem/features/admin/org-kpi-key-normalization` updates.

Approve and I'll ship in that order, migration first so we can verify Ankan's tiles appear before touching anything else.
