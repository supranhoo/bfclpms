
## Goal
Replace the single-select `Select` controls in **System Settings → Scoring → Increment Eligibility Criteria** filter bar with **searchable multi-select dropdowns with tick checkboxes**, so admins can scope a configuration to one OR many Companies / Divisions / Business Units / Levels / Categories / Locations at once. Assessment Year remains a single-select (a config is always tied to exactly one year).

## Risk & Impact

- **Data**: Scope fields in `increment_eligibility_configs` are currently single text columns. They become arrays of selected labels. Migration: change `company_label`, `division_label`, `business_unit_label`, `category_label`, `level_label`, `location_label` from `text` to `text[]` with default `'{}'`. Empty array = "All".
- **Workflow**: Uniqueness key per scope-year still holds (we'll keep the existing unique index but adapted to arrays via a normalized hash, or simply by sorted-array equality).
- **UI/UX**: Each dropdown shows `All` when empty, `<Label>` when one, `<Label> · N` when many. Matches the existing `MultiSelectFilter` component already used in Bulk Review.
- **Regression**: Existing draft/approved configs (if any in test data) auto-migrate: existing `text` value → single-element array; `NULL`/`'All'` → empty array.
- **Rollback**: Reverse migration converts arrays back to first element or `NULL`.

## UI — Filter Bar (before vs after)

Before (today):
```text
[ Company ▼ All ] [ Division ▼ All ] [ Business Unit ▼ All ] [ Level ▼ All ]
[ Category ▼ All ]                                          [ Assessment Year ▼ 2030-31 * ]
                                                              [ Reset ] [ Load / Search ]
```

After (multi-select with ticks):
```text
[ 🏢 Company · 2 ▼ ] [ Division ▼ All ]  [ 🏭 Business Unit · 3 ▼ ] [ Level ▼ All ]
[ Category ▼ All ]   [ 📍 Location ▼ All ] [ Assessment Year ▼ 2030-31 * ]
                                                              [ Reset ] [ Load / Search ]
```

Open popover (e.g. Division):
```text
┌──────────────────────────────┐
│ 🔎 Search division…          │
├──────────────────────────────┤
│ 2 of 8 selected   Select all · ✕ Clear │
├──────────────────────────────┤
│ ☐  All                       │
│ ☑  CLU                       │
│ ☐  CPP                       │
│ ☑  DRI                       │
│ ☐  Ferro                     │
│ ☐  HR                        │
│ ☐  SMS                       │
│ ☐  Support Function          │
└──────────────────────────────┘
```

Trigger styling matches existing `MultiSelectFilter` (h-8, border highlights when selected, count badge for N>1).

## Implementation

1. **Reuse** `src/components/review/MultiSelectFilter.tsx` (already battle-tested, has tick UI, search, Select-all/Clear).
2. **`IncrementEligibilitySection.tsx`**:
   - Change filter state from `string` to `string[]` for the 6 scope fields.
   - Swap each `<Select>` for `<MultiSelectFilter>` with appropriate `icon`, `label`, `options`, `values`, `onChange`.
   - Keep Assessment Year as single `Select` (required, exactly one).
   - "Copy from previous year" still works — copies criteria, scope arrays travel as arrays.
   - Display selected scope as comma-joined chips above criteria table ("Scope: Companies: BFCL, ACME · Divisions: CLU, DRI · BUs: All · …").
3. **`useIncrementEligibility.ts`**: Update query keys + insert/update payloads to send arrays. Lookup query for existing config uses array-equality (sorted) on scope columns.
4. **DB migration** (new file):
   - `ALTER TABLE public.increment_eligibility_configs` convert 6 label columns to `text[] DEFAULT '{}' NOT NULL` with `USING (CASE WHEN col IS NULL OR col = 'All' THEN '{}'::text[] ELSE ARRAY[col] END)`.
   - Drop old unique index; recreate on `(assessment_year, company_label, division_label, business_unit_label, level_label, category_label, location_label)` — Postgres compares text[] element-wise, which works once we normalize via `array(select unnest(col) order by 1)` in a generated column OR a `BEFORE INSERT/UPDATE` trigger that sorts each array.
5. **Audit trigger**: Continue to log array values as JSONB (already JSONB-safe).
6. **Tests** (`useIncrementEligibility.test.ts` / new): array-state round-trip, empty = "All", sorted-equality dedup.
7. **DOCUMENTATION.md / POLICY.md**: Note that one config can now apply to multiple Companies/Divisions/BUs/Levels/Categories/Locations simultaneously; eligibility evaluator matches if employee's value is `IN` the array OR array is empty.

## Files

- **Edit**: `src/components/admin/scoring/IncrementEligibilitySection.tsx`, `src/hooks/useIncrementEligibility.ts`, `DOCUMENTATION.md`, `POLICY.md`.
- **New migration**: text → text[] conversion + sorted-array trigger + recreated unique index.
- **New test**: array filter behavior.
- **Reused as-is**: `src/components/review/MultiSelectFilter.tsx`.

## Out of Scope
- Increment calculation engine consumption (Phase 19.6) — already array-ready because evaluator only cares about per-criterion thresholds, not scope arrays.
- Assessment Year multi-select (intentionally single).
