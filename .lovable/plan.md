

Let me first inspect the current slabs schema and editor to design this properly.
<lov-tool-use id="toolu_vrtx_01ExpeUTRi1ZzW5jKGAmSzrB" name="supabase--read_query" integration-id="supabase" data="{\"query\": \"SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='incentive_slabs' ORDER BY ordinal_position;\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_014hvnWCYs3XLujujhXpFhdJ" name="supabase--read_query" integration-id="supabase" data="{\"query\": \"SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='incentive_slabs' ORDER BY ordinal_position;\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_016pxwZxhSRAaFqegYJ2GpMw" name="code--search_files" integration-id="code" data="{\"query\": \"incentive_slabs\", \"include_patterns\": \"*.ts,*.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_013gKXm55ctZGR5p6jWpMQfG" name="code--view" integration-id="code" data="{\"file_path\": \"supabase/functions/compute-monthly-incentives/index.ts\", \"lines\": \"1-100\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01YNj9zXmQshF5XskAsAmFJj" name="code--search_files" integration-id="code" data="{\"query\": \"matched_slab|slab_category.*pms_score|slabs.find|slabs.filter\", \"search_dir\": \"supabase/functions/compute-monthly-incentives\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01UcP5atA1WEqWE9VYboHZNR" name="code--view" integration-id="code" data="{\"file_path\": \"supabase/functions/compute-monthly-incentives/index.ts\", \"lines\": \"370-410\"}">
</lov-tool-use>
I have enough context. Let me draft the plan.

<lov-plan>

## Plan: Multi-Dimension Slab Scoping + "Effective From"

### Scope
Today an Incentive Slab row only carries optional `business_unit_id`, `department_id`, and `applicable_designations`. Extend slabs so admins can scope a slab row by **Company, Division, Business Unit, Department, Designation (Level), Location, PMS Level (rating), Grade**, plus an **Effective From** date. Same row applies to all current and future programs because the change is at the table level.

### Database Change

Add nullable scope columns + effective date to `incentive_slabs`:
```sql
ALTER TABLE public.incentive_slabs
  ADD COLUMN company_id    uuid REFERENCES public.companies(id),
  ADD COLUMN division_id   uuid REFERENCES public.divisions(id),
  ADD COLUMN location_id   uuid REFERENCES public.locations(id),
  ADD COLUMN grade_id      uuid REFERENCES public.grades(id),
  ADD COLUMN pms_level     text,                    -- e.g. 'R-1' .. 'R-5'
  ADD COLUMN effective_from date NOT NULL DEFAULT CURRENT_DATE;

-- Backfill existing rows
UPDATE public.incentive_slabs
   SET effective_from = COALESCE(effective_from, created_at::date);

CREATE INDEX idx_slabs_program_eff ON public.incentive_slabs(program_id, effective_from DESC);
```
- All new columns are NULL-able → `NULL = "applies to all"` (no breakage of existing rows).
- `applicable_designations text[]` already exists → reused for **Designation (Level)** scope.
- No unique index changes; multiple dated rows allowed per scope combo.

### UI Mock — `IncentiveSlabEditor.tsx`

```text
┌─ Incentive Slabs ─────────────────────────────────────────────┐
│ Category: [PMS Score ▾] ⚙                                     │
│                                                               │
│ Filter rows by:                                               │
│ [Company ▾] [Division ▾] [BU ▾] [Dept ▾] [Designation ▾]     │
│ [Location ▾] [PMS Level ▾] [Grade ▾]                          │
│                                                               │
│ ┌── Add / Edit Slab ────────────────────────────────────────┐ │
│ │ Scope (leave blank = applies to all):                     │ │
│ │ Company:[BFCL ▾] Division:[—▾] BU:[—▾] Dept:[Production▾] │ │
│ │ Designation:[—▾] Location:[Plant-1 ▾] PMS Level:[R-4 ▾]   │ │
│ │ Grade:[M2 ▾]                                              │ │
│ │                                                           │ │
│ │ Min:[4.0]  Max:[4.25]  Incentive%:[5]  Rating:[R-4]      │ │
│ │ With Effect From: [📅 01 Apr 2026]                        │ │
│ │ Sub-Category:[ — ]   [Save Slab]                          │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                               │
│ Scope                       │ Min │ Max │ Inc% │ Eff From    │
│ BFCL · Production · Plant-1 │ 4.0 │ 4.25│ 5%   │ 01 Apr 2026 │
│ All                         │ 3.5 │ 3.99│ 3%   │ 01 Jul 2025 │
│ (superseded rows greyed)                                      │
└───────────────────────────────────────────────────────────────┘
```
- Filter chips on top scope the visible rows.
- The "Add Slab" form gains 8 selectors + 1 date picker. All scope selectors default to "—" (none / applies-to-all).
- A row is rendered with a badge stack (Company · Div · BU · Dept · Desig · Loc · PMS · Grade) so admins instantly see what each row applies to.
- Latest-effective row per scope appears bold; older rows greyed with "superseded" pill.

### Compute Engine — `compute-monthly-incentives/index.ts`

Replace the simple `slabs.filter(...)` slab match with a **specificity-scored resolver**:

1. Filter slabs by `slab_category` and `effective_from <= periodEndDate`.
2. For each slab compute a specificity score = count of non-NULL scope fields that match the employee's resolved chain (employee → dept → BU → div → company; plus location, designation, grade, pms_level).
3. Reject slabs where any non-NULL scope field does **not** match the employee.
4. Among matches in the value range `min ≤ score ≤ max`, pick (a) highest specificity, then (b) latest `effective_from`.

This means a Company-specific 5% slab beats a generic 3% slab when both bracket the score, mirroring the production-rate cascade introduced earlier.

### Files Touched

| File | Change |
|---|---|
| `supabase/migrations/...` (new) | Add 5 scope columns + `effective_from` + index; backfill |
| `src/components/incentive/IncentiveSlabEditor.tsx` | New scope selectors, date picker, scope filter chips, specificity badges, supersede styling |
| `src/hooks/useIncentivePrograms.ts` | Extend slab fetch (`select` joins for company/division/location/grade names) and `useUpsertSlab` payload |
| `src/integrations/supabase/types.ts` | Auto-regenerated |
| `supabase/functions/compute-monthly-incentives/index.ts` | Specificity-scored slab resolver with date filter |
| `supabase/functions/detect-retroactive-incentive-changes/index.ts` | Same resolver (so retro detection sees the same slab a fresh compute would) |
| `DOCUMENTATION.md` / `POLICY.md` | v2.66.x — Slab multi-dimension scope + effective dating |

### Risk & Impact

| Area | Impact |
|---|---|
| Data | Additive nullable columns + safe backfill; no existing row breaks |
| Workflow | None — defaults preserved (NULL scope = applies to all, as today) |
| Compute | Slab match now specificity-scored; rows without explicit scope still match everyone |
| Regression | Low — single resolver function; old single-row programs continue to behave identically |
| Mitigation | Recompute open month after rollout; greyed "superseded" UI prevents accidental edits of historical rows |

### Out of Scope
- Bulk import of slabs with scope columns
- Per-slab "effective to" (handled implicitly by next dated row)
- Editing scope on saved rows (admin can delete + re-add, or we can extend Edit row in a follow-up)

