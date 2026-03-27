

## Add "Plant Incentive" Type & Custom Program Types

### Problem
The Type dropdown in Create/Edit Program dialogs only has two hardcoded options ("Support Functions" and "Production & Maintenance"). User needs "Plant Incentive" added and the ability to create custom types from the frontend.

### Approach
Store custom program types in a new DB table `incentive_program_types`. Seed it with the 3 built-in types. The Type dropdown in both Create and Edit dialogs will be driven by this table, with an inline "Add New Type" option.

### Implementation

**1. Database Migration**
- Create `incentive_program_types` table: `id uuid PK`, `value text UNIQUE NOT NULL`, `label text NOT NULL`, `created_at timestamptz`
- Seed 3 rows: `(support, "Support Functions")`, `(production, "Production & Maintenance")`, `(plant, "Plant Incentive")`
- RLS: allow authenticated users to select; admin-only insert/delete

**2. New Hook — `src/hooks/useIncentiveProgramTypes.ts`**
- `useIncentiveProgramTypes()` — fetches all types ordered by label
- `useCreateProgramType()` — inserts a new custom type
- `useDeleteProgramType()` — deletes a custom type (only if no programs reference it)

**3. Shared Type Selector Component — `src/components/incentive/ProgramTypeSelector.tsx`**
- Renders a `Select` dropdown populated from the DB query
- Last option: "+ Add New Type" — shows an inline input + confirm button
- Used in both Create dialog and EditProgramForm

**4. Update `src/pages/admin/IncentiveConfig.tsx`**
- Replace hardcoded `<Select>` for Type in both Create dialog (line 192-198) and EditProgramForm (line 258-264) with `<ProgramTypeSelector>`
- Update Badge display (line 105-107) to show the label from the types query instead of raw `program_type` value

**5. Update `src/components/incentive/IncentiveSlabEditor.tsx`**
- Update the `programType` prop type from `'production' | 'support'` to `string` to support custom types

**6. Documentation** — `DOCUMENTATION.md` and `POLICY.md` version history

### Risk Assessment
- **Data Impact**: New table only; existing `program_type` string column unchanged — backward compatible
- **Regression Risk**: Minimal — replacing static dropdown with dynamic one; existing values still work
- **Workflow Impact**: None — additive feature

### Files Changed
1. **DB Migration** — new `incentive_program_types` table + seed data
2. `src/hooks/useIncentiveProgramTypes.ts` — new hook
3. `src/components/incentive/ProgramTypeSelector.tsx` — new shared selector
4. `src/pages/admin/IncentiveConfig.tsx` — use new selector
5. `src/components/incentive/IncentiveSlabEditor.tsx` — widen prop type
6. `DOCUMENTATION.md`, `POLICY.md`

