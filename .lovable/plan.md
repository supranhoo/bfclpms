

## Fix: Allow `reports-incentive` Menu Override to Authorize Edge Functions

### Problem
A Manager/Employee with `reports-incentive` menu override can **see** the Incentive Report page but gets a 403 when clicking **Compute** or **Retroactive Detection**. The edge functions only check for `admin-incentive` override — a separate admin-section key that isn't visible or intuitive for report-level users.

### Solution
Update the shared auth helper to accept **multiple menu keys** instead of a single key. The edge functions will pass both `admin-incentive` and `reports-incentive`, so a user with **either** override can execute the function.

### Changes

**File: `supabase/functions/_shared/incentive-auth.ts`**
- Change `menuKey: string` parameter to `menuKeys: string | string[]`
- Normalize to array internally
- Update the Tier 2 query to use `.in('menu_key', menuKeysArray)` instead of `.eq('menu_key', menuKey)`

**File: `supabase/functions/compute-monthly-incentives/index.ts`**
- Change line 19 from:
  `checkIncentiveAccess(supabase, ..., 'admin-incentive')`
  to:
  `checkIncentiveAccess(supabase, ..., ['admin-incentive', 'reports-incentive'])`

**File: `supabase/functions/detect-retroactive-incentive-changes/index.ts`**
- Same change — pass both keys

**File: `POLICY.md`**
- Update §73 to document that edge functions accept multiple menu keys

**File: `DOCUMENTATION.md`**
- Record the fix

### Access Matrix After Fix

| User Role | Override | Compute? | Detect? |
|---|---|---|---|
| admin | N/A | YES (role) | YES (role) |
| hr_pms | N/A | YES (role) | YES (role) |
| manager | `reports-incentive` | YES | YES |
| manager | `admin-incentive` | YES | YES |
| employee | `reports-incentive` | YES | YES |
| employee | none | NO | NO |

### Risk Assessment
- **Data Impact**: None — no schema changes
- **Security**: Maintained — access still requires explicit menu override grant by admin
- **Regression**: None — existing `admin-incentive` overrides continue to work; additive only

