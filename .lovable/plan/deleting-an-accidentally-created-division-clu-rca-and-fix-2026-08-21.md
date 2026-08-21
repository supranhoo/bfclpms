# Deleting an accidentally created division (CLU) — RCA and fix

## Assumptions
- CLU was created by mistake and must be removable from Organization Structure.
- Same behaviour is expected for every other org master (business unit, department, sub-branch, location, designation, grade, level, category, status), not only divisions.

## What the reads confirmed
- CLU (`divisions`) has: 0 business units, 0 employees, 0 KPIs, 0 org KPI values, 0 production targets, 0 incentive slabs.
- It *is* referenced by 3 rows in `access_profile_org_scope` — the org-scope rows of the access profiles **Auditor**, **Management** and **Onboarding**. That foreign key has no `ON DELETE` action, so Postgres rejects the delete with exactly the error shown.
- The delete path is a raw client delete (`supabase.from(table).delete().eq('id', id)` in `src/pages/admin/Organization.tsx`) with no pre-check and no audit record.
- The "Unused" badge only counts employees, so it says "Unused" while three access profiles still reference the row.

## 5 Whys
1. Why did the delete fail? A foreign key from `access_profile_org_scope` still points at CLU.
2. Why did rows still point at it? Access profiles (Auditor / Management / Onboarding) were scoped to all divisions, including the mistaken one.
3. Why wasn't that visible? The UI's usage badge is employee-count only and ignores every other dependency.
4. Why did the user see a raw Postgres message? The mutation surfaces `error.message` verbatim with no interpretation or remedy.
5. Why does this recur across masters? There is no single dependency-aware deletion service for org masters — each table is deleted blind from the client.

## Fix (CAPA)

### 1. Dependency preflight (server SSOT)
Add `public.org_master_delete_impact(entity_type text, entity_id uuid)` — a read-only SECURITY DEFINER RPC returning, per referencing table, the row count and whether it is auto-cleanable (access-profile scope rows) or blocking (employees, KPIs, org KPI values, targets, slabs, child BUs/departments).

### 2. Guarded delete RPC
Add `public.org_master_delete(entity_type text, entity_id uuid, cleanup_scope boolean)`:
- admin-only; re-runs the impact check inside the transaction;
- if any blocking dependency exists → raise a readable error naming the dependency and count;
- if only access-profile scope rows exist and `cleanup_scope` is true → delete those scope rows, then the master row;
- writes an immutable audit row (entity, name, removed scope rows, actor).

### 3. UI changes (Organization Structure page)
- Location: `System Settings > Organization`, the delete (trash) action of every master tab.
- Clicking delete opens the existing `ConfirmDestructiveDialog` which now first loads the impact report and shows:
  - blocking dependencies as a red list with the delete button disabled and a "reassign these first" hint;
  - cleanable dependencies as a checkbox line: "Also remove this division from 3 access profiles (Auditor, Management, Onboarding)".
- Usage badge becomes dependency-aware: "Unused" only when nothing at all references the row; otherwise "In use (3 references)" with a tooltip breakdown.
- Failure toasts map known constraint names to plain language instead of raw Postgres text.
- No layout/width change; interaction stays a single trash click → dialog → confirm. Responsive behaviour unchanged (dialog body scrolls).

### 4. Result for CLU
With the checkbox confirmed, CLU deletes cleanly and the three access profiles simply lose an obsolete scope entry (they keep all other scoped divisions).

## Risk & impact
- **Data**: only the targeted master row plus its access-profile scope rows are removed, and only on explicit confirmation. No cascade into employees, KPIs or incentive data — those stay blocking.
- **Security**: RPC is admin-gated and SECURITY DEFINER with fixed `search_path`; audit trail added.
- **Workflow**: access profiles scoped to a deleted division lose that scope line; if a profile's scope becomes empty the dialog warns, because empty scope widens/narrows visibility.
- **UI/UX**: additive dialog content; existing patterns reused.
- **Scalability**: impact query is a set of indexed counts on a single id — negligible.
- **Regression risk**: low/medium — the shared delete mutation is used by 10 tabs, so all 10 route through the same RPC and are covered by tests.
- **Rollback**: drop the two functions and revert the page; direct table deletes still work for admins.

## Tests
- Impact RPC: blocking case (division with employees/BUs), cleanable-only case (CLU shape), clean case.
- Delete RPC: refuses non-admin, refuses when blocking, succeeds with `cleanup_scope`, removes exactly the scope rows, writes audit.
- UI: dialog disables confirm when blocking, shows profile names, maps constraint error text.

## Docs
`docs/adr/ADR-308.md` (dependency-aware org master deletion), `POLICY.md` §ORG-MASTER-DELETE-DEPENDENCY-GUARD, `DOCUMENTATION.md` version bump and CHANGELOG entry.
