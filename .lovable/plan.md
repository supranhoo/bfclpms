## Goal
Add a "Bulk Grant Access" action to **/admin/users** so an admin can pick one or many employees and grant them one or more roles (PMS + Safety + other module roles in the IAC registry) in a single confirmed action — without opening each user individually or editing a CSV.

## Where it lives
- New button **"Bulk Grant Access"** in the User Management toolbar (`src/pages/admin/UserManagement.tsx`), next to existing actions.
- Row-level multi-select checkboxes on the user table (reuse the same selection state for this and any future bulk action).
- New dialog component `src/components/admin/BulkGrantAccessDialog.tsx`.

## Dialog UX (max-w-3xl, tabbed-free, single screen)

```text
┌─ Bulk Grant Access ─────────────────────────────┐
│ Selected users: 12   [ + Add more ▾ ]           │
│ ── chips: Vedant (101966) ✕  Rakesh ✕  … +9     │
│                                                 │
│ Grant these roles:                              │
│ ☐ PMS · Employee        ☐ PMS · Manager         │
│ ☐ PMS · HR PMS          ☐ PMS · Auditor         │
│ ☐ Safety · Viewer (Hub) ☐ Safety · Officer      │
│ ☐ Safety · HSE Manager  ☐ Safety · Admin        │
│ (roles loaded dynamically from IAC registry)    │
│                                                 │
│ Scope: ● Global  ○ BU/Dept (Phase 2)            │
│ Expires: [ none ▾ ]                             │
│                                                 │
│ Preview: 12 users × 2 roles = 18 new grants,    │
│          6 already exist (skipped)              │
│                                                 │
│           [ Cancel ]  [ Grant access ]          │
└─────────────────────────────────────────────────┘
```

Key behaviours:
1. **Selection sources** — pre-fills from rows ticked in the User Management table. "Add more" opens a searchable picker (reusing `MultiSelectFilter` pattern) so the admin can extend the set without closing the dialog.
2. **Role list is dynamic** — pulled via `useIacRoles()` so any role added later (e.g. Incentive Admin) shows up automatically. Roles grouped by module label.
3. **Diff preview before commit** — for each (user × role) pair, check `iac_user_role_assignments`; show `toGrant`, `alreadyHas`, and any `blocked` (inactive users unless override).
4. **Single apply** — reuses `useApplyBulk` / `applyMatrixDiff` so the existing audit row (`assignment.bulk_matrix_apply` style) and 500-row batching are preserved. No new DB code.
5. **Result panel** — on completion, toast + inline summary "Granted 18, skipped 6, failed 0". Failures listed with reason.
6. **Inactive users** — blocked by default with a checkbox override (mirrors IAC behaviour).
7. **Safety side-effect note** — granting any Safety role auto-unlocks the Safety Hub tile (already enforced by `has_safety_module_access`). Dialog shows a small inline hint when a Safety role is ticked.

## Table changes (UserManagement.tsx)
- Add `selectedIds: Set<string>` state.
- Add a header checkbox + per-row checkbox column.
- Toolbar shows "N selected" + **Bulk Grant Access** button (disabled when N = 0, but the dialog can also be opened with 0 and users added inside).

## Files

**New**
- `src/components/admin/BulkGrantAccessDialog.tsx` — dialog UI + diff preview + apply call.
- `src/test/admin/bulkGrantAccess.test.ts` — unit tests for diff computation (toGrant / alreadyHas / blocked-inactive) and chunked apply.

**Edited**
- `src/pages/admin/UserManagement.tsx` — add row selection, toolbar button, mount dialog.
- `src/hooks/useIac.ts` — small helper `useGrantManyAssignments(rows)` that wraps `applyBulk` for the (user, role, scope) shape this dialog produces (no new server endpoint needed).
- `mem/architecture/security/identity-access-console.md` — append a "Bulk Grant Dialog" note pointing here, so the matrix CSV and the dialog stay documented as siblings.

## What this does NOT change
- No DB migration. No edge function. No RLS change. Server contract is the existing IAC `applyBulk` path.
- No changes to per-user Edit dialog, Safety Users page, or single-grant flows — those keep working as-is.
- Scoped (BU / Department) grants stay in the Advanced long-form CSV; this dialog is global-scope only for v1.

## Risk & Impact
- **Data**: writes only to `iac_user_role_assignments` via the same path the IAC Bulk Matrix uses; same audit row, same batching. No schema change.
- **Workflow**: purely additive. Existing single-grant and CSV flows untouched.
- **UI**: adds a checkbox column + toolbar button to one page; dialog is self-contained.
- **Regression**: low. Mitigation = unit tests for diff logic and re-using `useApplyBulk` (already covered by `bulkCsv.test.ts`).

## Open question before I build
Two small choices — please confirm:
1. **Default role on first open** — should "PMS · Employee" be pre-ticked (most common case for new hires), or always start empty?
2. **Where the button sits** — primary toolbar button next to "Add User", or under a "Bulk actions ▾" menu (cleaner if more bulk actions land later)?
