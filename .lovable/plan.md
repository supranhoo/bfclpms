## Goal
Replace the fragile "3-hop ancestor" BU Head logic and the cycle-global HR Finalization with **hierarchy-derived heads** that are stored on the BU and on the HR department, with a UI to recalibrate or override them manually.

## Assumptions
- "BU Head" = the person at the top of the reporting chain among all active employees whose department belongs to that Business Unit.
- "HR Head" = the person at the top of the reporting chain among active employees in the HR department (`departments.code`/`name` matching HR — to be confirmed; fallback: admin picks the HR department in settings).
- Auto-resolution rule: among active employees in scope, pick the one whose `reporting_manager_id` is NULL or points outside the scope. If multiple candidates, prefer highest `levels.rank`; tie-breaker = earliest `doj`. If still ambiguous → flag for manual selection.
- Manual override always wins over auto-resolution.
- Change is **additive** — old `bu_head_id` snapshot column on `annual_review_instances` stays; we just change *how it gets populated* at seed time and add an admin recompute action.

## Risk & Impact Report
- **Data Impact**: Adds `head_user_id` + `head_source` ('auto'|'manual') to `business_units`; adds `hr_head_user_id` + a configurable `hr_department_id` to a new `org_head_config` row (single row, admin-managed). No destructive changes. Existing `annual_review_instances.bu_head_id` / `hr_id` snapshots are untouched for in-flight cycles.
- **Workflow Impact**: New seeds (and re-seeds) resolve BU/HR from these fields instead of the 3-hop ancestor / cycle-global HR. Per-instance reassignment via existing `annual_review_assignment_overrides` continues to work and still wins.
- **UI/UX Impact**: New "Org Heads" panel in Admin Settings → Organization. BU table gets a "Head" column with inline change + "Recalculate" button. HR section gets HR department picker + HR head field + Recalculate.
- **Regression Risk**: Low if we gate the new resolver behind seeding only and leave existing instances alone. Annual Review seeder is the only consumer that changes.
- **Scalability**: Resolver is O(employees-in-BU) per BU, run on demand (admin click) or at seed time — not on every read.
- **Mitigation**: Feature is additive; old `bu_head_id`/`hr_id` columns retained; per-instance override path unchanged; resolver covered by unit tests with realistic org trees (flat BU, deep BU, BU with multiple top-level nodes, HR with vacancies).

## Plan

### 1. Schema (migration)
- `ALTER TABLE business_units ADD COLUMN head_user_id uuid REFERENCES profiles(id), ADD COLUMN head_source text NOT NULL DEFAULT 'auto' CHECK (head_source IN ('auto','manual')), ADD COLUMN head_updated_at timestamptz, ADD COLUMN head_updated_by uuid;`
- New table `org_head_config` (single-row, admin-managed): `hr_department_id uuid`, `hr_head_user_id uuid`, `hr_head_source text`, audit columns. Full GRANTs + RLS (admin/hr_pms write, authenticated read).
- Audit log entries via existing `system_audit_logs`.

### 2. Resolver SSOT
- `src/lib/orgHeads/resolveHead.ts` — pure function `resolveTopOfScope(employees, edges)` returning the candidate(s) + reason.
- Mirror in PL/pgSQL: `public.resolve_bu_head(bu_id uuid)` and `public.resolve_hr_head()` SECURITY DEFINER functions used by both the admin "Recalculate" RPC and the annual-review seeder.

### 3. RPCs
- `set_bu_head(bu_id, user_id, reason)` — admin/hr_pms only, sets `head_source='manual'`, audit-logged.
- `recalculate_bu_head(bu_id)` — sets `head_source='auto'`, recomputes via resolver.
- `set_hr_head(user_id, reason)` / `recalculate_hr_head()` / `set_hr_department(dept_id)` — same pattern on `org_head_config`.

### 4. Annual Review integration
- `seedInstancesForCycle()` (and re-seed path) reads `business_units.head_user_id` for `bu_head_id`, and `org_head_config.hr_head_user_id` for `hr_id`, replacing the 2-hop/3-hop ancestor walk and the cycle-global HR argument. Fall back to NULL with a seed warning surfaced in the Cycles tab if a BU has no head or HR is unset.
- `getEffectiveReviewer()` precedence is unchanged: instance override → snapshotted column.

### 5. Admin UI
- **Admin → Settings → Organization → Business Units**: add "Head" column with avatar/name + "Auto/Manual" badge + inline "Change…" (employee picker scoped to that BU) + "Recalculate" button.
- **New "HR Finalization" card** in the same section: HR department picker, current HR head, Change/Recalculate buttons, last-updated meta.
- **Annual Review Admin → Progress**: keep existing per-instance "Reassign reviewer" dialog as the in-flight override path. No change.

### 6. Tests + Mocks
- `resolveHead.test.ts` — flat BU (single node), deep BU (5 levels), BU with two roots (ambiguous → flagged), BU with only inactive employees, HR with vacancy.
- `setBuHead.rpc.test.ts` + `recalculateBuHead.rpc.test.ts` — admin-only, audit row written, source flips correctly.
- `seedInstances.headResolution.test.ts` — seeder reads from new fields and ignores 3-hop ancestor.

### 7. Documentation
- `src/modules/annual-review/DOCUMENTATION.md` — "Reviewer chain resolution" section rewritten.
- `src/modules/annual-review/POLICY.md` — new clause: BU/HR heads are derived from org structure, overridable, audit-logged.
- `mem://features/annual-review/overview.md` and `mem://architecture/database/per-employee-workflow-resolution` updated.

### 8. Rollback
- Revert seeder to ancestor walk; drop `org_head_config`; drop new columns on `business_units`. Existing snapshots on instances are unaffected.

## UI Changes (explicit)
- **Location**: `/admin/settings?section=organization`.
- **Visual**: New "Heads" column in Business Units table; new "HR Finalization" card below it. Each row shows head name + small "Auto"/"Manual" badge + kebab menu (Change…, Recalculate, View history).
- **Interaction**: Change opens an employee picker scoped to the BU/HR dept; requires reason ≥3 chars; on save, table refreshes and toast confirms.
- **Responsive**: Table collapses to stacked cards <768px; head cell becomes a labeled row.

## Open Question (please confirm before build)
1. How should we identify the **HR department**? Options:
   - (a) Admin picks it explicitly in the new "HR Finalization" card (most flexible, recommended).
   - (b) Auto-detect by `departments.code = 'HR'` or name match (fragile across companies).
2. For multi-company tenancy, should BU heads and HR head be **scoped per `company_id`** (i.e. one HR head per company), or one global HR head? I will assume **per company** unless told otherwise.