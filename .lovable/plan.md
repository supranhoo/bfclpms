# Multi-Role Assignment — Discussion & Plan

## Short answer to your questions

**1. "Seems only 1 role can be granted"** — that's only how the UI currently *looks*. The database already supports many-to-many.

- Table `iac_user_role_assignments` has a composite unique key on `(user_id, role_id, scope_type, scope_id)`. So a single user can hold **as many rows as needed** — one per role (and per scope).
- The "Grant" form in `UserAccessSheet` is a single dropdown + button. After you grant, the row appears under "Current assignments" and the dropdown clears so you can pick the **next** role. You can repeat this N times.
- So an employee who is *Employee + Manager (PMS) + Safety Officer (Safety module)* would end up with 3 rows in `iac_user_role_assignments`, each pointing to a different role in `iac_roles`.

**2. How multi-role actually resolves at runtime**

- `has_role(user, role)` / capability checks union across **all** active (non-expired) assignments.
- Module shells (PMS, Safety, HR, Incentive, Reports) each look up their own role family. A user with PMS-Manager + Safety-Officer sees both module tiles on the hub and gets the union of menu items via the Profile-Based Menu Access layer.
- Scope (`global` vs `department`/`location`/etc.) lets you say e.g. *"Manager for Dept A only, Auditor globally"*.

So functionally nothing is missing — but the **UX makes it look single-role**, which is exactly the friction you hit.

---

## What I propose to change (UI only, no schema)

### A. Make "multi-role" obvious in the Roles tab

Rework `RolesPanel` inside `src/components/admin/UserAccessSheet.tsx`:

1. **Multi-select grant** instead of a single dropdown.
  - Replace the single `Select` with a searchable multi-select (checkbox list grouped by `module`: PMS / Safety / HR / Incentive / Admin).
  - One "Grant N roles" button issues N `grantRole` calls in sequence (sequential, not parallel, so the existing edge-function audit log stays clean).
  - Show per-row success/fail toast summary at the end.
2. **Current assignments grouped by module** with a count badge:
  ```
   PMS (2)        [Manager — Dept A]  [Employee — Global]
   Safety (1)    [Safety Officer — Plant 1]
   HR (0)
  ```
   Each chip has a small ✕ to revoke. Expired assignments shown dimmed.
3. **Scope picker** next to each role at grant time (default `global`, dropdown for `department` / `location` / `company` when the role supports scoping). Today the UI hard-codes `global`.
4. **Quick presets** for the common combos you described, e.g.:
  - *"Employee + Line Manager"* (PMS-Employee + PMS-Manager)
  - *"Manager + Safety Officer"* (PMS-Manager + Safety-Officer)
  - *"Full-stack reviewer"* (Manager + Auditor + Skip-Level)
   Presets are just client-side bundles of role IDs — no new tables.
5. **Conflict / redundancy hints** (non-blocking):
  - Warn if granting a role that's a strict subset of one already held (e.g. Employee when Manager already grants the same caps).
  - Warn on opposite-side conflicts (e.g. Auditor + Reviewee on the same scope) — purely advisory.

### B. Mirror the same multi-select in two more places

- **User-create dialog → "Next steps" panel** (already planned step 4 from the earlier work): replace the single-role grant with the same multi-select component so a new hire can be stamped with all needed roles in one go.
- **Identity & Access Console → PersonDrawer**: already reuses `UserAccessSheet`, so it gets the upgrade for free.

### C. Bulk path (optional, only if you want it now)

The IAC Bulk Importer already supports many rows per user via CSV (`user_id, role_id, scope_type, scope_id`). I'll add a one-line note in the Roles tab: *"Need to assign roles to many users at once? Use Bulk Importer →"* deep-linking to `/admin/iac?tab=bulk`.

---

## Risk & Impact

- **Data impact:** none. Schema already supports it; we're only changing how the UI calls the existing `grantRole` mutation.
- **Workflow impact:** users may legitimately end up with more roles than before. Capability resolution is already a UNION, so this is additive — no breaking change to authorization.
- **RLS:** untouched. Admin-only writes to `iac_user_role_assignments` remain.
- **Regression risk:** low. The single change inside `UserAccessSheet` is isolated; IAC Console picks it up via the shared component.
- **Mitigation:** add a unit test for the "grant N roles in one click" handler (success + partial failure paths) and snapshot the grouped-by-module render.

---

## Open questions before I build

1. **Scope picker** — do you actually need per-role scoping in the UI right now (department / location / company), or is `global` sufficient for v1 and we ship scope-picker in a follow-up?
2. **Presets** — do you want me to define the preset bundles, or will you supply the list of "common role combinations" used at BFCL?
3. **Conflict warnings** — do you want hard blocks (e.g. cannot be Auditor and Reviewee of the same dept) or only soft warnings?

Once you answer those (or say "use sensible defaults"), I'll implement A + B in a single pass.  
   
use sensible defaults