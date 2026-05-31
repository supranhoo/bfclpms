## RCA

`compute-increment` is throwing `column profiles.category_id does not exist`. The `profiles` table has **no** `category_id` column — the per-employee category is stored as text in `profiles.employee_category` and resolved at runtime to the master id via `catNameToId` map (lines 339–349). The previous "Failed to load profiles" guard correctly surfaced the schema mismatch — but the underlying query still references a column that does not exist, and two downstream code paths still read `p.category_id` (a value that never existed even before this round of changes).

### Affected call sites
- Line 298 & 299 — `.select('… category_id …')` on `profiles` → throws.
- Line 120 — `r.category_id === p.category_id` in `resolveConfirmationRule` (confirmation rules cascade). `p.category_id` is always undefined → cascade silently misses category-scoped rules.
- Line 411 — `ge.category_ids?.length && p.category_id` in general-eligibility gate. `p.category_id` undefined → category-restricted eligibility silently bypassed.

Both downstream reads have been quietly producing wrong matches; the column-doesn't-exist error simply made them visible.

## Risk & Impact Report
- **Data Impact**: None to existing rows. Future runs will start honoring category-scoped confirmation rules and category-restricted general eligibility — that is the documented intent in `mem://features/admin/employee-category-and-status` (category stored as name on profiles, resolved to master id).
- **Workflow Impact**: Single-employee and all-employee runs both unblocked. Counts in the summary become non-zero again.
- **UI/UX Impact**: None.
- **Regression Risk**: Low. Category gating was previously dead (`undefined` always). Switching to the resolved id activates the intended rule, which could newly flag an employee as "Category not eligible" or change which confirmation rule wins. Acceptable per policy.
- **Mitigation**: Two-step plan — (1) drop the non-existent column from the select to restore service immediately; (2) thread the resolved `employee_category_id` into `p` before downstream reads so category gating works as designed. Add a Deno regression test that asserts the function source contains no `profiles.*category_id` select reference and that `resolveConfirmationRule` matches on resolved id.

## Plan

1. **`supabase/functions/compute-increment/index.ts`**
   - Remove `category_id` from both `profiles.select(...)` lists (lines 298–299).
   - Inside the `for (const p of profiles)` loop, compute `const dims = empDims(p);` once and attach `p.category_id = dims.employee_category_id;` (single assignment, minimal surgical change) so existing `p.category_id` reads in `resolveConfirmationRule` (line 120) and the general-eligibility gate (line 411) start receiving the resolved master id. Replace the standalone `empDims(p)` call at line 503 with the cached `dims`.
   - No other behavior change.

2. **`supabase/functions/compute-increment/index.test.ts`** (new or appended)
   - Source-string assertion: function source MUST NOT contain `profiles.*category_id` in a select; `select('id, full_name,` block must not list `category_id`.
   - Pure unit test for `resolveConfirmationRule` proving a rule with `category_id = X` wins over a global rule when `p.category_id = X`.

3. **`DOCUMENTATION.md`** — append Version History entry: "compute-increment: removed non-existent `profiles.category_id` select; category gating now uses resolved `employee_category_id` from `employee_categories` master."

4. **`POLICY.md`** — under Increment Engine § Category Gating: "Employee category on `profiles` is stored as text (`employee_category`). The compute engine resolves it to the master `employee_categories.id` and uses that id for (a) general-eligibility `category_ids` membership and (b) confirmation-increment rule cascade matching."

5. **Verify** — call `compute-increment` for the same Jaspal single-employee run that just failed; expect a 2xx response and the summary tile to display non-zero counts.

## Out of scope (deliberately not touching)
- The frontend (`IncrementInputs.tsx`, `useIncrementRuns.ts`, `useIncrementInputs.ts`) — error message will disappear once the function returns 2xx.
- RLS, slab matcher, score rollup, adjuster — none of these reference the missing column.