
## Plan — Fix False “Stuck” Status on Org KPI Cards

### Exact Problem

The Org KPI page is marking KPIs as **Stuck** far too early.

For scoped Org KPIs, the current logic treats **any underlying employee KPI still in `kra_set`** as “stuck”. That is wrong because `kra_set` is the normal state **before** propagation. So as soon as a Data Owner enters values, the UI can show a red **Stuck** badge even though nothing is broken yet.

This is happening because:

- `src/hooks/useOrgLevelKpis.ts` builds `kraSetKpiRowsByKey` from any child KPI in `kra_set`
- `src/pages/admin/OrgKpiDataEntry.tsx` turns that into `stuckDefinitionKeys`
- `getKpiStatus()` then returns `stuck` for entered scoped KPIs **without checking the Org KPI value status**
- the Pending Report reuses the same bad assumption, so both the card and report can mislabel normal “entered but not propagated yet” rows as failures

### Root Cause

The UI is conflating two different states:

- **Normal entered state**: Org KPI value exists, but propagation has not been completed yet
- **Real stuck state**: the Org KPI already claims to be propagated/approved, but one or more child KPI rows are still at `kra_set`

Only the second case is truly “stuck”.

### Risk & Impact Report

- **Data impact:** None. No schema, RLS, or historical data changes required.
- **Workflow impact:** None. Propagation, approval, send-back, and repair flows stay unchanged.
- **UI/UX consistency:** Improves accuracy by showing `Entered` until propagation actually occurs, and reserving `Stuck` for genuine integrity problems.
- **Regression risk:** Medium. This status logic feeds card badges, filters, progress tiles, and the Pending Report.
- **Mitigation plan:** Centralize Org KPI entry-status derivation into one helper and add regression tests for entered/propagated/stuck cases across scopes.

### Implementation

#### 1) Replace the current “any `kra_set` means stuck” rule
In `src/pages/admin/OrgKpiDataEntry.tsx`, remove the current dependency on `stuckDefinitionKeys` as the primary classifier.

New status contract:

- **Pending**
  - no Org KPI value entered for that scope
- **Entered**
  - Org KPI value exists, but its status is still draft/entered/sent_back (not propagated/approved)
- **Propagated**
  - Org KPI value status is `propagated`/`approved` and all relevant child KPI rows have advanced past `kra_set`
- **Stuck**
  - Org KPI value status is `propagated`/`approved`, but one or more relevant child KPI rows are still in `kra_set`

This preserves genuine Bucket C/F visibility while removing false red badges before propagation.

#### 2) Make the status calculation scope-aware
The current stuck map is definition-wide. That is too coarse.

Refactor status derivation so it evaluates the correct child set for each scope:

- **organization** → all mapped employee KPI rows under that definition
- **department** → only employees in that mapped department slice
- **employee** → only that employee’s KPI row

This avoids one incomplete branch incorrectly painting the whole definition red.

#### 3) Extract the logic into a reusable helper
Create a small Org KPI status utility/helper so the same rules are used by:

- KPI cards
- status filter chips
- progress tiles
- Pending Report rows

This prevents the card and report from drifting again.

#### 4) Update the Pending Report to use the corrected status
In `src/pages/admin/OrgKpiDataEntry.tsx`, the Pending Report row builder currently repeats the same false-positive logic. Rewire it to use the same centralized status helper so:

- “Entered” rows stay entered
- only truly propagated-but-not-advanced rows show as “Stuck”

#### 5) Preserve repair visibility for real failures
Do not remove stuck detection entirely. Keep it for actual propagation integrity problems so existing repair workflows remain meaningful:

- partial/failed propagation after OKV says propagated
- status-stuck rows repaired by Data Repair
- reviewer revision/send-back scenarios that intentionally revert OKV back to non-propagated states should show non-stuck statuses again

### Regression Tests

Add tests covering the exact failure mode:

1. **Entered employee-scoped Org KPI + child KPI still `kra_set` => `entered`, not `stuck`**
2. **Entered department-scoped Org KPI + all children still `kra_set` => `entered`**
3. **Propagated Org KPI + all children advanced => `propagated`**
4. **Propagated Org KPI + some children still `kra_set` => `stuck`**
5. **Pending Report uses the same derived status as the card**

Recommended files:
- `src/test/bugBountyFixes.test.ts`
- optionally a focused helper test if the status logic is extracted into its own module

### Documentation / Policy Sync

Update both required SSOT files in the same change:

- `DOCUMENTATION.md`
  - note that Org KPI “Stuck” is now reserved for **post-propagation integrity failures**, not pre-propagation entered rows
- `POLICY.md`
  - add a rule that Org KPI entry surfaces must derive status from **OKV lifecycle + child KPI workflow state together**
  - forbid using raw child `kra_set` presence alone as a stuck signal

### Files to Change

| File | Change |
|---|---|
| `src/pages/admin/OrgKpiDataEntry.tsx` | Replace false-positive stuck logic; use centralized scope-aware status derivation for cards, filters, progress, and report |
| `src/hooks/useOrgLevelKpis.ts` | If needed, return richer per-scope child-status metadata instead of only definition-level `kraSet` flags |
| `src/test/bugBountyFixes.test.ts` | Add regression coverage for entered vs propagated vs stuck states |
| `DOCUMENTATION.md` | Record the corrected Org KPI status contract |
| `POLICY.md` | Add policy that “stuck” requires propagated/approved OKV plus incomplete child advancement |

### Out of Scope

- No change to the propagation RPC itself
- No change to repair tools unless a separate real propagation failure is later confirmed
- No workflow-template or reviewer-queue changes
