

## RCA: "Computation failed — Edge Function returned a non-2xx status code" (403)

### Root Cause

The `compute-monthly-incentives` edge function (line 28-35) enforces RBAC by checking the `user_roles` table for `admin` or `hr_pms` roles only:

```typescript
const { data: roles } = await supabase
  .from('user_roles')
  .select('role')
  .eq('user_id', user.id)
  .in('role', ['admin', 'hr_pms']);
if (!roles || roles.length === 0) {
  return new Response(..., { status: 403 });
}
```

The user triggering the compute (likely Jitendra Bharti — 101715, or another user with `reports-incentive` / `admin-incentive` menu override) has role `manager` in `user_roles`. The function does not check `menu_access_user_overrides` for `admin-incentive` or `reports-incentive`, so it returns **403 Forbidden**.

| User | Employee Code | `user_roles.role` | Menu Overrides | Can Compute? |
|------|--------------|-------------------|----------------|--------------|
| Jitendra Bharti | 101715 | manager | `admin-incentive`, `admin-incentive-data`, `reports-incentive` | NO (403) |
| Upendra Singh | 201091 | manager | `admin-incentive-data`, `reports-incentive` | NO (403) |
| Sandeep Kumar | 200291 | (unknown) | `admin-incentive-data`, `reports-incentive` | NO (403) |

### Fix

Update the RBAC check in `compute-monthly-incentives` to also allow users with `admin-incentive` menu override. The `reports-incentive` key should grant **read-only** access (view/export), NOT compute — computation is a write operation that should require `admin-incentive`.

**Change in `supabase/functions/compute-monthly-incentives/index.ts` (lines 28-35):**

After the `user_roles` check fails, add a fallback check against `menu_access_user_overrides` for the `admin-incentive` menu key:

```typescript
// Existing role check
const { data: roles } = await supabase
  .from('user_roles')
  .select('role')
  .eq('user_id', user.id)
  .in('role', ['admin', 'hr_pms']);

if (!roles || roles.length === 0) {
  // Fallback: check menu override for admin-incentive
  const { data: overrides } = await supabase
    .from('menu_access_user_overrides')
    .select('id')
    .eq('user_id', user.id)
    .eq('menu_key', 'admin-incentive')
    .limit(1);
  if (!overrides || overrides.length === 0) {
    return new Response(JSON.stringify({ error: 'Admin, HR PMS, or Incentive Admin access required' }), 
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}
```

### Files to Change

| File | Change |
|------|--------|
| `supabase/functions/compute-monthly-incentives/index.ts` | Add menu override fallback in RBAC check (lines 28-35) |
| `POLICY.md` | Document that `admin-incentive` menu override grants compute access |
| `DOCUMENTATION.md` | Record RCA and fix |

### Risk Assessment
- **Data Impact**: None — no schema changes
- **Security**: Controlled — only `admin-incentive` override holders gain compute access; `admin-incentive-data` (data entry only) and `reports-incentive` (read-only) do NOT get compute rights
- **Regression Risk**: None — additive check, existing admin/hr_pms users unaffected

