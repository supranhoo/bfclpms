

## Make Eligibility Data Entry Columns Dynamic (Admin-Configurable)

### Problem
The eligibility data entry grid has hardcoded columns (Absent Days, LWP Days, Warning Letter, Suspended, Contract Worker, LTI Count, Dept LTI Count, Total Working Days, Present Days, etc.). If a new scope or field is needed (e.g., "Safety Score", "Quality Demerits"), it requires code changes. Removing unused columns is also impossible without developer intervention.

### Solution
Replace hardcoded columns with a **dynamic field definition** system. Admin defines which fields appear per program, and the eligibility table stores flexible data in a JSONB column alongside the core fixed fields.

### Approach

#### 1. New DB table: `incentive_eligibility_fields`

```
id uuid PK,
program_id uuid FK → incentive_programs (nullable — null = global),
field_key text NOT NULL (e.g. 'absent_days', 'safety_score'),
field_label text NOT NULL (e.g. 'Absent Days', 'Safety Score'),
field_type text NOT NULL ('number' | 'boolean' | 'text'),
is_required boolean DEFAULT false,
default_value text,
sort_order int DEFAULT 0,
is_active boolean DEFAULT true,
created_at timestamptz DEFAULT now()
```

Seed with the current hardcoded fields (absent_days, lwp_days, has_warning_letter, is_suspended, is_contract_worker, lti_count, department_lti_count) as default global entries. Admin can add/remove/reorder.

#### 2. Add JSONB column to `employee_incentive_eligibility`

```sql
ALTER TABLE employee_incentive_eligibility
ADD COLUMN custom_fields jsonb DEFAULT '{}';
```

Core fields (absent_days, lwp_days, etc.) remain as typed columns for backward compatibility. Any new admin-added fields are stored in `custom_fields` as key-value pairs.

#### 3. New UI: Field Configuration (sub-tab in each Program card)

Add a **"Fields"** sub-tab alongside Mapping / Slabs / DQ Rules in the program accordion. Admin can:
- See all active fields (global + program-specific)
- Add new field: label, type (number/boolean/text), required, default value
- Reorder via sort_order
- Deactivate fields (soft delete — data preserved)

#### 4. Update `EligibilityDataEntry.tsx`

- Fetch active fields from `incentive_eligibility_fields` (global + selected program)
- Render table columns dynamically from field definitions
- For core fields (absent_days, etc.): read/write the typed column
- For custom fields: read/write from `custom_fields` JSONB
- Export template includes all active field labels
- Import maps Excel headers to field keys

#### 5. Update eligibility status logic

`getEligibilityStatus()` currently checks hardcoded fields. Change it to evaluate against the program's active DQ rules + field definitions, so new boolean fields can participate in disqualification if linked to a DQ rule.

### Files

**New:**
- DB migration: `incentive_eligibility_fields` table + seed rows + `custom_fields` column on eligibility table
- Field config component (small form inside program accordion)

**Modified:**
- `src/pages/admin/IncentiveConfig.tsx` — add "Fields" sub-tab per program
- `src/components/incentive/EligibilityDataEntry.tsx` — dynamic column rendering
- `src/hooks/useIncentiveEligibility.ts` — handle custom_fields in upsert/bulk
- `src/hooks/useIncentivePrograms.ts` — add field CRUD hooks
- `supabase/functions/compute-monthly-incentives/index.ts` — read custom_fields when evaluating DQ

