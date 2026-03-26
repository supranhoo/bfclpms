

## Enhanced Employee Profile with Skill Competency & JD

### Overview
Transform the current narrow settings page into a comprehensive employee profile with 4 tabs: Overview, KRA Summary, Skill Competency, and Settings. Requires 2 new database tables for JD and competencies.

### Database Changes (2 new tables)

**Table 1: `employee_job_descriptions`**
- `id` uuid PK
- `designation` text NOT NULL (links to designation name, not per-employee)
- `role_purpose` text
- `key_responsibilities` jsonb (array of strings)
- `required_skills` jsonb (array of strings)  
- `qualifications` text
- `created_by` uuid
- `created_at`, `updated_at` timestamps
- RLS: Admins can manage, authenticated can read

**Table 2: `skill_competencies`**
- `id` uuid PK
- `employee_id` uuid NOT NULL (references profiles)
- `skill_name` text NOT NULL
- `category` text (e.g. "Technical", "Behavioral", "Leadership")
- `required_level` integer (1-5 scale)
- `current_level` integer (1-5 scale)
- `assessed_by` uuid
- `assessed_at` timestamp
- `review_year` integer
- `review_period` text
- `remarks` text
- `created_at`, `updated_at` timestamps
- RLS: Employee can view own, manager can view/update team, admin full access

### Page Redesign — `src/pages/ProfileSettings.tsx`

**Hero Header** (full width, replaces current narrow layout):
- Large avatar with upload overlay (reuse existing logic)
- Name, Designation, Department badge
- Info chips: Employee Code, PMS Grade, Division, Reporting Manager
- Date of Joining

**4-Tab Layout** using existing `Tabs` component:

**Tab 1 — Overview** (default)
- **Organization Info Card**: Division > BU > Department > Sub-Branch hierarchy, Designation, PMS Grade, Employee Code, Joining Date
- **Reporting Structure Card**: Manager avatar + name (fetched via `reporting_manager_id`)
- **Job Description Card**: Role Purpose, Key Responsibilities list, Required Skills badges, Qualifications — pulled from `employee_job_descriptions` by matching the employee's designation

**Tab 2 — Skill Competency**
- **Competency Matrix Table**: Skill Name, Category, Required Level (star/bar), Current Level (star/bar), Gap indicator
- **Visual Summary**: Radar/spider chart showing competency areas (using Recharts, already in project)
- **Gap Analysis Card**: Skills below required level highlighted, training recommendations if linked to TNI
- Managers/Admins can assess via inline editing; employees see read-only view

**Tab 3 — KRA Summary**
- Table of assigned KPIs for current review period: Category, KRA, KPI, Weightage, Status badge
- Summary stats: Total KPIs, Total Weightage, Status breakdown
- Data from existing `useKpis` hook filtered by `employee_id`

**Tab 4 — Settings** (existing functionality relocated)
- Contact Information (email, mobile inline edit — existing code)
- Change Password (existing form — existing code)

### Data Queries (no new hooks needed initially, queries in component)
- Profile: already in AuthContext (`profile`)
- Department hierarchy: `departments` JOIN `business_units` JOIN `divisions`
- Manager: secondary `profiles` query by `reporting_manager_id`
- KPIs: query `kpis` table filtered by employee_id + current review period
- JD: query `employee_job_descriptions` by designation match
- Competencies: query `skill_competencies` by employee_id

### New Components
1. `src/components/profile/ProfileHero.tsx` — Hero header with avatar, name, org chips
2. `src/components/profile/OrganizationInfoCard.tsx` — Org hierarchy display
3. `src/components/profile/ReportingStructureCard.tsx` — Manager card
4. `src/components/profile/JobDescriptionCard.tsx` — Role Purpose, Key Responsibilities, Skills
5. `src/components/profile/SkillCompetencyTab.tsx` — Competency matrix table + radar chart + gap analysis
6. `src/components/profile/KraSummaryTab.tsx` — KPI table for current period
7. `src/components/profile/ProfileSettingsTab.tsx` — Relocated email/mobile/password forms

### Admin Management (future, but schema supports it now)
- JDs are designation-based: Admin creates JD per designation, all employees with that designation see it
- Competency assessments: Manager/Admin can assess skills per employee per review period
- Links to existing TNI (Training Needs Identification) module for gap-based recommendations

### Files Changed
1. **Migration** — Create `employee_job_descriptions` and `skill_competencies` tables with RLS
2. **`src/pages/ProfileSettings.tsx`** — Complete redesign: hero + 4-tab layout
3. **`src/components/profile/ProfileHero.tsx`** (new)
4. **`src/components/profile/OrganizationInfoCard.tsx`** (new)
5. **`src/components/profile/ReportingStructureCard.tsx`** (new)
6. **`src/components/profile/JobDescriptionCard.tsx`** (new)
7. **`src/components/profile/SkillCompetencyTab.tsx`** (new)
8. **`src/components/profile/KraSummaryTab.tsx`** (new)
9. **`src/components/profile/ProfileSettingsTab.tsx`** (new) — Extracted existing settings code

### Risk Assessment
- **Data Impact**: Two new tables, no changes to existing schemas. JD is designation-based (not per-employee), keeping data normalized
- **Workflow Impact**: None — existing settings functionality preserved in Settings tab
- **Regression Risk**: Low — self-contained page, existing avatar/email/password logic extracted but unchanged
- **Security**: RLS enforces employee can only see own competencies; managers see team; admins see all

