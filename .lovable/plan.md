## Goal

Make the Form Mapping audience picker able to (a) turn the current filter selection into an explicit employee list with one click, and (b) safely handle employees who are already seeded on an older template so they actually end up on the new template — not just for future seeds.

Today, filters and the explicit ID list are two independent inputs, and the seeder never re-points an employee once an instance exists. This plan closes both gaps without a schema migration.

---

## Part 1 — "Resolve filters → add to list" action

In `AudienceEmployeePickerSection.tsx`, add a secondary button next to "Copy from another template":

**"Add everyone matching current filters"**

Flow:
1. Take the current draft `AssignmentFilters` from the card (roles, grades, levels, BUs, departments, sub-units, grade bucket, has-KRAs) — **excluding** `employee_ids` / `employee_ids_mode`.
2. Call a new service `resolveFilterToEmployeeIds(cycleId, filters)`:
   - Fetches active profiles via `fetchAllPaged` (POLICY §94, mirrors `useActiveEmployeesForCopy`).
   - Runs each profile through the existing `matchesFilters` SSOT in `src/services/annualReview/formMapping.ts` so preview and seeder stay identical.
   - Returns `{ id, full_name, employee_code }[]`.
3. Open a confirm dialog: "This will add N employees to the explicit list. The filter rules will be cleared so the list is the sole source (mode auto-switches to Only these people). Proceed?"
4. On confirm: merge into `employee_ids` (dedup), set `employee_ids_mode = 'only'`, clear the facet filters on the draft, show a toast with the resolved count and a snapshot timestamp in helper text ("Snapshot taken from filters on <date> — future joiners/leavers will NOT auto-update").

This gives the user the "materialise filter into a frozen list" behaviour they described, without changing how filter-only rules work for people who prefer live rules.

---

## Part 2 — Handle overlap with an existing template's seeded instances

Two separate cases, both need to work:

### 2a. Save-time overlap detection (already partly in place)
When saving a Form Mapping rule whose audience resolves to employees already seeded on a **different** template in the same cycle:

- Compute overlap via `listEmployeesForTemplateInCycle` across every other rule's template in the cycle (or a single RPC `find_seeded_conflicts(cycle_id, employee_ids[])`).
- Show a blocking dialog listing: employee, current template, current stage.
- Offer three choices:
  1. **Save mapping only** — new rule wins for future seeding; existing instances stay on old template. (Today's behaviour.)
  2. **Save mapping and reassign eligible instances now** — for each overlapping employee whose current instance is in `not_started` or `pending_self`, call the existing `set_annual_review_template_override` RPC with the new `template_id` and a system-generated reason (`"Reassigned via Form Mapping rule <rule name>"`). Skip and report any instance already past `pending_self`.
  3. **Cancel** — don't save.

No new RPC required — reuse the per-employee override path documented in `mem/features/annual-review/per-employee-template-override.md`. That's exactly what it was built for and it's already audit-logged (`annual_review.template_override_set`), stage-gated, and RLS-safe.

### 2b. Post-save "sync now" action on the mapping card
Add a "Sync assignments" button on each mapping row that re-runs the same overlap check on demand, so an admin who saved earlier can still pull eligible employees over after the fact. Same dialog, same RPC, same audit trail.

---

## Technical details

**New service functions** (`src/services/annualReview/formMapping.ts`):
- `resolveFilterToEmployeeIds(cycleId, filters)` — filter-only preview, no writes.
- `findSeededConflicts(cycleId, employeeIds, excludeTemplateId)` → `Array<{ employee_id, full_name, template_id, template_name, overall_status }>`.
- `bulkReassignViaOverride(items, reason)` — thin loop over `set_annual_review_template_override`, per-row error isolation (same shape as `bulkSetTemplateOverrides`).

**UI**:
- `AudienceEmployeePickerSection.tsx` — add "Add everyone matching current filters" button + confirm dialog.
- `AnnualReviewFormMapping.tsx` — pre-save overlap check; new `SyncAssignmentsDialog` component; per-row "Sync assignments" button.

**No schema changes.** All new behaviour rides on `template_override_id` + existing RPCs.

**Precedence unchanged.** Rule priority (`minExisting - 1`) still governs future seed runs; overrides govern already-seeded rows.

---

## Risk & Impact

- **Data**: Only `template_override_id` writes, gated by stage (`not_started` / `pending_self`) and role (admin / hr_pms) at the RPC level. Existing responses, scores, and reviewer chains are untouched.
- **Workflow**: "Resolve filters" clears facet filters on the draft — surfaced clearly in the confirm dialog. Bulk reassign only touches eligible instances and reports skips.
- **UI/UX**: Two additive buttons; no layout churn.
- **Regression**: `matchesFilters` remains SSOT for both preview and seeder — reused, not forked.
- **Rollback**: Remove the two buttons and the three service helpers; DB state is unaffected.

## Tests

- `resolveFilterToEmployeeIds.test.ts` — filter combinations, empty result, inactive-profile exclusion.
- `findSeededConflicts.test.ts` — no conflicts, same-template ignored, cross-template flagged with status.
- `bulkReassignViaOverride.test.ts` — mixed eligible/ineligible batch, per-row failure isolation, audit reason present.
- Extend `formMapping.test.ts` — preview parity between resolver and seeder for the same filter set.

## Documentation

- Update `mem/features/annual-review/per-employee-template-override.md` — note Form Mapping now drives bulk overrides.
- Add short section to `.lovable/plan.md` and `DOCUMENTATION.md` describing the resolve-and-sync flow.
- `POLICY.md`: "Form Mapping rules affect future seeding by default; moving already-seeded employees requires an explicit Sync action and only applies to instances in `not_started` or `pending_self`."
