
# Two Separate Issues — Both Diagnosed and Ready to Fix

---

## Issue 1: Vivek Sees Low Pending Count in HR PMS

### Root Cause: RLS Policies on `kpis` and `review_submissions` Use `roles: {public}` Instead of `{authenticated}`

Looking at the database RLS policies:

```
HR PMS can view all KPIs  →  roles: {public}
HR PMS can update KPI status during review  →  roles: {public}
HR PMS can view all submissions  →  roles: {public}
HR PMS can update submissions during review  →  roles: {public}
```

This is the critical problem. **Supabase RLS policies on `{public}` only apply to anonymous (unauthenticated) requests** — not to logged-in users. When Vivek logs in and makes requests, he is authenticated (`{authenticated}` role), and these `{public}` policies **do not apply to him**.

This means:
- Vivek has the `hr_pms` user role in `user_roles`
- The `has_role(auth.uid(), 'hr_pms')` function returns `true` for him
- BUT the SELECT policy is on `{public}` — Vivek is `{authenticated}`, so this policy is **skipped entirely**
- He falls through to only the policies that match `{authenticated}` — which includes "Employees can view their own KPIs" (only his own KPI) — showing almost no data

### Why Admin Sees 161 but Vivek Sees Very Few

- Admin's RLS policy uses `roles: {authenticated}` — so it applies correctly
- Vivek's HR PMS policies are on `{public}` — they never fire for a logged-in user
- Vivek only sees KPIs he owns as an employee (his own record)

### Proof from the Database

Compare:
```
Admins and auditors can view all KPIs  →  roles: {authenticated}  ← WORKS
HR PMS can view all KPIs              →  roles: {public}          ← BROKEN
Management can view all KPIs          →  roles: {public}          ← ALSO BROKEN
Skip-level managers can view reports  →  roles: {public}          ← ALSO BROKEN
```

The `{public}` vs `{authenticated}` mismatch is a systemic RLS bug affecting HR PMS, Management, and Skip-Level roles. It explains why these reviewer roles have consistently lower data visibility than expected.

---

## Issue 2: Vivek Can't See the Org KPI Data Entry Option for "Adherence to Manning Norms"

### Confirmed: Vivek IS a Data Owner

From the database, Vivek (`ca3897d0`) is correctly listed in `org_kpi_data_owners` for "Adherence to Manning Norms." So the assignment is correct.

### Root Cause: `DataOwnerRoute` Works — But the **Page-Level Filter** Excludes Him

The `OrgKpiDataEntry` page at line 91:
```typescript
const { ownershipMap, isAdmin } = useOrgKpiOwnershipMap();
```

And at line 126–133:
```typescript
const ownershipFilteredKpis = useMemo(() => {
  if (!orgLevelKpis) return [];
  if (isAdmin) return orgLevelKpis;
  return orgLevelKpis.filter(kpi => {
    const ownerKey = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}`;
    return ownershipMap.get(ownerKey)?.canEdit === true;
  });
}, [orgLevelKpis, isAdmin, ownershipMap]);
```

The `orgLevelKpis` comes from `useOrgLevelKpisWithEmployees()` → `useOrgLevelKpis()`, which queries **the `kpis` table** directly:
```typescript
await supabase.from('kpis').select(...).eq('is_org_level', true)
```

Because of the RLS bug from Issue 1, **Vivek cannot read from the `kpis` table** (the HR PMS policy is on `{public}`, so it doesn't fire for authenticated users). The `orgLevelKpis` array returns **empty** for Vivek — not because he's not a data owner, but because the underlying query returns no rows!

Since `orgLevelKpis` is empty, the ownership filter produces an empty list too, and no KPI cards appear on the page.

### Why Both Issues Have the Same Root Cause

Both problems trace back to the same systemic RLS bug: policies for `hr_pms`, `management`, and `skip_level` roles were created with `roles: {public}` instead of `roles: {authenticated}`. This means:
1. Vivek can't see KPIs in the HR PMS review panel (Issue 1)
2. Vivek can't see Org KPI data entry cards — they rely on the same `kpis` table query (Issue 2)

---

## The Fix: Update RLS Policies from `{public}` to `{authenticated}`

The following policies need to be updated in a single SQL migration:

### Policies to Fix on `kpis` table

| Policy | Current Role | Correct Role |
|---|---|---|
| HR PMS can view all KPIs | `public` | `authenticated` |
| HR PMS can update KPI status during review | `public` | `authenticated` |
| Management can view all KPIs | `public` | `authenticated` |
| Management can update KPI status during review | `public` | `authenticated` |
| Skip-level managers can view reports KPIs | `public` | `authenticated` |
| Skip-level managers can update reports KPI status | `public` | `authenticated` |
| Users can update their own KPIs | `public` | `authenticated` |

### Policies to Fix on `review_submissions` table

| Policy | Current Role | Correct Role |
|---|---|---|
| HR PMS can view all submissions | `public` | `authenticated` |
| HR PMS can update submissions during review | `public` | `authenticated` |
| Management can view all submissions | `public` | `authenticated` |
| Management can update submissions during review | `public` | `authenticated` |
| Skip-level managers can view reports submissions | `public` | `authenticated` |
| Skip-level managers can update reports submissions | `public` | `authenticated` |

### Migration SQL

```sql
-- Fix kpis table RLS policies
ALTER POLICY "HR PMS can view all KPIs" ON public.kpis TO authenticated;
ALTER POLICY "HR PMS can update KPI status during review" ON public.kpis TO authenticated;
ALTER POLICY "Management can view all KPIs" ON public.kpis TO authenticated;
ALTER POLICY "Management can update KPI status during review" ON public.kpis TO authenticated;
ALTER POLICY "Skip-level managers can view reports KPIs" ON public.kpis TO authenticated;
ALTER POLICY "Skip-level managers can update reports KPI status" ON public.kpis TO authenticated;
ALTER POLICY "Users can update their own KPIs" ON public.kpis TO authenticated;

-- Fix review_submissions table RLS policies
ALTER POLICY "HR PMS can view all submissions" ON public.review_submissions TO authenticated;
ALTER POLICY "HR PMS can update submissions during review" ON public.review_submissions TO authenticated;
ALTER POLICY "Management can view all submissions" ON public.review_submissions TO authenticated;
ALTER POLICY "Management can update submissions during review" ON public.review_submissions TO authenticated;
ALTER POLICY "Skip-level managers can view reports submissions" ON public.review_submissions TO authenticated;
ALTER POLICY "Skip-level managers can update reports submissions" ON public.review_submissions TO authenticated;
```

---

## What Changes After This Fix

| Before | After |
|---|---|
| Vivek sees ~2-4 KPIs (only his own) in HR PMS panel | Vivek sees all 161 pending KPIs correctly |
| Vivek sees blank page for Org KPI Data Entry | Vivek sees all his assigned KPIs (Adherence to Manning Norms, etc.) |
| Management users potentially have same issue | Management users see correct data |
| Skip-level reviewers potentially affected | Skip-level review works correctly |

---

## Files to Modify

| File | Change |
|---|---|
| Database migration | Fix 13+ RLS policies from `{public}` to `{authenticated}` on `kpis` and `review_submissions` tables |
| `DOCUMENTATION.md` | Version bump to 1.45.23, document the RLS policy fix |

No frontend code changes are needed — this is purely a database security configuration fix.
