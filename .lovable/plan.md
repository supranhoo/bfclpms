

## KRA Library → KPI Master: Propagate Template Changes to Live KPIs

### Current State

The KRA Library (`kpi_templates` table) is **disconnected** from live KPIs (`kpis` table). Templates are only used at assignment time — once a KPI is created for an employee, it has no back-link to the template. Editing a template today changes nothing for existing employees.

### What We Will Build

Transform the KRA Library into a **KPI Master** where editing a template propagates structural changes to all linked live KPIs, with:
- Effective month/year control
- Employee selection (all linked or specific subset)
- Org KPI vs Individual KPI awareness
- Audit trail of all propagated changes
- Dry-run preview before applying

---

### Phase 1: Database Foundation — Link KPIs to Templates

**Migration 1: Add `source_template_id` to `kpis` table**

```sql
ALTER TABLE kpis ADD COLUMN source_template_id uuid REFERENCES kpi_templates(id) ON DELETE SET NULL;
CREATE INDEX idx_kpis_source_template ON kpis(source_template_id);
```

**Migration 2: Backfill existing KPIs**

Match existing KPIs to templates using `(kra_name, kpi_name, category_id)` case-insensitive matching:
```sql
UPDATE kpis k
SET source_template_id = t.id
FROM kpi_templates t
WHERE lower(k.kra_name) = lower(t.kra_name)
  AND lower(k.kpi_name) = lower(t.kpi_name)
  AND k.category_id = t.category_id
  AND k.source_template_id IS NULL;
```

**Migration 3: Create `template_change_logs` table**

Tracks every propagation event for audit:
```sql
CREATE TABLE template_change_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES kpi_templates(id) NOT NULL,
  changed_by uuid NOT NULL,
  effective_month text NOT NULL,
  effective_year integer NOT NULL,
  fields_changed jsonb NOT NULL,  -- {field: {old, new}}
  employees_affected integer DEFAULT 0,
  kpis_updated integer DEFAULT 0,
  scope text DEFAULT 'all',  -- 'all' | 'selected'
  selected_employee_ids uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE template_change_logs ENABLE ROW LEVEL SECURITY;
-- Admin-only access
CREATE POLICY "Admins can manage template change logs"
  ON template_change_logs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'));
```

---

### Phase 2: Backend Edge Function — `propagate-template-change`

A new edge function that:

1. Receives: `template_id`, changed fields (old/new values), `effective_month`, `effective_year`, `employee_ids` (optional — empty means all linked)
2. Queries all KPIs linked via `source_template_id` where `review_period` falls on or after the effective month
3. Only updates **structural fields** (never touches scores/submissions): `target_value`, `weightage`, `uom`, `criteria`, `r5-r0`, `source_of_data`, `frequency`, `uom_type`, `qualitative_options`, `threshold_mode`, `kra_name`, `kpi_name`
4. Filters by employee_ids if provided
5. Skips KPIs with status `'approved'` (already finalized)
6. Returns a summary: count of KPIs updated, employees affected, any skipped records
7. Logs the change to `template_change_logs`

---

### Phase 3: Enhanced KRA Library UI

**3A: "Linked Employees" column in template table**

- Show count of live KPIs linked to each template (via `source_template_id`)
- Clickable to expand and see employee names

**3B: "Edit & Propagate" action on each template**

When editing a template, the dialog gains a new **Propagation Settings** section (below the form):

```
┌─────────────────────────────────────────────────┐
│  Propagation Settings                           │
│                                                 │
│  ☑ Propagate changes to linked KPIs             │
│                                                 │
│  Effective From: [March ▼] [2026 ▼]             │
│                                                 │
│  Scope: ○ All linked employees (47)             │
│         ○ Selected employees only               │
│         ┌──────────────────────────────┐        │
│         │ ☑ Ankit Choudhary            │        │
│         │ ☑ Rahul Sharma               │        │
│         │ ☐ Priya Singh                 │        │
│         └──────────────────────────────┘        │
│                                                 │
│  Fields that changed:                           │
│  • Target Value: 7 → 10                         │
│  • R5: 10 → 12                                  │
│                                                 │
│  [Preview Impact]  [Save & Propagate]           │
└─────────────────────────────────────────────────┘
```

**3C: "Preview Impact" dry-run**

Before applying, show a summary table:
- How many KPIs will be updated
- Which months will be affected
- Which employees
- Which KPIs are skipped (already approved)

**3D: Template Change History**

A new dropdown action "View Change History" per template, showing a timeline of all propagation events from `template_change_logs`.

---

### Phase 4: Safeguards & Edge Cases

| Scenario | Handling |
|----------|----------|
| KPI already approved | Skipped — never modify finalized KPIs |
| KPI has active scores (self_score etc.) | Only structural fields updated, scores untouched |
| Org-level KPI | Propagates to ALL employees who have that KPI (via `is_org_level` + name matching) |
| Employee not linked to template | Offer option to also create new KPI for unlinked employees |
| Frequency change | Handled with `resolveToActiveMonth` to avoid period conflicts |
| KRA/KPI name change | Updates all linked KPIs AND their `review_submissions` references |
| Duplicate constraint violation | Caught and reported per-employee in the summary |

---

### Files to Create/Modify

| File | Change |
|------|--------|
| **New migration** | Add `source_template_id` to `kpis`, backfill, create `template_change_logs` |
| **`supabase/functions/propagate-template-change/index.ts`** | New edge function for batch propagation |
| **`src/hooks/useKpiTemplates.ts`** | Add `useLinkedKpiCount()` hook, `usePropagateTemplateChange()` mutation |
| **`src/components/admin/TemplateFormDialog.tsx`** | Add propagation settings section with employee selector + effective month |
| **`src/components/admin/TemplatePropagationPreview.tsx`** | New: dry-run preview dialog |
| **`src/components/admin/TemplateChangeHistory.tsx`** | New: change log timeline component |
| **`src/pages/admin/KRALibrary.tsx`** | Add "Linked" column, "View History" action, enhanced stats cards |
| **`src/components/admin/BulkTemplateAssignDialog.tsx`** | Set `source_template_id` when assigning |
| **`src/components/admin/BundleAssignDialog.tsx`** | Set `source_template_id` when assigning |
| **`src/components/admin/SmartAssignmentDialog.tsx`** | Set `source_template_id` when assigning |
| **`src/components/admin/AdminKpiCreateDialog.tsx`** | Set `source_template_id` if created from template |

### Execution Order

1. Database migration (schema + backfill)
2. Edge function for propagation
3. Update all assignment flows to write `source_template_id`
4. Enhanced TemplateFormDialog with propagation UI
5. Preview and history components
6. KRALibrary page enhancements

