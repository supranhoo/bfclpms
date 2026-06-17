# Incentive Data Entry — "No employees with resolved production rates" RCA & Fix

## 1. What the screenshot shows
Upendra Singh (role = **Manager**) opens **Incentive Data Entry → Production Data → Metal Sizing → company "Saibal Kunar"** and sees:

> *No employees with resolved production rates. Configure rates in the program's "Production Rates" tab first.*

He cannot enter any tonnage.

## 2. Database facts (confirmed)
- Program **Metal Sizing** has **287 active employee mappings**.
- It has **3 company-level production rates** (incl. Saibal Kunar ₹503.39 effective 2025-10-01) — valid for June 2026.
- **69 active employees** mapped to Metal Sizing carry `profiles.company_id = Saibal Kunar`.

So the data exists. The gap is purely on the **read path** for non-admin reviewers.

## 3. Root cause
The page (`/admin/incentive-data-entry`) is gated by `menuKey: 'admin-incentive-data'`, and the supporting RLS policies on `profiles`, `production_daily_entries`, `incentive_production_rates`, and `incentive_program_mappings` all key off **`has_menu_access_override(uid, 'admin-incentive-data')`**.

`has_menu_access_override` consults **only** `menu_access_user_overrides` (per-user grants). It does **not** look at the profile-based menu-access system (`access_profiles` / `profile_menu_grants`), which is the standard way Managers / HR PMS / Auditors / Skip-Level / Functional Managers are given access to operational pages.

Consequence for any non-admin user granted Incentive Data Entry via a **menu-access profile** (not a per-user override):
- The page route check passes (frontend reads profile grants).
- The RLS `profiles` policy "Incentive data entry users can view active profiles" returns **false**.
- The user falls back to their default profile RLS (Manager → direct + skip reports only).
- For Metal Sizing × Saibal Kunar, none of the 69 mapped employees are in their reporting line → grid is empty → the misleading "Configure rates…" message appears.

Upendra himself has the per-user override (so technically RLS passes for him), but he still sees an empty grid — pointing to a **second contributing factor**: the empty-state copy is wrong when the cause is "no mapped employees visible" rather than "no rates configured", masking the underlying permission/mapping issue and making it un-diagnosable for operators.

## 4. Risk & Impact Report
| Dimension | Impact |
|---|---|
| Data | None — additive RLS only. No schema/migrations on data tables. |
| Workflow | Manager / HR PMS / Auditor / Skip-Level / Functional Manager granted Incentive Data Entry via menu-access profiles will start seeing the full mapped roster (as Admin already does). Admin behavior unchanged. |
| UI/UX | Same grid; empty-state copy becomes diagnostic (mappings vs rates vs visibility vs filter). |
| Regression | Low. `has_menu_access_override` is consumed by ~10 RLS policies (all on incentive tables). Extending it to also accept profile-based grants only widens read access for users who already have the page; it cannot tighten anything. |
| Scalability | None — same number of rows, same fetchAllPaged path. |
| Rollback | Single migration reverting `has_menu_access_override` to its current body, plus reverting one component file. |

## 5. Plan

### Step 1 — Align `has_menu_access_override` with profile-based access
New migration: redefine `public.has_menu_access_override(_user_id uuid, _menu_key text)` as `SECURITY DEFINER STABLE` returning `true` if **either**:
1. a row exists in `menu_access_user_overrides` for `(user_id, menu_key)`, **or**
2. the existing helper `has_profile_menu_access(_user_id, _menu_key, 'view')` returns true.

Keep `search_path = public`. No policy bodies change — they all keep calling `has_menu_access_override` and inherit the broader semantics.

**Verification**: run `SELECT has_menu_access_override(<manager_uuid>, 'admin-incentive-data')` for a manager who has the grant only via profile — must return true.

### Step 2 — Make the empty-state diagnostic (frontend only, `ProductionDailyGrid.tsx`)
Replace the single empty-state line with the first matching reason:

```text
mappedEmployees.length === 0         → "This program has no employee mappings. Open Program Mapping to add employees."
rates.length === 0                   → "No production rates configured. Open the 'Production Rates' tab to add a rate."
employeeRates.size === 0             → "Rates exist but none of the mapped employees resolve to a rate for {Month Year}. Check effective dates and company/dept/BU coverage."
gridEmployees.length === 0           → "No employees match the selected company filter '{companyName}'. Clear the filter or pick another company."
```

No business-logic change — pure rendering.

### Step 3 — Tests
- `supabase/functions/_shared/__tests__/menu-access.test.ts` (or extend existing menu-access tests): assert `has_menu_access_override` returns true for a user holding the key via profile-based grant only.
- `src/components/incentive/__tests__/productionDailyGridEmptyStates.test.tsx`: render four scenarios (no mappings / no rates / no resolved / filter empty) and assert the correct copy for each.

### Step 4 — Docs / Policy
- **POLICY.md** — add an entry under "Incentive Module Access" stating that **all** incentive-data RLS gates accept both per-user overrides and profile-based grants, and that `has_menu_access_override` is the canonical SQL hook for this rule.
- **DOCUMENTATION.md** — Version History entry describing the alignment + the diagnostic empty-state.
- Update memory `mem://features/admin/menu-setting` and `mem://architecture/security/access-profile-rls-alignment.md` to reflect the unified semantics.

## 6. Out of scope
- Rewriting other RLS helpers (e.g. `has_report_access_override`) — separate exercise.
- Any change to write paths, rate cascade, or compute edge function.
- Backfilling per-user overrides for existing profile-granted users.

## 7. Rollback
- Revert the new migration (single CREATE OR REPLACE FUNCTION).
- Revert the `ProductionDailyGrid.tsx` empty-state diff and the two test files.
No data writes, no destructive changes.
