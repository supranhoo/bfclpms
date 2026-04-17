
## RCA: Employee count capped at 1000 after import

### What the user sees
- Importing 1,653 rows. ~900+ already inserted.
- Previous employee count: 862. Expected post-import: ~1,500+.
- UI shows exactly **1,000**. Suspiciously round.

### Root cause (high confidence)
This is the classic **Supabase PostgREST default row cap of 1,000 per query** — explicitly called out in our project rules ("Query Limits — Supabase has a default limit of 1000 rows per query. When debugging 'missing data' issues, check if you're hitting this limit before assuming other bugs.")

Where it's biting us:
- The User Management page (`src/pages/admin/UserManagement.tsx`) fetches `profiles` with a single `.select('*')` (or similar) — no `.range()` pagination, no batched fetch.
- PostgREST silently returns the first 1,000 rows. The list and the displayed count both derive from the same truncated array → count = `profiles.length` = 1000.
- Other places that read the full employee list show the same symptom (e.g., dropdowns sourced from the same hook).

The import itself is fine — rows ARE landing in the DB. We just can't *see* past row 1,000 from the client.

### Verification step (during implementation, not now)
Before patching, confirm with a single SELECT against `profiles` (count exact) — if DB says >1000 and UI says 1000, root cause is locked.

### Fix — two-part, both required

**Part A — Show the true count (cheap, immediate)**
Replace any `profiles.length` with a `head: true, count: 'exact'` query:
```ts
const { count } = await supabase
  .from('profiles')
  .select('id', { count: 'exact', head: true })
  .eq('is_active', true);
```
Use this for: header badge ("N employees"), stats cards, and any "total" display.

**Part B — Actually load all employees (batched fetch)**
Per `mem://architecture/data-import-engine` and `mem://infrastructure/resource-and-performance-optimization`, use the **standard batched fetch helper** (1000-row pages, loop until short page):
```ts
async function fetchAllProfiles(filters) {
  const PAGE = 1000;
  let from = 0, all = [];
  while (true) {
    const { data, error } = await supabase
      .from('profiles').select('*')
      .order('employee_code')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}
```

Apply Part B to:
- `useUserManagement` / `useProfiles` (or whichever hook the User Management page calls).
- Any other hook that materialises the full employee list (e.g., `ManagerCombobox` source, KPI matrix employee list) — audit and patch where row count can exceed 1,000.

Combobox-style consumers (Manager picker, OrgFilterCombobox-driven user pickers) should already be search-driven; if they materialise all profiles client-side, switch them to the batched fetch too — otherwise selecting any user beyond the first 1,000 is impossible.

### Files Touched (confirmed at edit time)
- `src/hooks/useUserManagement.ts` (or equivalent hook backing `UserManagement.tsx`)
- `src/pages/admin/UserManagement.tsx` — wire the exact-count badge
- `src/lib/fetchAll.ts` (new, tiny shared helper) — single batched-fetch utility reused everywhere
- Audit & patch any other hook that does `from('profiles').select('*')` without pagination (e.g., `useProfiles`, `useEmployees`, manager source hooks)
- `DOCUMENTATION.md` Version History + note in `mem://infrastructure/resource-and-performance-optimization` that profile lists must use `fetchAll`

### Risk & Impact
| Area | Impact |
|---|---|
| Data | None. Read-only fix. |
| Workflow | None. |
| UI/UX | Counts and lists finally reflect reality. Slight extra latency (~1 extra round trip per 1,000 rows) on User Management — acceptable, gated to admin pages. |
| Regression | Low. Centralised helper means one place to maintain. Other hooks not yet touched continue to work as before until audited. |
| Mitigation | Use `count: 'exact', head: true` for badges so the count is correct even if list rendering is virtualised/paged later. Add a unit test for `fetchAll` covering the "exactly 1000 rows" boundary (the trickiest edge case — must NOT stop after first page). |

### Out of Scope
- Server-side pagination UI (page numbers / infinite scroll) — separate UX project; not needed to unblock the current import.
- Refactoring every hook in the codebase — only those that materialise the full employee list.
- Changing the import pipeline (it's working correctly).
