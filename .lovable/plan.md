## RCA — Why Vivek shows Prorated when UI says Full

DB state for AY 2025-26 (`increment_method_configs`):

| version | scope | method | status |
|--:|--|--|--|
| **v2** | **global** (all scope cols NULL → "All companies") | **full** | **active** ← what the Settings UI shows |
| **v3** | company `1759cc34…` (Vivek's company) | **prorated_doj** | **active** ← what the engine is silently using |
| v1, v2 (older) | … | … | archived |

The engine (`supabase/functions/compute-increment/index.ts` ~line 312) resolves the method like this:

```ts
admin.from('increment_method_configs')
  .select('*').eq('assessment_year', AY).eq('status','active')
  .order('version',{ascending:false}).limit(1).maybeSingle()
```

That's a **single global pick** — it ignores the employee's company/division/BU/category/level/location entirely. With two active rows, version-ordering returns v3 (prorated_doj), which then gets applied to **every employee in the run**.

- Vivek happens to be in company `1759cc34…`, so v3's scope coincidentally matches him — but the engine never actually checked. An employee in a different company would *also* be calculated as prorated_doj, which is wrong.
- The Settings screen ("Increment Method", "All companies" → Full Increment v2 active) shows the global config correctly, but admins don't currently see that a company-scoped override v3 exists silently.

So the bug is **scope-blind resolution**, not duplicate-active (we already deduped per scope in ADR-071). All employees get the same — wrong — method whenever multiple scoped configs coexist.

Answering the checklist:
1. ✔ fetches for selected AY 2025-26
2. ✔ correct AY
3. ✗ defaults silently to the row with the highest version, ignoring scope
4. ✗ does NOT filter by company/division/BU/category/level/location
5. ✗ UI Method column reflects what was actually used, so it correctly shows "Prorated"; the Settings screen and the run output disagree because they look at different rows
6. ✗ not hardcoded; engine picks from DB, just the wrong row
7. ✔ "latest version" tie-breaker works (but only within the wrong global query)
8. ✔ single / multi / all employee runs share the same broken lookup

## Risk & Impact Report
- **Data Impact:** No schema change. Existing `increment_run_items` for runs done under the broken logic remain as historical audit; a fresh run will produce correct values per employee scope.
- **Workflow Impact:** None. Trigger / save / export contracts unchanged.
- **UI/UX Impact:** None on the Calculate Increment % tab. The Settings UI is unchanged. Optionally we can surface "active configs for this AY (global + scoped overrides)" as a follow-up — out of scope here.
- **Regression Risk:** Low. When only one active config exists (the common case), the per-employee resolver behaves identically to the current code. Only behaviour change is when multiple scoped active configs coexist — which is the case we want to fix.
- **Scalability Impact:** Resolver runs in-memory over a small set (~≤ N configs per AY × employee count). O(employees × configs) loop, negligible.
- **Mitigation:** Deno tests for global-only, company-scope, multi-dimension precedence, no-match, and custom method preservation.

## Correction Plan

### Step A — Engine: per-employee scope resolution
Edit `supabase/functions/compute-increment/index.ts`:

1. Replace the single-row `methodCfg` fetch with **all active configs for the AY**:
   ```ts
   admin.from('increment_method_configs')
     .select('*').eq('assessment_year', AY).eq('status','active')
   ```
2. Add a `resolveMethodConfig(profile, deptToBu, buToDiv, categoryNameToId, configs)` helper that:
   - Maps the employee's scope keys: `company_id`, `division_id` (via department → BU → division), `business_unit_id`, `category_id` (resolved from `employee_category` name), `level_id`, `location_id`.
   - For each candidate config row, matches a column when the config's value is either `NULL` (wildcard) or equal to the employee's value; rejects when the config sets a value the employee doesn't share.
   - Scores **specificity** = count of non-null scope columns on the config (0 = global, 6 = fully scoped). Highest specificity wins.
   - Ties broken by `version DESC`, then `created_at DESC`.
3. Replace the previous `methodType = (methodCfg.data as any)?.method ?? 'full'` line in the per-employee loop with the resolved row.
4. If `configs.length === 0` for the AY → fail the run with: `"No increment method configured for AY <year>"` (matches the user's requested guard wording).
5. If `configs.length > 0` but **no candidate matches a given employee** → record `eligibility_status = 'no_score'`-style item with `remarks = "No increment method configured for employee scope"` and skip increment math for that row. The run itself still completes.
6. `method === 'custom'` slab lookup: replace the single pre-fetch with a per-config-id cache (`Map<configId, slabs[]>`) populated lazily inside the loop.
7. Persist the resolved method on each `increment_run_items` row exactly as today (`method_used` is already written per employee), so the **Method column in the UI and Excel export both reflect the per-employee resolution**.

### Step B — UI parity
No change needed in `IncrementInputs.tsx` — the Method/Eligible %/Increment Amount cells already read from `increment_run_items` which now carry per-employee values. Excel export uses the same row source. ✔

### Step C — Settings visibility (out of scope of this fix, noted for follow-up)
The Settings screen shows only one config at a time per scope selector. Admins can be blind to overlapping configs. Suggested follow-up (not part of this change): show a small "Other active configs for this AY" list when one exists.

### Step D — Regression tests
Add Deno tests in `supabase/functions/compute-increment/method_resolution_test.ts`:
- only global config (full) → full for everyone
- global=full + company=prorated → company employees get prorated, others get full
- multi-dim (company + level) beats company-only for same employee
- tie on specificity → higher version wins
- no configs → throws (`No increment method configured`)
- configs exist but none match employee → employee row gets `remarks` and is skipped from math
- `method === 'custom'` keeps its per-config slabs

### Step E — Recalculate
After deploy: re-run "All Employees" for AY 2025-26. Expected for Vivek (company `1759cc34…`): still prorated, because the **company-scoped config v3** is the most specific match and is still active. If the admin intends Full Increment for him, they should archive v3 (the company-specific override) so the global v2 (full) becomes his resolved match.

## UI Changes
**Not Applicable** — no visual changes. Values inside Calculated / Run Details may change for any employee whose scope previously got the "wrong" method by accident of the global tie-break.

## Out of Scope (per user constraints)
- PMS score derivation, rating band, slab definitions, ineligibility criteria, confirmation-increment adjuster — untouched.
- Historical run rows preserved; only new runs use the corrected resolver.
- Pagination, edit/delete, Excel export, Run Log behaviour — untouched.

## Rollback
Revert the single edited file (`supabase/functions/compute-increment/index.ts`). No DB migration in this change set.

## Files
- `supabase/functions/compute-increment/index.ts` (resolver + per-employee lookup)
- `supabase/functions/compute-increment/method_resolution_test.ts` (new)
- `DOCUMENTATION.md`, `POLICY.md`, `docs/adr/ADR-072.md` — sync notes about per-employee scope resolution and the "no config → fail run" rule.
- Memory: update `mem://features/incentive/core-engine-specifications` with the resolver contract.
