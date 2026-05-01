
# Phase 1: Forward-Only KPI Standardization

## Principle
- Past months (Sep 2025 - Apr 2026): **completely frozen, zero changes**
- May 2026 onward: all KPIs use one canonical name per concept
- Cross-month reports: alias mapping links old variants to canonical names seamlessly

---

## 3 Real-World Examples

### Example 1: Fugitive PM10 Emission KPI (229 rows, 3 KRA variants)

**TODAY (the problem):**

| Month | KRA Name | KPI Name | Employees |
|-------|----------|----------|-----------|
| Oct 2025 | Control dust emission | Ensure Fugitive Particulate Matter (PM10/AQI)... | 7 |
| Oct 2025 | Environment compliance | Ensure Fugitive Particulate Matter (PM10)... | 3 |
| Nov 2025 | Control dust emission | Ensure Fugitive Particulate Matter (PM10/AQI)... | 17 |
| Apr 2026 | Control dust emission | Ensure Fugitive Particulate Matter (PM10/AQI)... | 31 |
| Apr 2026 | Control Dust Emission | Ensure Fugitive Particulate Matter (PM10/AQI)... | 2 |
| Apr 2026 | Control dust emission to make the plant environment compliant | Ensure Fugitive Particulate Matter (PM10/AQI)... | 1 |

Same KPI concept, but 3 different KRA names ("Control dust emission", "Control Dust Emission", "Environment compliance", "Control dust emission to make the plant environment compliant"). Dashboard trend views treat these as separate KPIs.

**AFTER STANDARDIZATION:**

Registry entry created:
- **Canonical KRA:** "Control Dust Emission"
- **Canonical KPI:** "Ensure Fugitive Particulate Matter (PM10/AQI) emission levels are within permissible limits(50)"

Alias mappings auto-created:
- "Control dust emission" -> links to same definition
- "Environment compliance" + PM10 KPI text -> links to same definition
- "Control dust emission to make the plant environment compliant" -> links to same definition

| Month | What happens |
|-------|-------------|
| Oct-Apr (past) | **NO CHANGE.** Rows keep original text. Alias table maps them to canonical definition for trend reports. |
| May 2026 | Existing 31 rows get KRA corrected to "Control Dust Emission" and linked to `kpi_definition_id`. |
| June+ | New KPIs auto-pick from registry. All 30+ employees get the exact same canonical text. |

**Dashboard behavior:**
- April page shows "Control dust emission" (original text, untouched)
- May page shows "Control Dust Emission" (canonical)
- Trend chart April vs May: system resolves both to same `kpi_definitions.id` via alias lookup, shows them as ONE continuous line

---

### Example 2: Grievance Resolution KPI (58 rows, 2 KRA variants)

**TODAY (the problem):**

| Month | KRA Name | KPI Name variant | Employees |
|-------|----------|-----------------|-----------|
| Sep-Apr | Timely  Grievance Resolution | "...Measures the number of employee grievances..." (Scoring: 5 for 0, 2 for 1, 0 for >1) | 21/mo |
| Sep-Apr | Timely  Grievance Resolution | "...Measures the number of reasonable employee grievances..." (Scoring: 5 for 0, 3 for 1, 0 for >1) | 9/mo |
| Sep-Apr | Timely Grievance Resolution | "...Measures the number of employee grievances..." (Scoring: 5 for 0, 3 for 1, 1 for 2, 0 for >2) | 2/mo |

Notice: KRA has "Timely  Grievance Resolution" (double space) vs "Timely Grievance Resolution" (single space). Same KPI concept, but the description text and scoring thresholds differ per employee group.

**AFTER STANDARDIZATION:**

Registry entry created:
- **Canonical KRA:** "Timely Grievance Resolution" (single space, proper casing)
- **Canonical KPI:** "Timely Resolution of Employee Grievances" (short, clean title)

**Key insight:** The scoring thresholds (5/2/0 vs 5/3/0 vs 5/3/1/0) are per-employee configurations stored in `r5/r4/r3/r2/r1/r0` columns on each KPI row. They remain **different per employee** -- only the KPI identity (name) is standardized. This is exactly what you described: "same KPI but scored differently as per defined target."

| Month | What happens |
|-------|-------------|
| Sep-Apr (past) | **NO CHANGE.** "Timely  Grievance Resolution" (double space) stays as-is in DB. Alias maps it to canonical. |
| May 2026 | All rows corrected to "Timely Grievance Resolution" (single space). Each employee keeps their own r5-r0 scoring thresholds. |
| June+ | Registry enforces clean name. Individual targets/thresholds still set per employee. |

---

### Example 3: Audit Observations Closure KPI (44 rows, 2 KRA variants)

**TODAY (the problem):**

| Month | KRA Name | KPI Name | Employees |
|-------|----------|----------|-----------|
| Oct-Apr | Closure of all Audit Points (CLC, HR, Audit,other) | Closure of Audit Observations (Multi-Departmental)... "100% closure" scoring | 9/mo |
| Oct-Apr | Compliance to CLC norm | Closure of Audit Observations (Multi-Departmental)... same KPI text | 1/mo |
| Oct-Apr | Audit | Closure of Audit Observations (Multi-Departmental)... "Rating 5: 0, Rating 2: 1" scoring | 1/mo |

Exact same KPI concept, but under 3 different KRA names: "Closure of all Audit Points (CLC, HR, Audit,other)", "Compliance to CLC norm", and "Audit".

**AFTER STANDARDIZATION:**

Registry entry created:
- **Canonical KRA:** "Closure of All Audit Points"
- **Canonical KPI:** "Closure of Audit Observations (Multi-Departmental)"

| Month | What happens |
|-------|-------------|
| Oct-Apr (past) | **NO CHANGE.** "Compliance to CLC norm" stays as-is. Alias maps all 3 KRA variants to the canonical definition. |
| May 2026 | All rows get KRA corrected to "Closure of All Audit Points". Individual scoring thresholds preserved. |
| June+ | New assignments pull from registry. One clean name for everyone. |

---

## Architecture

```text
kpi_definitions (NEW - Master Registry)
+-- id (uuid, PK)
+-- canonical_kra_name (text)
+-- canonical_kpi_name (text)
+-- category_id (uuid, FK)
+-- created_at, updated_at
+-- UNIQUE(canonical_kra_name, canonical_kpi_name, category_id)

kpi_name_aliases (NEW - Cross-Month Linking)
+-- id (uuid, PK)
+-- definition_id (uuid, FK -> kpi_definitions)
+-- variant_kra_name (text)
+-- variant_kpi_name (text)
+-- category_id (uuid, FK)
+-- UNIQUE(variant_kra_name, variant_kpi_name, category_id)

kpis table (EXISTING - add optional FK)
+-- kpi_definition_id (uuid, nullable FK -> kpi_definitions)
```

**How cross-month linking works (Example 1):**
- Dashboard fetches April KPIs: finds "Control dust emission" / PM10 KPI
- Looks up in `kpi_name_aliases`: matches -> `definition_id = abc-123`
- Dashboard fetches May KPIs: finds "Control Dust Emission" / PM10 KPI with `kpi_definition_id = abc-123`
- Both resolve to same definition -> shown as one KPI in trend charts

---

## Implementation Steps

### Step 1: Database Migration
- Create `kpi_definitions` and `kpi_name_aliases` tables with RLS
- Add nullable `kpi_definition_id` column to `kpis`
- Create `resolve_canonical_kpi()` function for dashboard queries

### Step 2: Admin Tool - Build Registry (`/admin/kpi-standardization`)
**Tab 1 - Build Registry:** System scans all unique signatures, groups near-duplicates, admin picks canonical name per group

**Tab 2 - Review Registry:** View/edit all canonical KPIs and their aliases

**Tab 3 - Correct May KPIs:** Auto-match May rows to registry, admin reviews and applies corrections

### Step 3: Soft Enforcement for June Onward
- KPI creation flows default to registry picker
- Custom names allowed but flagged "Not in registry"

### Step 4: Dashboard Cross-Month Linking
- Update report queries to use `resolve_canonical_kpi()` for grouping
- Past months show original text, trend aggregations group correctly

---

## What This Does NOT Do
- Does NOT modify any KPI rows before May 2026
- Does NOT change scoring thresholds (r5-r0) -- those remain per-employee
- Does NOT block free-text entry (soft enforcement only)
- Does NOT affect review_submissions, final_scores, or workflow status
