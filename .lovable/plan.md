# Smarter BU Head Auto-Resolution

## Problem

`public.resolve_bu_head(bu_id)` currently:
1. Restricts candidates to employees whose department belongs to that BU.
2. Picks "roots" (employees whose manager sits outside the BU's employee set).
3. Tie-breaks by `doj ASC NULLS LAST, id ASC`.

Real-world failure on DRI division:
- **1050 TPD** → resolver returns Md Iqubal Ansari (W5, DOJ 2016-03-02) instead of Sajid Raza (M2, DOJ 2020-11-16). DOJ tie-break beats actual grade seniority.
- **3X100 TPD** → Sajid is invisible. His dept "DRI" is mapped to BU `1050 TPD`, but he leads the whole **DRI division** (which contains both `1050 TPD` and `3X100 TPD`).

## Risk & Impact

- **Data**: Read-only resolver change. No schema or row mutation. Existing `business_units.head_user_id` rows untouched until someone clicks "Recalculate" on a BU.
- **Workflow**: Auto-derived heads will shift for BUs where (a) a more senior level exists in scope, or (b) a division-level employee exists in a sibling BU's parent dept. Manual overrides (`head_source = 'manual'`) are unaffected — resolver is only invoked by the "Recalculate" action and any seeder that already calls it.
- **UI**: None. Same "Head" column, same Auto/Manual badge, same actions.
- **Regression risk**: Annual-review reviewer-chain seeder uses the same precedence (`business_units.head_user_id` → 3-hop ancestor fallback). Since we only change *how* `head_user_id` is auto-populated, downstream consumers behave identically.
- **Scalability**: Candidate pool grows from "BU scope" to "division scope" — still small (hundreds, not thousands). Single query, indexed joins.
- **Mitigation**: Keep the old logic reachable as a fallback; only apply the new rules where they produce a non-null candidate. Add a unit test mirroring the DRI scenario.

## Resolver — New Precedence

For `resolve_bu_head(bu_id)`:

1. **Build candidate scope** = active employees where either
   - `dept.business_unit_id = bu_id` (existing BU scope), OR
   - `dept.division_id = bu.division_id` AND `dept.business_unit_id IS NULL` (division-level employees — e.g. Sajid in dept "DRI" under Division DRI).

2. **Roots** = candidates whose `reporting_manager_id` is NULL OR not in the candidate scope.

3. **Rank by level seniority** using a derived integer:
   - `M0=0, M1=1, …, M7=7, W1=8, W2=9, W3=10, W4=11, W5=12, NULL=99`
   - Resolved from `levels.name` joined via `profiles.level_id`; if `level_id` is NULL, fall back to `profiles.level` text (same map). Unknown values → 99.

4. **Order**: `level_rank ASC, doj ASC NULLS LAST, id ASC`. Return the first id.

5. **Fallback**: If step 1 returns zero candidates (e.g. BU has no employees and no division-level dept), return `NULL` — same as today.

`resolve_hr_head(company_id)` is left unchanged this round (the user reported only BU heads).

## Expected Outcome on Current Data

- **1050 TPD**: candidates include both BU members and dept "DRI" (division-level). Roots after step 2 include Sajid (M2) and Md Iqubal (W5). Level tie-break picks **Sajid Raza (100264)**.
- **3X100 TPD**: candidates now include dept "DRI" via division match. Sajid becomes a root (his manager Gaurav Budhia is outside scope). Wins over Sanjay Bediya (W5). Picks **Sajid Raza (100264)**.
- Other BUs with no division-level employee behave exactly as before, except tie-breaks shift toward higher grade where applicable.

## Implementation Steps

1. **DB migration** — replace `public.resolve_bu_head(uuid)` with the new logic above (CTEs: `bu_meta` for `division_id`, `scope`, `roots`, level-rank ordering). `SECURITY DEFINER`, `SET search_path = public`. Same signature → no caller changes needed.
2. **Unit test** — `src/test/orgHeadsSeederIntegration.test.ts`: add cases mirroring DRI:
   - Division-level employee (dept = division name) wins for a sibling BU.
   - Higher-grade root beats earlier-DOJ root in the same BU.
   - Pure-BU scope still works when no division-level candidate exists.
3. **Docs/Memory**:
   - Update `mem/features/admin/org-heads.md` — resolver SSOT: scope = BU ∪ division-level dept; tie-break = level seniority then DOJ.
   - Append a Version History entry.
4. **Verify** in this DB:
   - `SELECT public.resolve_bu_head('88e3ed27-…')` → Sajid's UUID (1050 TPD).
   - `SELECT public.resolve_bu_head('659e1a82-…')` → Sajid's UUID (3X100 TPD).
   - Spot-check 3 other BUs to confirm no unintended shifts.
5. User clicks "Recalculate" on the two DRI BUs (or we can run a one-off insert script if they want all auto-source BUs refreshed — will confirm before doing it).

## Rollback

Single migration restoring the prior `resolve_bu_head` body (the version installed in the last migration). No data rewrite required because manual overrides are untouched and auto values can simply be recalculated again.

## Open Question (non-blocking)

After deploying, do you want me to **bulk-recalculate every BU currently on `head_source = 'auto'`** so the new logic takes effect immediately, or leave each BU to be recalculated on demand via the row action? I'll ask again before running anything destructive.
