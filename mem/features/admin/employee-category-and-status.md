---
name: Employee Category & Employment Status
description: Descriptive master-driven profile attributes (employee_category, employment_status); strict import validation; no scoring/workflow impact
type: feature
---
- Two profile attributes: `profiles.employee_category` (text, nullable) and `profiles.employment_status` (text, nullable). Stored as names, mirrors `pms_grade` pattern.
- Masters: `public.employee_categories` (company-scoped) and `public.employment_statuses` (global, seeded: Probation / Trainee / Confirmed / Superannuated / Retainer). Admin CRUD lives on `/admin/organization`.
- Hooks: `useEmployeeCategories(companyId?)`, `useEmploymentStatuses()` in `src/hooks/useOrganization.ts` — never hardcode the values anywhere.
- Write paths that MUST validate against master (case-insensitive): UserManagement dialogs, `create-employee` edge function (returns HTTP 400 `Unknown employee category|status: 'X'` on miss), ImportData per-row validation.
- Import: strict mode — unknown values produce row errors, row is skipped. NEVER auto-create master rows from importer.
- Export Employees emits `employeeCategory` + `employmentStatus` columns; header casing matches importer aliases for clean round-trip.
- These attributes are descriptive only — DO NOT use them in scoring, workflow resolution, eligibility, weightage, incentives or RBAC.
