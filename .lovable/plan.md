# Reuse employees from another template in Form Mapping

## Short answer to your question

**Today: No.** The Form Mapping "audience" only supports rule‑based filters — Roles, Grades, Levels, BUs, Departments, Sub-units, Grade bucket, and "Has KRAs". There is **no way to pick specific employees** (e.g. "these 5 people from Template A") from the audience builder, and no cross-template picker. The only per-employee lever that exists is the **per‑employee override** on an individual instance after seeding — one at a time, not a bulk "pull from Template A" flow.

**Yes it can be done cleanly** — the `annual_review_assignment_rules.filters` column is `jsonb`, so we can extend the audience schema without any migration. This is the minimum-surface way to deliver what you asked.

## Assumptions

- "Map" = create an assignment rule on Template B whose audience includes those 5 employees.
- "Automatically retrieve" = a picker inside Form Mapping that lists employees currently mapped to another template in the same cycle, and lets you multi-select.
- The 5 employees should end up on Template B for this cycle. Template A no longer applies to them (higher-priority rule on B wins — matches current resolver behaviour).
- Scope for now: **future seeding only** — existing seeded instances are not silently re-pointed. A separate "Re-seed selected" action (already exists) is used explicitly if the admin wants to switch already-seeded rows. This avoids clobbering saved responses.

## Risk & impact report

- **Data impact:** additive only. New optional key `employee_ids: string[]` (and `employee_ids_mode: 'only' | 'union'`) inside `filters` JSONB. No schema migration, no RLS change, no historical rewrite.
- **Workflow impact:** none for existing rules (missing key = old behaviour). New rules can be built two ways: pure filter, pure employee list, or filter ∪ list.
- **UI/UX:** one new section in the audience builder ("Include specific employees") + one new dialog ("Copy from another template"). No layout regression on existing surfaces.
- **Regression risk:** medium — `matchesFilters` and the PL/pgSQL seeder must both learn the new key or Preview and Seed diverge. Locked down by parity tests.
- **Scalability:** cap explicit list at e.g. 2000 IDs per rule (soft warn at 500). Preview already pages profiles.
- **Mitigation:** unit tests for matcher + a seeder parity test that runs `resolveTemplateForProfile` against the same input the DB seeder sees.

## What will be visible

Inside Form Mapping → "Map a template to an audience" card, below the existing filter grid:

```text
┌─ Include specific employees (optional) ──────────────────────────┐
│  ○ Filter only     ○ Filter + these people     ● Only these people│
│                                                                   │
│  [ + Add from another template ]  [ + Pick employees… ]           │
│                                                                   │
│  12 employees selected                          [ Clear ] [ View ]│
└───────────────────────────────────────────────────────────────────┘
```

"Add from another template" opens a dialog:

```text
Copy employees from another template
┌───────────────────────────────────────────────────────────────────┐
│ Source template:  [ Template A  ▾ ]     100 employees mapped      │
│ Search: [_____________]     Dept: [All ▾]                         │
│ ☐  Select all (page)                                              │
│ ☑  Alice   (E-101, Sales, Manager)                                │
│ ☑  Bob     (E-102, Sales, Executive)                              │
│ ☐  Carol   (E-103, Ops)                                           │
│ …                                                                 │
│                                              [ Cancel ] [ Add 5 ] │
└───────────────────────────────────────────────────────────────────┘
```

Source list is the same data `listTemplatesInUse` already returns, drilled into per-employee via a new `listEmployeesForTemplateInCycle(cycleId, templateId)` service.

## Precedence & conflict handling (locked by policy)

- Assignment rules are evaluated by priority (lowest number wins), with deterministic tie-break on `id` (already in code). The new Template B rule is saved with `priority = minExisting − 1` (existing behaviour) so it wins over Template A for the 5 overlapping employees.
- On save, if any employee already has a **seeded instance** on Template A, we show an inline warning:
  > "3 of these employees are already seeded on Template A. Their forms will only switch to Template B if you re-seed the cycle."
- No silent instance rewrite. Admin decides via existing "Re-seed" action.

## Implementation steps (surgical)

1. **Types** — `src/types/annualReview.ts`: add optional `employee_ids?: string[]` and `employee_ids_mode?: 'only' | 'union'` to `AssignmentFilters`.
2. **Matcher (TS SSOT)** — `src/services/annualReview/formMapping.ts` → `matchesFilters`:
   - If `employee_ids_mode === 'only'`: match iff `employee_ids.includes(profile.id)`.
   - If `'union'`: match iff filter-match OR id-in-list.
   - Default (undefined mode + no ids) = today's behaviour.
3. **Seeder parity** — mirror the same two lines in the PL/pgSQL function behind `seedInstancesByRules`. Add a migration that re-defines the function.
4. **Service** — new `listEmployeesForTemplateInCycle(cycleId, templateId)` in `formMapping.ts`, paged via `fetchAllPaged`, joining `annual_review_instances` → `profiles`.
5. **UI** — new components under `src/components/annual-review/audience/`:
   - `AudienceEmployeePickerSection.tsx` (mode radios + chips + counter)
   - `CopyFromTemplateDialog.tsx` (search + multi-select + "Add N")
   - Wire into `AnnualReviewFormMapping.tsx` inside the existing "Map a template to an audience" card. No changes to the rules table, edit flow, or Rules tab.
6. **Preview** — `previewAudience` already runs through `matchesFilters`, so it will just work once step 2 lands.
7. **Save-time warning** — in the same commit mutation, after `previewAudience(...)`, query `annual_review_instances` for rows in `audienceIds` already seeded on a *different* template; render a warning toast + inline notice.

## Tests (mandatory)

- `formMapping.test.ts`:
  - `employee_ids_mode='only'` matches only listed IDs, ignores other filters.
  - `'union'` matches filter OR id.
  - undefined = existing behaviour (regression guard).
  - deterministic tie-break still holds when the new rule uses `employee_ids`.
- New `listEmployeesForTemplateInCycle.test.ts` — paged fetch + override precedence (mirrors `listTemplatesInUse.test.ts`).
- New `seederAudienceParity.test.ts` — feeds a canned profile set + rule to both `resolveTemplateForProfile` and a mocked PL/pgSQL result, asserts identical assignments.

## Pros / cons

**Pros**
- Solves the exact workflow you described in one click (Copy from Template A → tick 5 → Save).
- Zero schema migration; existing rules unchanged.
- Composable: works alongside filter-based audiences (union mode) so admins can say "everyone in Sales **plus** these 5 from Template A".
- Auditable: audience is on the rule row, not scattered as per-employee overrides.

**Cons / trade-offs**
- Explicit IDs must be maintained on leaver churn — we should show a `⚠︎ 2 employees inactive` badge in the picker.
- Two ways to reach the same outcome (rule filter vs. explicit IDs). Solved by the mode radio and clear copy.
- Cross-template dependency: deleting Template A doesn't affect the copied IDs (they live on Template B's rule) — desired behaviour, but worth calling out.

## Recommendation

Ship it. It's a small, additive change that removes real friction (currently the admin must build an unrelated filter that happens to catch exactly those 5 people, or hand-edit 5 per-employee overrides after seeding). All existing invariants — priority resolution, coverage report, seeded-vs-will-seed classification — keep working because they route through `matchesFilters`.

Not Applicable: DOCUMENTATION.md / POLICY.md updates will be added in the same commit (POLICY §AR-MAPPING-EMPLOYEE-IDS).
