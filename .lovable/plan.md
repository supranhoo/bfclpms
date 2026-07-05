
# Form Mapping for Tomorrow's Launch

## The real problem

We now have **three overlapping ways** to put a form in front of an employee, and it's not obvious which one is the source of truth:

```text
                     ┌─────────────────────────────────────┐
                     │  What the employee actually sees    │
                     │  = annual_review_instances.template │
                     └─────────────────────────────────────┘
                                     ▲
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
   (1) Assignment Rules     (2) Per-employee Override   (3) Manual template_id
       dept + sub-unit +        annual_review_             set at seed time
       archetype + grade        assignment_overrides
       → template_id
              ▲
              │
   ┌──────────┴───────────┐
   │  Template Factory    │  ← generates templates from
   │  (dept × archetype × │     KPI weight matrix +
   │   grade bucket)      │     criteria matrix +
   └──────────┬───────────┘     archetype defaults
              ▲
              │
   ┌──────────┴───────────┐
   │  BFCL Forms Import   │  ← the new workbook importer
   │  (criteria library + │     just populates matrices
   │   assignments +      │     — it does NOT create
   │   KPI weights)       │     templates directly
   └──────────────────────┘
```

**Nothing here is truly duplicated** — each layer feeds the next. But for tomorrow's go-live, running the full chain (import → factory → rules → seed) is too many moving parts to verify in one night.

## Recommendation

**Use path (1) + (2) only tonight.** Templates already exist and are tested. Park the factory/import chain as an upstream authoring tool we can adopt later without rework.

## What to build tonight — one "Form Mapping" screen

New admin page: **Annual Review → Admin → Form Mapping** (`/annual-review/admin/mapping`).

Single screen, three panels:

1. **Templates panel (left)** — list all `annual_review_templates` for the active cycle. Show name, criteria count, weight total, "used by N employees" badge. This is our source of truth for "what forms exist."

2. **Mapping builder (center)** — pick a template, then define the audience via any combination of:
   - Department (multi-select)
   - Sub-unit (multi-select, filtered by dept)
   - Grade bucket (M / W / T / other) OR specific grade codes
   - Archetype (A / B / C / D)
   - Level / Designation (new — plain multi-select, no schema change; filters resolve at seed time)

   Live preview: **"This will assign the form to X employees"** (query `profiles` with the filters, active in cycle).

   Commit writes one `annual_review_assignment_rules` row per (dept, sub_unit, archetype, grade_bucket) combination pointing to the chosen `template_id`. Idempotent upsert.

3. **Employee override panel (right)** — search any employee, see their **currently resolved template** (override → rule → default), and pin a specific template via `annual_review_assignment_overrides`. Shows the reason field.

## Seeding flow (unchanged, already works)

When admin clicks "Seed cycle" the existing seeder:
1. Resolves archetype for each employee (`resolveArchetypeForEmployee`)
2. Looks up matching `annual_review_assignment_rules`
3. Applies any `annual_review_assignment_overrides`
4. Writes `annual_review_instances.template_id`

We only need to make sure step 2 actually finds a rule for every active employee — the new mapping screen makes that trivial to verify.

## Coverage gate (safety net)

Before "Start cycle" is allowed, run **`checkMappingCoverage(cycleId)`**:
- Count active employees in the cycle
- For each, resolve template via (override → rule → grade/archetype match)
- Return `{ mapped: N, unmapped: [{ employee, reason }] }`
- Block start if `unmapped.length > 0`; show the list with one-click "assign to template…" per row

This is the single check that answers "will every employee see a form tomorrow?"

## What we explicitly park (not tonight)

- BFCL Forms Import — leave the dialog, but label it **"Upstream authoring (optional)"**. It stays useful for regenerating templates in future cycles.
- Template Factory bulk rebuild — same. Available in admin, not on the launch critical path.
- Level / Designation columns in `criteria_assignments` matrix — not needed; level/designation filtering lives in the mapping screen's audience builder and is evaluated at seed time against `profiles`, not stored in the matrix.

## Files to touch

- **New** `src/pages/annual-review/AnnualReviewFormMapping.tsx` — the screen above
- **New** `src/services/annualReview/formMapping.ts` — `upsertAssignmentRules`, `previewAudience`, `checkMappingCoverage`, `resolveTemplateForEmployee` (single SSOT reused by seeder + preview)
- **Edit** `src/services/annualReview/annualReviewService.ts` — seeder calls `resolveTemplateForEmployee` from the new service (removes any duplicate resolution logic)
- **Edit** `src/pages/annual-review/AnnualReviewAdmin.tsx` — add "Form Mapping" tab, add coverage gate on "Start cycle"
- **New** `src/services/annualReview/formMapping.test.ts` — resolver precedence (override > rule > null), audience preview, coverage gate
- **Docs** `docs/specs/annual-review-form-mapping.md` + update `mem://features/annual-review/overview` with the mapping SSOT

## Risk & impact

| Area | Impact |
|---|---|
| Data | No schema change. Writes only to existing `annual_review_assignment_rules` and `annual_review_assignment_overrides`. Reversible by deleting rows. |
| Workflow | Adds one admin screen + one coverage gate. Existing seed / instance / review flows unchanged. |
| UI | New tab under Admin. No changes to employee-facing screens. |
| Regression | Low — resolver is centralized so seeder and preview cannot drift. Existing templates keep working as-is. |
| Rollback | Delete the new rules rows; assignments fall back to prior state. Screen can be hidden with a feature flag. |

## Timeline (tonight)

1. Service + tests (60–90 min)
2. Mapping screen + audience preview (90 min)
3. Coverage gate + seeder wiring (30–45 min)
4. Manual dry-run against the real cycle: import employees → map 3–4 templates → verify coverage = 100% → seed a test cycle → open one employee's form (30 min)

Total: ~4 hours with buffer.

## Decision to confirm before I build

- **Yes, build the mapping screen as above** — I'll implement it now.
- **No, I want to go the full factory route instead** — riskier for tomorrow; I'll re-plan.
- **Different scope** — tell me what to change.
