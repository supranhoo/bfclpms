# Add "Has KRAs" filter to Annual Review template-audience mapping

## Goal

In the "Map a template to an audience" builder (Form Mapping page), add a filter that restricts the audience to employees who have (or do not have) KRAs in the last **N months**. Rules saved with this filter must be honoured by the seeder so the persisted mapping matches the preview.

## User decisions

- **KRA scope**: employee has ≥1 row in `public.kpis` within the last **N months** (window ends today, starts `now() − N months`).
- **Filter UI**: tri-state — `Any` (default, no restriction) / `With KRAs` / `Without KRAs`.
- **N (window size)**: default **12 months**, admin-editable in the filter row (number input, 1–36). Persisted per-rule.

## UI (Audience Filters panel — one new row)

Rendered inline in `RuleFiltersEditor`, styled to match the existing filter cards:

```text
HAS KRAs                        ← card label
[ Any ▾ ]   in last [ 12 ] months
```

- Select shows `Any` / `With KRAs` / `Without KRAs`.
- Number input is disabled + hidden when `Any` is selected.
- Preview line below the panel updates as usual ("This will assign the template to N employees").
- Rule chip summary (`RuleFiltersSummary`) appends `· KRAs: yes (12m)` / `· KRAs: no (12m)` when set.

No new field on the main form beyond that row. No layout changes elsewhere.

## Data model

- Extend `AssignmentFilters` (TypeScript) with two additive optional fields:
  - `has_kras?: 'any' | 'yes' | 'no'` (undefined ≡ `any`)
  - `kras_window_months?: number` (undefined ≡ 12, only meaningful when `has_kras` ∈ `yes|no`)
- `annual_review_assignment_rules.filters` is already `jsonb` — no migration needed. Existing rules with no `has_kras` key behave exactly as today.

## Matcher / preview / seeder

Single new async helper `fetchEmployeesWithKrasSince(months: number): Promise<Set<string>>` in `formMapping.ts`:

- `SELECT DISTINCT employee_id FROM kpis WHERE created_at >= now() − interval 'N months'`.
- Paged (1000/page) to respect POLICY §94.
- Memoised per `months` value inside the module (so the preview and coverage report share one fetch).

`matchesFilters(...)` gains a third argument `krasEmpIds?: Set<string> | null`:

- If `has_kras` is unset/`any` → no effect (backward-compatible).
- Else the caller MUST pass the correct set for the filter's `kras_window_months` and the matcher returns `false` when membership disagrees with `yes`/`no`.

`previewAudience` and `checkMappingCoverage` fetch the set once (using the filter's window; default 12) before iterating profiles.

`seedInstancesByRules` in `annualReviewService.ts` mirrors the same logic: it collects the set of distinct window sizes referenced by active rules, fetches each set once, and passes the correct set into its local `matches()` per rule. This guarantees the persisted mapping matches the UI preview exactly.

## Files touched

- `src/types/annualReview.ts` — extend `AssignmentFilters` (additive, optional).
- `src/services/annualReview/formMapping.ts` — add `fetchEmployeesWithKrasSince`, extend `matchesFilters`, `previewAudience`, `checkMappingCoverage`.
- `src/services/annualReview/annualReviewService.ts` — extend inline `matches()` in `seedInstancesByRules` to consume the same set(s).
- `src/components/annual-review/RuleFiltersEditor.tsx` — add the new filter row + summary chip.
- `src/services/annualReview/formMapping.test.ts` — new cases: filter unset (backward-compat), yes/no with/without membership, window value round-trip.
- `DOCUMENTATION.md` — version entry.
- `POLICY.md` — one line under Annual Review mapping: filter semantics + default window.

No SQL migration. No new tables. No RPC changes.

## Risk & Impact

- **Data**: additive JSONB keys on existing `filters` — old rules unchanged, new field defaults to `any`. No schema/RLS/trigger change.
- **Workflow**: seeder now respects the new filter — an existing rule left at `any` behaves identically to today. Only rules explicitly saved with `yes`/`no` change coverage.
- **UI/UX**: one new row inside the existing "Audience filters" grid; no navigation or layout change; preview count updates live.
- **Performance**: one extra `SELECT DISTINCT employee_id` per unique window size (usually one). Paged; memoised in-module for the render lifetime.
- **Regression**: matcher changes are additive and pin-guarded by tests; the shared `RuleFiltersSummary` render is a chip append only.
- **Scalability**: query is indexable on `kpis(employee_id, created_at)`; even at 100k KPI rows this is a single scan aggregated in-DB.
- **Rollback**: revert the two service files and the editor; JSONB keys become dormant.

## Tests

- `formMapping.test.ts`
  - Rule with `has_kras: undefined` matches identically to before (locks backward-compat).
  - Rule with `has_kras: 'yes', kras_window_months: 12` includes only employees in the KRA set; excludes others.
  - Rule with `has_kras: 'no'` inverts the above.
  - `previewAudience` and `checkMappingCoverage` respect the filter (mock the KRA-set fetch).
- Seeder unit already covered by `formMapping.test.ts` matcher parity; add an assertion that the seeder-side `matches()` uses the same helper output.

## Documentation & policy

- `DOCUMENTATION.md` version bump entry naming the new filter, window default, and where it applies (Form Mapping only — does NOT change per-employee overrides or template-level policies).
- `POLICY.md` — one line: "Annual Review mapping rules MAY restrict audience to employees with/without KRAs in the last N months (default 12). Default is `any`; existing rules are unaffected."
