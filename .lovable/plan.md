

## Plan: Fix Company Name Error + Multi-Company Support with Structure Cloning

### Problem 1: "Cannot coerce the result to a single JSON object"
**Root cause**: `useUpdateSystemSetting` uses `.update().eq('setting_key', key).single()`. When `company_name` doesn't exist in `system_settings`, the update matches 0 rows and `.single()` crashes.

**Fix**: Change `useUpdateSystemSetting` to use `.upsert()` instead of `.update()`, so it creates the row if missing.

### Problem 2: Multi-Company Support
Currently company name is a single string in `system_settings`. Need a proper `companies` table and the ability to link org structure entities to companies, plus clone structure between companies.

---

### Changes

**1. Database Migration — Create `companies` table**

```sql
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
-- RLS: authenticated users can read; admins can write

ALTER TABLE public.divisions ADD COLUMN company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.designations ADD COLUMN company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.pms_grades ADD COLUMN company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.levels ADD COLUMN company_id UUID REFERENCES public.companies(id);
```

Migrate existing `company_name` from `system_settings` into a default company row. Backfill existing divisions/designations/grades/levels with that company's ID.

**2. `src/hooks/useSystemSettings.ts`** — Fix upsert

Change `useUpdateSystemSetting` from `.update()` to `.upsert()` with `onConflict: 'setting_key'` and use `.maybeSingle()` instead of `.single()`.

**3. `src/hooks/useCompanies.ts`** — New hook

- `useCompanies()` — fetch all companies
- `useCreateCompany()` — create company
- `useDeleteCompany()` — delete (only if no linked entities)
- `useCloneStructure()` — clone divisions/BUs/departments/sub-branches/designations/grades/levels from source company to target company

**4. `src/pages/admin/Organization.tsx`** — Multi-company UI

- Replace inline company name editor with a **Company selector dropdown** at the top
- Add "Manage Companies" button opening a dialog to create/edit/delete companies
- Add "Clone Structure From..." button that opens a dialog to select source company and pick which entity types to clone (divisions, BUs, departments, sub-branches, designations, grades, levels)
- Filter all tab data by selected `company_id`
- All create entity mutations now include `company_id`

**5. `src/hooks/useOrganization.ts`** — Add company_id filter

Update `useDivisions`, `useDesignations`, `usePmsGrades`, `useLevels` to accept optional `companyId` parameter and filter accordingly. BUs/Departments/Sub-branches inherit company context through their parent division.

**6. `POLICY.md`** — New invariant for multi-company isolation

**7. `DOCUMENTATION.md`** — v2.15.61

---

### Clone Structure Flow

```text
┌─────────────────────────────────┐
│  Clone Structure From...        │
│                                 │
│  Source Company: [Company A ▼]  │
│                                 │
│  ☑ Divisions                    │
│  ☑ Business Units               │
│  ☑ Departments                  │
│  ☑ Sub-Branches                 │
│  ☑ Designations                 │
│  ☑ PMS Grades                   │
│  ☑ Levels                       │
│                                 │
│  [Cancel]  [Clone Selected]     │
└─────────────────────────────────┘
```

Cloning creates new rows with the target company's ID, preserving names/codes and parent relationships (re-mapped to newly created parent IDs).

### Files Created/Modified

| File | Change |
|------|--------|
| Migration | Create `companies` table, add `company_id` FK to divisions/designations/pms_grades/levels, backfill |
| `src/hooks/useSystemSettings.ts` | Fix upsert for missing keys |
| `src/hooks/useCompanies.ts` | New — CRUD + clone hooks |
| `src/hooks/useOrganization.ts` | Add optional `companyId` filter |
| `src/pages/admin/Organization.tsx` | Company selector, manage companies dialog, clone structure dialog |
| `POLICY.md` | Multi-company data isolation invariant |
| `DOCUMENTATION.md` | v2.15.61 |

### Risk
- **Medium** — Adding `company_id` to existing tables requires backfill; existing queries that don't filter by company will still work (nullable FK)
- **Mitigation**: Default company auto-assigned to all existing data; FK is nullable so no breaking changes

