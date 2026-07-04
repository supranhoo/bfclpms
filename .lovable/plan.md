## Goal

Add a **Delete** (Remove) action on each Annual Review template in the admin Templates tab, with safety checks so a template that is still in use cannot be removed.

## UI change

`src/pages/annual-review/AnnualReviewAdmin.tsx` → `TemplatesTabImpl` template card row:

- Add a new red-outlined **Delete** button (Trash2 icon) after "Deactivate", visible for every template.
- Clicking opens a `ConfirmDestructiveDialog` (existing pattern) titled "Delete template?" summarising the template name/version and warning the action is irreversible.
- On confirm → call `svc.deleteTemplate(t.id)`, toast success, refetch list. On error → surface the server message via toast (e.g. "Cannot delete — template is assigned to N rule(s) / M employee override(s) / K live instance(s). Deactivate instead.").

No other UI touched.

## Service / logic

`src/services/annualReview/annualReviewService.ts` — add `deleteTemplate(id: string)`:

1. Count references in parallel (`head:true, count:'exact'`):
   - `annual_review_assignment_rules.template_id = id`
   - `annual_review_assignment_overrides.template_id = id`
   - `annual_review_instances.template_id = id` OR `template_override_id = id`
2. If any count > 0 → throw a single formatted Error with the counts (drives the toast message above). No deletion happens.
3. Otherwise → `db.from('annual_review_templates').delete().eq('id', id)`. Return `{ ok: true }`.

Rationale: additive, non-destructive by default. Matches the workflow-template lifecycle policy (assignments block deletion, deactivate/archive instead).

## Files touched

- `src/pages/annual-review/AnnualReviewAdmin.tsx` — add Delete button + confirm dialog wiring in `TemplatesTabImpl` only.
- `src/services/annualReview/annualReviewService.ts` — add `deleteTemplate`.
- `src/test/annualReview/deleteTemplate.test.ts` (new) — unit tests: (a) blocks when rules/overrides/instances reference it, (b) succeeds when unreferenced, (c) error message includes counts.
- `src/modules/annual-review/DOCUMENTATION.md` — Version-history entry ("v1.2 — Templates tab: Delete action with reference-count guard").
- `src/modules/annual-review/POLICY.md` — note: a template may only be deleted when it has zero rule/override/instance references; otherwise deactivate.

## Risk & Impact

- **Data:** Hard delete of one row in `annual_review_templates` only when zero references exist. No cascade. Rollback = restore from backup (template is included in backup by default).
- **Workflow:** None — blocked when any live rule/override/instance still uses it.
- **UI/UX:** One new destructive button, gated by confirm dialog.
- **RLS:** Uses existing admin-only mutation policies already in place for template writes; no policy change.
- **Regression risk:** Low — no changes to seed/resolve/rule paths.
- **Rollback:** Revert the three edited files; the new test file can stay or be removed.

## Not applicable

- No schema migration, no RLS change, no new backend function.
