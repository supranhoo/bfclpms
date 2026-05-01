
# KPI Uniqueness & Standardization — Long-Term Solution

## The Problem (from your data)

Your database shows clear evidence of the issue:
- **Same KPI, different KRA names**: e.g., "Achieve FADs production target" appears under KRA "Achieve organization's production target" for some employees but under a slightly different KRA for others.
- **Same intent, different text**: e.g., "100% time execution of new HR interventions" has two variants — one says "Adherence to timeline" and the other "Adherenec to timeline" (typo). Both are separate Org KPIs with 7 and 4 employees respectively.
- **Same KPI, different scopes**: "Achieve FADs production target" exists as both `employee` scope (3 employees) and `organization` scope (1 employee).

**Current uniqueness constraint**: `(employee_id, review_period, review_year, kra_name, kpi_name)` — this prevents the *same employee* from having duplicates, but does NOT enforce naming consistency *across* employees.

---

## Proposed Solution: Three-Layer Architecture

### Layer 1 — Master KPI Registry (New Table: `kpi_definitions`)

A single canonical registry of all approved KPI definitions:

```text
kpi_definitions
├── id (uuid, PK)
├── canonical_name (text, UNIQUE)        -- "Achieve FADs production target"
├── canonical_kra_name (text)            -- "Achieve organization's production target"
├── category_id (uuid, FK)
├── description (text)
├── default_uom / default_uom_type
├── default_frequency
├── default_criteria
├── default_thresholds (r0-r5)
├── default_target_value
├── allows_custom_target (boolean)       -- KEY: can employees have different targets?
├── allows_custom_thresholds (boolean)   -- KEY: can rating slabs differ per employee?
├── is_active (boolean)
├── created_by / updated_at
└── ref_code (text)
```

**Why this solves Problem #1**: Every KPI maps to exactly one `kpi_definition_id`. No more free-text KPI names diverging across employees.

**Why this solves Problem #2**: The `allows_custom_target` and `allows_custom_thresholds` flags let the same KPI definition have different scoring parameters per employee while keeping the KPI identity unified.

### Layer 2 — Link KPIs to Definitions

Add `kpi_definition_id (uuid, FK)` to the existing `kpis` table. This creates a soft link:

- **Existing KPIs**: Continue working as-is (kpi_definition_id = NULL for legacy records)
- **New KPIs**: Must reference a definition from the registry
- **Migration path**: A reconciliation tool matches existing free-text KPI names to definitions

When `allows_custom_target = true`:
- The employee's `kpis.target_value` and `kpis.r0-r5` override the definition defaults
- The KPI name, KRA name, UOM, frequency remain locked to the definition

When `allows_custom_target = false`:
- Target and thresholds are inherited from the definition (or from the Org KPI value)

### Layer 3 — Org KPI Enforcement

Org KPIs (`is_org_level = true`) already enforce shared scoring. The enhancement:

- Org KPIs MUST reference a `kpi_definition_id`
- When propagating, the definition's canonical name is used — no free-text entry
- The existing `kpi_templates` table (925 active templates) becomes a **source** for populating `kpi_definitions`, not the assignment mechanism

---

## Implementation Phases

### Phase 1: Data Cleanup Tool (Immediate Value)

Build an admin tool to identify and merge duplicate KPIs:

1. **Similarity Detection**: Fuzzy-match KPI names across all employees using normalized text comparison (lowercase, trim, collapse whitespace, strip trailing punctuation)
2. **Merge UI**: Admin selects the "canonical" version, and all duplicates are re-pointed to the same KRA name + KPI name
3. **Scope**: Only affects `kpis` table text fields — no schema changes needed
4. **Audit**: Every merge logged with before/after values

This gives you immediate relief while the full registry is built.

### Phase 2: Master KPI Registry

1. Create `kpi_definitions` table
2. Auto-populate from existing unique (category_id, kra_name, kpi_name) combinations
3. Admin UI to review, merge, and approve definitions
4. Mark which definitions allow custom targets/thresholds

### Phase 3: Enforce Definition Linkage

1. Add `kpi_definition_id` to `kpis` table
2. Back-fill existing KPIs by matching text to definitions
3. Update KPI creation flows (Smart Assignment, Copy KRAs, Bulk Import) to require selecting from the registry
4. Org KPI creation enforces registry selection
5. Add DB trigger: new KPIs without `kpi_definition_id` are rejected (after migration period)

### Phase 4: Custom Target Support

1. When creating an employee's KPI from a definition with `allows_custom_target = true`:
   - Employee-level target/threshold fields remain editable
   - Org KPI value entry shows per-employee target column
2. When `allows_custom_target = false`:
   - Target/thresholds are read-only, inherited from definition or Org KPI

---

## How This Handles Your Two Scenarios

### Scenario 1: "Same KPI written differently for 2 employees"
- Both employees link to the same `kpi_definition_id`
- KPI name is locked to the canonical version
- Reports, matrices, and aggregations group them correctly
- Org KPI data entry shows them as one KPI, not two

### Scenario 2: "Same-looking KPI but scored differently per employee"
- Same `kpi_definition_id`, but `allows_custom_target = true`
- Employee A has target = 100, R5 = 120
- Employee B has target = 200, R5 = 240
- Both appear as the same KPI in reports but their scores are calculated against their own targets

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Existing data disruption | High | Phase 1 is text-only cleanup; no schema changes |
| Historical score integrity | High | `kpi_definition_id` is additive; existing data untouched |
| Workflow disruption | Medium | Phased rollout; registry is optional in Phase 2, mandatory in Phase 3 |
| Template system overlap | Low | `kpi_templates` feeds into `kpi_definitions`; no conflict |

---

## Decision Points for You

1. **Should we start with Phase 1 (cleanup tool) immediately?** This gives quick wins without any schema changes.

2. **Custom targets**: For KPIs like production targets where different plants/departments have different numbers — should the target customization be at the employee level, department level, or both?

3. **Enforcement timing**: When should free-text KPI creation be blocked? Next fiscal year? Immediately for new KPIs only?

4. **Existing 925 templates**: Should the registry be seeded from templates, from actual KPI data, or both?

Let me know which phase you'd like to start implementing, or if you want to adjust the approach.
