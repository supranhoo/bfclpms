

# RCA & CAPA: Org KPI Data Entry → Scorecard Propagation Failure

## Root Cause Analysis

**Symptom**: Employee scorecards show Org KPI achieved values (e.g., "30 Number") but all score columns show dashes (—). KPIs remain stuck at "KRA Set" status despite data being entered in the Org KPI Data Entry page.

**Live Database Evidence** (March 2026):
- `org_kpi_values`: 52 records (28 with values, 13 N/A, 11 null)
- `kpis` (org-level): **589 at "kra_set"**, only **12 at "self_review"**
- Propagation success rate: ~2% — virtually all propagations failed or were never triggered

### RC1: Case-Sensitive kra_name Matching (Critical)

`fetchTargetKpis()` in `usePropagateOrgKpiValue.ts` uses `.eq('kra_name', kraName)` which is **case-sensitive**. Database evidence shows casing mismatches:

```text
kpis table:        "Control dust emission"    (20 employees)
kpis table:        "Control Dust Emission"    (1 employee)
kpis table:        "DM water and steam quality"
kpis table:        "DM Water and steam Quality"
```

When the admin propagates using the master KPI's kra_name, employees with different casing are silently skipped. The fallback (line 144-156) still uses case-sensitive `.eq()`.

### RC2: Null Achieved Values Silently Skipped

Line 557 of `OrgKpiDataEntry.tsx`:
```js
if (sv.achievedValue === null && !sv.isNa) continue;
```
11 org_kpi_values have null achieved_value and aren't N/A. These employees are silently skipped during propagation, but the org_kpi_values status still shows "approved" — misleading admins into thinking propagation completed.

### RC3: KRA Name Variants

Some employees have entirely different kra_name text that can never match:
- `"Control dust emission"` vs `"Control dust emission to make the plant environment compliant"`

These will fail even with case-insensitive matching.

### RC4: Dashboard Achieved/Score Mismatch

`KpiDetailsTable` line 425:
```js
const achievedVal = orgValue?.achieved_value ?? submission?.achieved_value ?? null;
```
Achieved value comes from `org_kpi_values` (via `getOrgKpiValue`), but scores come from `review_submissions`. When propagation fails, the achieved column shows a value while all score columns show dashes — confusing users.

### RC5: getOrgKpiValue Case-Sensitive Map Keys

Dashboard's `getOrgKpiValue` (line 133) builds map keys using exact `kpi.kra_name`. If the `org_kpi_values` kra_name casing differs from the employee's `kpis.kra_name`, the lookup returns null.

---

## CAPA — Implementation Plan

### Fix 1: Case-Insensitive Matching in Propagation (RC1)

**File**: `src/hooks/usePropagateOrgKpiValue.ts` — `fetchTargetKpis()`

Change `.eq('kra_name', kraName)` → use PostgREST `ilike` with escaped special characters for both kra_name and kpi_name queries (exact match and fallback).

```js
const escaped = kraName.replace(/[%_]/g, '\\$&');
query = query.ilike('kra_name', escaped);
```

Same for `kpi_name` matching.

### Fix 2: Case-Insensitive Map Lookups (RC4, RC5)

**File**: `src/pages/Dashboard.tsx` — `getOrgKpiValue()`

Normalize map keys to lowercase when building `orgKpiValuesMap` and when looking up values.

**File**: `src/hooks/useOrgKpiValues.ts` — Normalize kra_name/kpi_name to lowercase in the map keys used for matching in `OrgKpiDataEntry.tsx`.

**File**: `src/pages/admin/OrgKpiDataEntry.tsx` — Use lowercase keys for `existingValuesMap` lookups.

### Fix 3: Propagation Gap Warning (RC2, RC3)

**File**: `src/pages/admin/OrgKpiDataEntry.tsx`

The partial propagation toast already exists (line 576-582) but only fires when `propagatedScopeIds.length > 0`. Enhance to also count skipped employees (null values) and show a more actionable message. Add a "Re-propagate" action for entered-but-not-propagated values.

### Fix 4: Visual Status Distinction

**File**: `src/components/admin/OrgKpiEntryCard.tsx`

Add a clear visual distinction between "Value Entered" (orange) and "Propagated to Scorecards" (green). Currently the status badge may mislead admins.

### Fix 5: Fuzzy KRA Name Matching Fallback (RC3)

**File**: `src/hooks/usePropagateOrgKpiValue.ts` — `fetchTargetKpis()`

After case-insensitive exact match returns 0 results, add a second fallback using `ilike('%' + kraNameEscaped + '%')` to catch partial name variants like "Control dust emission" matching "Control dust emission to make the plant environment compliant". Only use this if the original KRA name is a substring.

### Files Modified
1. `src/hooks/usePropagateOrgKpiValue.ts` — Case-insensitive + fuzzy matching
2. `src/pages/Dashboard.tsx` — Normalize org KPI map keys
3. `src/pages/admin/OrgKpiDataEntry.tsx` — Normalize map keys + enhanced gap warnings
4. `src/hooks/useOrgKpiValues.ts` — Normalize key matching
5. `src/components/admin/OrgKpiEntryCard.tsx` — Status badge clarity

