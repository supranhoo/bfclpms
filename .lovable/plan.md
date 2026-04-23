

## Plan — Fix "invalid input value for enum app_role: audit_lead" on Manager Approve

### Root Cause (Confirmed)

Migration `20260422062449_…` redeployed the trigger function `public.notify_on_kpi_status_change()`. Inside the `OLD.status='self_review' AND NEW.status='manager_check'` branch it runs:

```sql
SELECT ur.user_id, ...
FROM public.user_roles ur
WHERE ur.role IN ('auditor', 'audit_lead');
```

`app_role` enum values are: `admin, manager, employee, auditor, management, hr_pms, skip_level` (see `src/lib/roles.ts` — single source of truth). `audit_lead` does not exist, so Postgres errors out at execution: `invalid input value for enum app_role: "audit_lead"`. Because this trigger runs in the same transaction as the manager's Approve write, the entire approve fails — exactly the toast in the screenshot.

There is no `audit_lead` concept anywhere else in the codebase (only this one migration references it). It was a typo/leftover from drafting.

### Fix (One Migration)

Recreate `public.notify_on_kpi_status_change()` removing the bogus enum literal. Body is identical to the current function except line 89:

```sql
WHERE ur.role = 'auditor';
```

(Audit-lead notifications are out of scope; the role doesn't exist. If a future "audit lead" concept is added, it must first be added to the `app_role` enum AND to `src/lib/roles.ts` per project policy.)

### Risk & Impact Report

- **Data Impact**: None. Trigger function only — no schema/data change.
- **Workflow Impact**: Restores manager Approve → `manager_check` transition. Auditor notifications continue to fire correctly (they always did; the broken `audit_lead` row simply never matched anything before this redeploy turned it into a hard error).
- **UI/UX**: None.
- **Regression Risk**: Very low — surgical removal of an invalid enum literal. All other branches of the trigger remain byte-identical.
- **Mitigation**: Add a unit test in `src/test/bugBountyFixes.test.ts` asserting that every role string referenced by triggers/edge code exists in `ALL_APP_ROLES` from `src/lib/roles.ts`, so a future stray role name fails CI instead of production.

### Files Changed

| File | Change |
|---|---|
| `supabase/migrations/<new>.sql` (new) | `CREATE OR REPLACE FUNCTION public.notify_on_kpi_status_change()` with `ur.role = 'auditor'` |
| `src/test/bugBountyFixes.test.ts` | Regression test pinning the enum-safety contract |
| `DOCUMENTATION.md` | v2.66.7.19 — Manager Approve crash fix (audit_lead enum typo) |
| `POLICY.md` | Add §90: any role string in SQL/edge code must exist in `ALL_APP_ROLES` (`src/lib/roles.ts`) |

### Out of Scope

- No changes to the auditor notification payload, recipients list logic, or any other workflow branch.
- No changes to the `app_role` enum itself.

