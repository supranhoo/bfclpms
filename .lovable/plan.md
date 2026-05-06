# RCA & Fix Plan — Org KPI "Missing employees" + FK save error

## What we observed (screenshots)

1. **Dialog says** "50 will advance" / "Propagate to 50 employees", but the underlying **scoped table only shows 25 employees** ("25/25 entered"). The two surfaces disagree.
2. Saving fires:
   `insert or update on table "org_kpi_values" violates foreign key constraint "org_kpi_values_employee_id_fkey"`
   (FK → `profiles(id)`).

## Why-why analysis

### Issue 1 — Only 25 of 50 employees rendered

- `OrgKpiDataEntry` builds `scopedRows` for the employee scope as:
  ```ts
  filteredEmps = allProfiles.filter(emp => mappedEmpIds.has(emp.id))
  ```
  - `mappedEmpIds` comes from the `kpis` table fetch in `useOrgLevelKpisWithEmployees` (RLS = "kpi owner / admin"), which returns **all 50** mapped employees.
  - `allProfiles` comes from `useProfiles()`, which fetches `profiles` with `is_active = true` and is then trimmed by **profiles RLS**. For a data-owner like Ankan, the only matching policy is `Authenticated users can view org kpi data owner profiles` (visibility limited to *other data-owner* profiles) plus `is_data_owner_for_employee` (which checks for KPIs they own). Result: Ankan can see fewer profiles than the kpi rows mapped to him.
  - Silent intersection → 50 mapped IDs ∩ 25 visible profiles = 25 rendered rows. The other 25 are dropped with **no warning**.

- The propagation preview RPC (`preview_org_kpi_propagation`) runs `SECURITY DEFINER`, so it sees all 50 kpi rows ⇒ "50 will advance".

**Root cause:** RLS on `profiles` is not aligned with the data-owner contract. A user authorised to enter data for a KPI cannot read every employee mapped to that KPI.

### Issue 2 — `org_kpi_values_employee_id_fkey` violated

- `handleCardSave` builds `toSave` rows with `employee_id: sv.scopeId` for every entry in `scopedValuesRef.current`.
- `scopedValuesRef` is hydrated from `data.scopedRows` (the 25 visible rows). Since each `scopeId` came from `allProfiles`, it *should* satisfy the FK.
- But on the failing tile, `scopedValues` contains an `employee_id` that no longer exists in `profiles`. Two ways this happens today:
  1. **Stale state across KPI navigation** — `scopedValues` is keyed by `kpiIdentityRef`; if a profile was deleted between selectors but the in-memory `scopedRows` weren't refetched, the stale UUID is sent.
  2. **Default to all profiles** — when `mappedEmpIds` is `undefined` (no mapping cached yet), the code falls through to `filteredEmps = allProfiles` (line 441). For org-level scope this can include profiles outside the KPI mapping; the `kpis` row may not exist for that employee, but more importantly there's no validation that `employee_id` still resolves in `profiles` at submit time.

**Root cause:** No guard rail. We trust an in-memory `scopeId` that may be stale or unmapped, then send it straight to a FK-constrained upsert.

## Risk & impact report

- **Data:** No schema break. We tighten an RLS policy and add a pre-save guard. Historical OKV rows untouched.
- **Workflow:** Data owners gain read access to *only* the employee profiles for KPIs they own. They were already authorised to enter values for these employees.
- **UI/UX:** Tile counts will finally match the dialog. Save errors become user-friendly toasts instead of raw FK strings.
- **Regression:** Low. New RLS policy is additive (`OR is_org_kpi_data_owner_for_profile(...)`). Save guard fails closed by skipping the offending row with a toast, not by aborting the whole batch.
- **Mitigation:** New unit tests for the helper + RLS guard test for the new policy.

## Fix plan

### 1. Database (migration)

Add a SECURITY DEFINER helper and a profiles RLS policy so any data owner of an org KPI can read every employee mapped to that KPI.

```sql
CREATE OR REPLACE FUNCTION public.is_org_kpi_data_owner_for_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM kpis k
    JOIN org_kpi_data_owners o
      ON o.category_id = k.category_id
     AND o.kra_name    = k.kra_name
     AND o.kpi_name    = k.kpi_name
    WHERE k.employee_id = p_profile_id
      AND k.is_org_level = true
      AND o.owner_id    = auth.uid()
  );
$$;

CREATE POLICY "Org KPI data owners can view their mapped employee profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.is_org_kpi_data_owner_for_profile(id));
```

(Existing `is_data_owner_for_employee` keeps working — this is a sibling policy that operates from the auth user's perspective and lets `useProfiles()` page through them too.)

### 2. Frontend save guard (`OrgKpiDataEntry.tsx`)

Before calling `bulkUpsert`, drop any `toSave` row whose `employee_id` is not present in the live `allProfiles` set, accumulate them into a single toast:

```ts
const knownIds = new Set((allProfiles ?? []).map(p => p.id));
const orphan = toSave.filter(r => r.employee_id && !knownIds.has(r.employee_id));
if (orphan.length) {
  toast({
    title: `${orphan.length} employee row(s) skipped`,
    description: 'Profile no longer exists or you lost access. Refresh and retry.',
    variant: 'destructive',
  });
}
const safeToSave = toSave.filter(r => !r.employee_id || knownIds.has(r.employee_id));
if (safeToSave.length > 0) await bulkUpsert.mutateAsync(safeToSave);
```

### 3. Visibility-mismatch banner (`OrgKpiEntryCard.tsx`)

When `scopedRows.length < employeeCount`, render an info banner above the table:

> Showing N of M mapped employees. The remaining M − N profiles are not visible to your role; values for them must be propagated rather than entered individually.

Prevents the silent dialog/table mismatch from recurring even if RLS is later restricted.

### 4. Tests + docs

- `src/test/orgKpiVisibilityParity.test.ts` — pure helper that asserts dialog `expectedCount` ≤ `scopedRows.length` OR a banner is rendered.
- `src/test/orgKpiSaveOrphanGuard.test.ts` — pure predicate `splitSavePayload(toSave, knownIds)` returns `{safe, orphans}`.
- `docs/adr/ADR-060.md` — document RLS extension + save guard.
- Append entry to `CHANGELOG_2026.md` and update `mem/features/admin/org-kpi-management-suite`.

## Out of scope (explicitly)

- We are **not** widening profile access for non-data-owners.
- We are **not** changing `propagate_org_kpi_value` or any RPC — they already operate correctly under SECURITY DEFINER.
- No UI redesign of the propagation dialog beyond the new banner.

## Approve to proceed

Once approved I will: run the migration → patch `OrgKpiDataEntry.tsx` and `OrgKpiEntryCard.tsx` → add the two unit tests → write ADR-060 → update changelog and memory.
