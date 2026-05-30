# Phase 19.7 — Simplify Eligibility Filters & Criteria Table

## Scope (UI-only)
File: `src/components/admin/scoring/IncrementEligibilitySection.tsx`

### Change 1 — Remove "Category" filter
Filter bar (image 1) currently has 7 fields. Remove the **Category** multi-select. New layout:

```
Row 1: Company | Division | Business Unit | Level
Row 2: Location | Assessment Year *           [Reset] [Load / Search]
```

- Drop the Category `MultiSelectFilter`, its draft state key, and references in `applyScope` / `scopeKey` / "Copy from previous year".
- `category_id` continues to exist in DB as `uuid[]` but is always written as `[]` (global). No migration.

### Change 2 — "Effective" column → "Assessment Year"
Criteria table (image 2) currently shows per-row `effective_from` date (e.g. `2026-05-30`). Replace that column with the **Assessment Year** from the parent config (e.g. `2030-31`) — same value for every row in the loaded config.

```
Name | Description | Oper. | Threshold | Unit | Assessment Year | Active | Actions
```

- Column header: `Assessment Year`
- Cell value: `config.assessment_year` (string already loaded in scope)
- Remove `effective_from` from the Add/Edit Criterion dialog (auto-set server-side to today, or drop usage entirely in UI). Keep DB column for audit.

## Risk & Impact
- **Data:** None — no schema change. Category arrays default to empty.
- **Workflow:** Configs can no longer be scoped by Category. Existing rows with category values remain readable but not editable via UI filter (acceptable since Category was added in 19.6 and not yet used in production).
- **Regression:** Low. Pure presentational removal + column swap.
- **Tests:** Update `incrementEligibility.test.ts` only if scope-key assertions reference category (they don't).

## Out of Scope
- DB column drops, evaluator changes, approval workflow.
