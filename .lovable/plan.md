## Root cause (confirmed against the live DB)

Ankan owns the KPI **"Completion of Mandated Training Hours…"**. The KPI is mapped to **214 active employees** (the screenshot shows the 50 he tried to propagate this month). He only sees ~25 in the table because **`is_org_kpi_data_owner_for_profile` returns FALSE for the other rows**.

The reason is purely a string mismatch between two tables:

- `org_kpi_data_owners.kpi_name` → stored as a single line with `" - "` separators (length 385).
- `public.kpis.kpi_name` → stored with real newlines `"\n- "` (length 377).

`o.kpi_name = k.kpi_name` therefore fails. The SECURITY DEFINER helper added in ADR-060 returns 0, so the new profiles SELECT policy admits 0 employees, and `useProfiles()` truncates the scoped table. Save/propagate then only attempts whatever rows another (older) policy happened to expose.

The same brittleness affects every owner-driven join we do server-side; the client side already normalizes via `normalizeKpiKey` (lowercase + trim + collapse whitespace), but the DB does not.

## Fix plan

### 1. Database — normalize the owner⇄kpi join (single migration)

Add an immutable helper and rewrite the visibility function to use it:

```sql
CREATE OR REPLACE FUNCTION public.normalize_kpi_text(t text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT lower(btrim(regexp_replace(coalesce(t,''), '\s+', ' ', 'g')))
$$;

CREATE OR REPLACE FUNCTION public.is_org_kpi_data_owner_for_profile(p_profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.kpis k
    JOIN public.org_kpi_data_owners o
      ON o.category_id = k.category_id
     AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(k.kra_name)
     AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(k.kpi_name)
    WHERE k.employee_id   = p_profile_id
      AND k.is_org_level  = true
      AND o.owner_id      = auth.uid()
  );
$$;
```

The existing profiles SELECT policy keeps its USING clause; nothing else changes. Other owner-aware RPCs already do the right thing because they look up by `category_id + kra_name + kpi_name` against `kpis` only — the breakage is specifically the owner-table join. We will spot-audit `propagate_org_kpi_value` and `preview_org_kpi_propagation` and add the same `normalize_kpi_text` comparison if (and only if) they currently join `org_kpi_data_owners`.

### 2. Frontend — keep the propagation loop honest

`OrgKpiDataEntry.handleCardSave` / `executeSaveAndPropagate` already iterate over `allProfiles`. Once RLS returns the full 214 (or 50 for the active mapping), the existing loop will save and propagate every row — no logic change needed. Verify by:

- Adding a tiny dev assertion: when `scopedRows.length < employeeCount`, log a single console warning with the gap (we already render the amber banner). No behavioral change for users.

### 3. Tests / regression guards

- New SQL guard test `src/test/orgKpiOwnerJoinNormalization.test.ts` — calls `is_org_kpi_data_owner_for_profile` against a synthetic owner row whose `kpi_name` differs only in whitespace from `kpis.kpi_name`, and asserts TRUE. This locks the normalization in place forever.
- Extend `orgKpiSaveOrphanGuard.test.ts` to cover a 50-row mapping where every employee passes the safe-vs-orphan split (i.e. the orphans toast does NOT fire).

### 4. Docs & memory

- ADR-062 — "Org KPI owner⇄kpi join must be whitespace-normalized" (supersedes the silent-truncation footnote in ADR-060).
- Update `mem://features/admin/org-kpi-management-suite` rule (20) to add: *"Server-side joins between `org_kpi_data_owners` and `kpis` MUST use `public.normalize_kpi_text()` on `kra_name` and `kpi_name`. Raw equality silently truncates owner visibility because import paths store `\n` while UI inserts collapse to spaces."*
- Append an entry to `CHANGELOG_2026.md`.

## Risk & impact

- **Data**: read-only RLS broadening for *registered Org KPI data owners only*. No other role gains visibility.
- **Workflow**: data owners can finally save/propagate for every mapped employee (the intended behavior).
- **Regression risk**: very low — the helper is only referenced by the new profiles policy added in ADR-060. We will run the linter post-migration.

## Out of scope

- No UI redesign, no schema changes to `org_kpi_data_owners` (a global text-normalization migration would be a separate, larger cleanup).
