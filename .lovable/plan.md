## Goal
Extend **Increment Slabs** so the same rating band can carry different Increment % values depending on org dimensions (Company, Division, Business Unit, Location, Category, Level) and the existing **Prorate on DOJ** flag — matching the matrix in Image 2.

## Good news: schema already supports this
The `public.increment_slabs` table was created in migration `20260531063030...sql` with these columns already present (currently unused by the UI):

- `company_ids UUID[]`
- `division_ids UUID[]`
- `business_unit_ids UUID[]`
- `location_ids UUID[]`
- `category_ids UUID[]`
- `level_ids UUID[]`
- `sort_order INTEGER`

So **no migration is required**. This is a UI + matcher change only.

## Risk & Impact Report
- **Data impact**: None to existing rows. Existing slabs have empty `*_ids` arrays → interpreted as "applies to everyone" (fully backward compatible). No historical recompute needed.
- **Workflow impact**: Admin/HR gets a richer slab editor. Compute job (`compute-increment`) needs a smarter `matchSlab` so it picks the most-specific slab for each employee.
- **Calculation impact (the important one)**: With scoped slabs, two+ rows can cover the same rating band. We must define a deterministic precedence, otherwise the same employee could get different % on re-runs. Proposed rule:
  1. Slab is *applicable* if, for every dimension, the slab's array is empty OR contains the employee's value for that dimension.
  2. Among applicable slabs whose `[rating_from, rating_to]` contains the score, pick the one with the **highest specificity score** (count of non-empty dimension arrays that matched the employee).
  3. Tie-breaker: lower `sort_order`, then most recently updated.
- **Regression risk**: Low. Existing single-scope-less rows keep working identically (specificity = 0, always wins when nothing more specific exists).
- **UI/UX**: Table grows wider; we move detailed editing into a side **Sheet** so the main grid stays readable. Inline columns show summary chips ("All companies", "2 divisions", …).
- **Scalability**: Slab count per AY stays small (tens, not thousands). `matchSlab` runs in-memory per employee — O(slabs × dimensions), negligible.
- **Mitigation**: Validation prevents *exact-duplicate scope* rows for the same rating band; preview banner shows which slab will apply to a sample employee.

## Scope of change
1. **UI – `src/pages/increment/IncrementSlabs.tsx`**
   - Replace the flat row editor with a grid + side-panel editor.
   - New column layout (read mode):
     ```text
     | Rating From | Rating To | Increment % | Scope summary                          | Prorate | Action |
     |    4.75     |   5.00    |    12 %     | All companies · L1, L2 · Plant Ops    |   Yes   |  ⋯    |
     ```
   - Click **Edit** (pencil) or **Add Row** opens a right-side `Sheet` containing:
     - Rating From / Rating To / Increment % / Prorate on DOJ (existing fields).
     - **Apply to** section with one `MultiSelect` per dimension:
       Company · Division · Business Unit · Location · Category · Level.
       Empty selection = "applies to all".
     - Inline helper text: *"Leave a dimension empty to apply this slab to every value of that dimension."*
     - **Specificity preview**: small badge showing how many dimensions are scoped, plus a one-line preview "Will apply to ~N employees" (computed via existing employee profile query, capped at 1000).
   - **Add Row** button gets a small dropdown: *"Blank row"* | *"Duplicate selected slab"* (faster matrix entry).
   - **Bulk matrix entry** helper: a "Generate from matrix" action that takes the standard 5 rating bands (4.75+, 4.50–4.74, 3.00–4.49, 2.10–3.00, 1.01–2.09) and a chosen single dimension to scope by, then pre-creates one draft row per (band × value) for the admin to fill.
   - Validation in the Sheet:
     - `rating_to ≥ rating_from`
     - `0 ≤ increment_percent ≤ 100`
     - Block save if another active slab in the same AY has the **identical scope + overlapping rating band** (exact duplicate). Warn (don't block) if scopes only partially overlap — that's the intended use.
   - Keep existing **AY selector**, **Copy Previous Year**, **Delete confirmation dialog** behavior.

2. **Hook – `src/hooks/useIncrementSlabs.ts`**
   - Extend the upsert payload type to include the six `*_ids` arrays and `sort_order`.
   - Add a small selector `findApplicableSlabs(slabs, employee, score)` exported for the UI preview.

3. **Matcher – `src/lib/slabMatcher.ts` (new, pure)**
   - `isSlabApplicable(slab, employee): boolean` — empty array passes; otherwise array must include the employee's value.
   - `pickSlab(slabs, employee, score)` — implements the precedence rules above; returns the chosen slab or `null`.
   - Unit-tested independently (no DB / no React) → satisfies the test-driven rule.

4. **Edge function – `supabase/functions/compute-increment/index.ts`**
   - Replace the current `matchSlab(slabs, score)` (line 168) with the new `pickSlab(slabs, employee, score)`.
   - Employee dimension values come from the already-fetched `profilesRes` (it already includes company / division / business_unit / location / category / level ids — verify and add to the select if any are missing).
   - `rating_band` label stays as `"{rating_from}-{rating_to}"`; we additionally store the matched scope summary in `run_items.remarks` for traceability.

5. **Tests – `src/lib/slabMatcher.test.ts`**
   - Single global slab still wins when no specific slab exists.
   - Specific slab (e.g. Company=A) wins over global for an A employee.
   - Two slabs matching same dimensions → `sort_order` tie-breaker.
   - Slab with mismatched company is excluded even if rating matches.
   - Employee missing a dimension value → only matches slabs that leave that dimension empty.

6. **Docs & policy**
   - `DOCUMENTATION.md` → "Increment Slabs" section: add the scope dimensions, precedence rules, matrix-entry helper.
   - `POLICY.md` → "Increment % is determined by (Rating band × Org scope). Most specific applicable slab wins; ties resolved by sort order."
   - `mem://features/incentive/core-engine-specifications` → append one line: "Slabs are scoped by 6 org dimensions; matcher picks most-specific applicable slab, ties broken by sort_order."

## UI sketch (read view)
```text
Slabs for AY 2025-26                  [ AY ▾ ] [Copy Prev Year] [+ Add Row ▾]
─────────────────────────────────────────────────────────────────────────────
Rating From | Rating To | Inc % | Scope                              | Prorate | ⋯
   4.75     |   5.00    | 12 %  | All companies · All divisions      |  Yes    | ✏ 🗑
   4.75     |   5.00    | 14 %  | BFCL Alloys · Plant Ops · L4–L5    |  Yes    | ✏ 🗑
   4.50     |   4.74    | 10 %  | All                                |  Yes    | ✏ 🗑
   ...
```

## UI sketch (edit Sheet)
```text
┌─ Edit Slab ──────────────────────────────────┐
│ Rating From [ 4.75 ]   Rating To [ 5.00 ]    │
│ Increment % [ 14 ]     Prorate on DOJ [✓]    │
│                                              │
│ Apply to (empty = all)                       │
│  Company        [ BFCL Alloys ✕ ]      ▾    │
│  Division       [ — any —            ] ▾    │
│  Business Unit  [ Plant Ops ✕ ]        ▾    │
│  Location       [ — any —            ] ▾    │
│  Category       [ — any —            ] ▾    │
│  Level          [ L4 ✕  L5 ✕ ]         ▾    │
│                                              │
│ Specificity: 3 dimensions scoped             │
│ Preview: matches ~42 active employees        │
│                                              │
│              [ Cancel ]  [ Save Slab ]       │
└──────────────────────────────────────────────┘
```

## Rollback
Pure additive. To revert: ignore the new UI fields and slabs created with empty `*_ids` continue to behave as before. No destructive DB action.

## Not Applicable
- New migration (schema already has the columns).
- Auth/RLS changes (existing policies cover all new behavior).
