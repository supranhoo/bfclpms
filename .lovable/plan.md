# Fix: "HK, Pol, Dust, hort - W" missing from Form Mapping

## Root cause (confirmed against DB)

- Template `HK, Pol, Dust, hort - W` (id `97e81d9d…`) has **`is_active = false`** in `annual_review_templates`.
- It still has **249 seeded instances** in `annual_review_instances` for the active cycle `Annual Review - 2025-2026`, which is why the **download template for upload** (reads instances directly) still reports 249 employees on it.
- `src/pages/annual-review/AnnualReviewFormMapping.tsx` filters templates with `templates.filter((t) => t.is_active !== false)` in **3 places** (lines 181, 844, 1146). Any inactive template is dropped from:
  - the "Templates in use" panel,
  - the rule-builder template dropdown,
  - the copy-from-template picker.

Result: an admin has no way to see or reassign the 249 employees still bound to an archived template. This is a category bug — it will recur for any template that gets deactivated while seeded instances exist.

## Fix (surgical, additive, UI-only)

Change the visibility rule from "hide inactive" to "hide inactive **unless the template is still in use for this cycle**". Templates in use come from the existing `listTemplatesInUse(cycleId)` service (already returns any template with ≥1 seeded instance regardless of `is_active`).

### Steps

1. **`src/pages/annual-review/AnnualReviewFormMapping.tsx`** — replace the three `t.is_active !== false` filters with a helper `isTemplateVisible(t, inUseIds)` where `inUseIds = new Set(templatesInUse.map(x => x.template_id))`. The Templates-in-use panel already knows this set — plumb it into the two other filter sites (rule builder dropdown + copy-from-template list).
2. **UI signal** — in the rule-builder `<Select>` and Templates-in-use rows, append an "Inactive" badge (existing `Badge` variant `secondary`) after the template name when `t.is_active === false`, so admins understand the state.
3. **No service, schema, RLS, or seeder changes.** `listTemplatesInUse` and `checkMappingCoverage` already handle inactive templates correctly; only the page-level filters were dropping them.

### What visually changes and where

- **Form Mapping page → "Templates in use" panel**: a new row appears for `HK, Pol, Dust, hort - W` with `249 employees` and an "Inactive" badge next to the name.
- **Form Mapping page → rule builder → Template dropdown**: inactive-but-in-use templates now appear at the bottom of the list with an "Inactive" badge. Fully-inactive templates (no seeded instances) remain hidden.
- **Form Mapping page → "Copy employees from another template" dialog**: same treatment — inactive-but-in-use templates become selectable so admins can migrate the 249 employees off the archived template.
- No change to any other page (Template Editor, Template Archetypes, etc. keep their existing filters).

## Risk & impact

- Data impact: none — read-only surfacing.
- Workflow impact: admins regain the ability to reassign employees off archived templates, closing the loophole that produced this ticket.
- Regression risk: low — the filter is only relaxed for templates that already have seeded rows in the current cycle; templates archived and unused stay hidden exactly as today.
- Scalability: `templatesInUse` is already fetched on this page; the visibility set is O(#templates in use) per cycle (single-digit to low-hundreds).

## Tests

- Extend `src/test/annualReview/listTemplatesInUse.test.ts` with an "inactive template still counted" case (service already does this; lock it).
- New pure-function test for `isTemplateVisible` covering: active → visible; inactive + in use → visible; inactive + not in use → hidden.

## Docs & policy

- `DOCUMENTATION.md` — Form Mapping section: note the inactive-but-in-use rendering rule and "Inactive" badge.
- `POLICY.md` — add a short clause under Annual Review templates: "Deactivating a template does not remove it from Form Mapping while seeded instances reference it; admins must reassign those employees first."
- Memory: add `mem://features/annual-review/inactive-template-visibility` capturing the rule.

## Rollback

Revert the single page-level filter change — no schema or data migration to undo.

## Not applicable

- No new secrets, no edge function, no cron.
