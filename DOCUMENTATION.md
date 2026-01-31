# Performance Management System (PMS) - Documentation

> **Last Updated:** 2026-01-31  
> **Version:** 1.3.0  
> **Maintainer:** Lovable AI

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Tech Stack & Architecture](#2-tech-stack--architecture)
3. [Database Schema](#3-database-schema)
4. [Detailed Feature Breakdown](#4-detailed-feature-breakdown)
5. [Project Structure](#5-project-structure)
6. [Key Components & Hooks](#6-key-components--hooks)
7. [Third-Party Integrations](#7-third-party-integrations)
8. [Setup & Deployment](#8-setup--deployment)

---

## 1. Executive Summary

### Overview

The **Performance Management System (PMS)** is a comprehensive enterprise-grade web application designed to streamline employee performance reviews, KPI tracking, and organizational goal alignment. It provides a multi-stage review workflow supporting self-assessments, manager evaluations, auditor checks, and management approvals.

### Problem Solved

- **Fragmented Review Processes:** Consolidates performance reviews into a single platform
- **Lack of Transparency:** Provides audit trails and real-time status tracking
- **Manual Calculations:** Automates score computation with configurable rating thresholds
- **Poor Visibility:** Dashboards for employees, managers, and leadership
- **Training Gap Identification:** Automatically detects training needs based on performance scores

### Target Users

| Role | Description |
|------|-------------|
| **Employee** | Views assigned KPIs, submits self-reviews, tracks personal performance |
| **Manager** | Reviews team members' KPIs, approves/queries submissions |
| **Auditor** | Validates manager assessments, ensures compliance |
| **Management** | Final approval authority, organizational oversight |
| **Admin** | System configuration, user management, data imports |

### Key Features

- **Multi-Module Architecture**: Hub page for navigating between enterprise modules (PMS, future HRMS, LMS)
- Multi-stage workflow with configurable review stages
- KPI templates and bundles for standardized goal-setting
- Organization-level KPIs with flexible scoping (organization-wide, department, or employee)
- Performance Improvement Plans (PIP) with milestone tracking
- Training Needs Identification (TNI) based on scores
- Comprehensive reporting suite with PDF/Excel exports
- Real-time notifications and query system
- Role-based access control with RLS policies

---

## 2. Tech Stack & Architecture

### Frontend

| Technology | Purpose |
|------------|---------|
| **React 18.3** | UI library with functional components and hooks |
| **TypeScript** | Type-safe development |
| **Vite** | Build tool and dev server |
| **React Router 6** | Client-side routing |
| **TanStack Query 5** | Server state management, caching, and synchronization |
| **Tailwind CSS** | Utility-first styling |
| **shadcn/ui** | Accessible, customizable component library |
| **Recharts** | Data visualization and charts |
| **Lucide React** | Icon library |

### Backend (Lovable Cloud / Supabase)

| Technology | Purpose |
|------------|---------|
| **Supabase** | Backend-as-a-Service (BaaS) |
| **PostgreSQL** | Relational database |
| **Row Level Security (RLS)** | Fine-grained access control |
| **Edge Functions (Deno)** | Serverless backend logic |
| **Realtime** | Live data subscriptions |
| **Storage** | File uploads (evidence documents) |

### State Management

```
┌─────────────────────────────────────────────────────────────┐
│                    Application State                        │
├─────────────────────────────────────────────────────────────┤
│  TanStack Query          │  React Context                  │
│  ├─ Server data cache    │  ├─ AuthContext (user session)  │
│  ├─ Background refetch   │  └─ Theme/UI state              │
│  ├─ Optimistic updates   │                                  │
│  └─ Mutation management  │                                  │
└─────────────────────────────────────────────────────────────┘
```

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         Client (Browser)                          │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  React App                                                  │  │
│  │  ├─ Pages (Routes)                                          │  │
│  │  ├─ Components (UI)                                         │  │
│  │  ├─ Hooks (Business Logic)                                  │  │
│  │  └─ Contexts (Global State)                                 │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                    │
│                              ▼                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Supabase Client (@supabase/supabase-js)                    │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Lovable Cloud (Supabase)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  PostgreSQL  │  │ Edge Funcs   │  │  Storage (Buckets)   │   │
│  │  + RLS       │  │  (Deno)      │  │  - review-evidence   │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  Auth        │  │  Realtime    │  │  Secrets (Vault)     │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema

### Entity Relationship Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  divisions  │────<│business_units│────<│ departments │
└─────────────┘     └─────────────┘     └─────────────┘
                                              │
                                              ▼
                                        ┌───────────┐
                                        │  profiles │
                                        └───────────┘
                                         │    │    │
                    ┌────────────────────┘    │    └────────────────────┐
                    ▼                         ▼                         ▼
              ┌──────────┐            ┌─────────────┐           ┌──────────────┐
              │   kpis   │            │ user_roles  │           │ pip (plans)  │
              └──────────┘            └─────────────┘           └──────────────┘
                    │                                                  │
                    ▼                                                  ▼
          ┌──────────────────┐                               ┌────────────────┐
          │review_submissions│                               │ pip_milestones │
          └──────────────────┘                               └────────────────┘
```

### Tables Reference

#### Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `profiles` | User profiles linked to auth.users | `id`, `email`, `full_name`, `employee_code`, `designation`, `department_id`, `reporting_manager_id`, `pms_grade` |
| `user_roles` | Role assignments | `user_id`, `role` (admin/manager/employee/auditor/management) |
| `kpis` | Key Performance Indicators | `id`, `employee_id`, `category_id`, `kra_name`, `kpi_name`, `target_value`, `weightage`, `review_period`, `review_year`, `status`, `r5-r0` (thresholds), `require_resubmit_reason` |
| `kpis` | Key Performance Indicators | `id`, `employee_id`, `category_id`, `kra_name`, `kpi_name`, `target_value`, `weightage`, `review_period`, `review_year`, `status`, `r5-r0` (thresholds) |
| `review_submissions` | Review data per KPI | `kpi_id`, `achieved_value`, `self_rating`, `manager_rating`, `auditor_rating`, `final_score`, `kpi_status`, `*_remarks` |
| `kra_categories` | KRA groupings | `id`, `name`, `weightage`, `color`, `is_org_level`, `org_scoring_mode` |

#### Organizational Hierarchy

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `divisions` | Top-level org units | `id`, `name`, `code` |
| `business_units` | Division subdivisions | `id`, `division_id`, `name`, `code` |
| `departments` | Business unit subdivisions | `id`, `business_unit_id`, `name`, `code` |
| `sub_branches` | Department subdivisions | `id`, `department_id`, `name`, `code` |
| `designations` | Job titles | `id`, `name`, `code` |
| `pms_grades` | Performance grade levels | `id`, `name`, `code`, `description` |

#### Review & Workflow

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `review_periods` | Review cycle definitions | `period_name`, `review_year`, `start_date`, `end_date`, `is_locked` |
| `performance_reviews` | Aggregate review per employee/period | `employee_id`, `review_period`, `review_year`, `overall_score`, `status` |
| `workflow_templates` | Configurable review stages | `id`, `name`, `stages` (JSONB), `is_default` |
| `workflow_config` | Template assignments | `workflow_template_id`, `config_type`, `config_value` |

#### Templates & Bundles

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `kpi_templates` | Reusable KPI definitions | `id`, `category_id`, `kra_name`, `kpi_name`, `target_value`, `weightage`, `applicable_roles`, `r5-r0` |
| `template_bundles` | Grouped templates | `id`, `name`, `department_id`, `designation` |
| `template_bundle_items` | Bundle-template junction | `bundle_id`, `template_id`, `sort_order` |
| `bundle_assignment_logs` | Assignment history | `bundle_id`, `employee_id`, `assigned_by`, `review_period` |

#### Performance Improvement Plans

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `performance_improvement_plans` | PIP records | `id`, `employee_id`, `initiated_by`, `status`, `start_date`, `end_date`, `improvement_areas`, `outcome` |
| `pip_milestones` | PIP checkpoints | `pip_id`, `description`, `milestone_date`, `status`, `expected_outcome` |
| `pip_audit_logs` | PIP change history | `pip_id`, `action`, `performed_by`, `old_value`, `new_value` |

#### Training & Queries

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `training_needs` | Identified training gaps | `employee_id`, `kpi_id`, `gap_type`, `priority`, `status` |
| `kpi_queries` | Review questions/clarifications | `kpi_id`, `raised_by`, `raised_to`, `reason`, `evidence_url`, `resolution_notes`, `resolution_evidence_url`, `status` |
| `notifications` | User notifications | `user_id`, `type`, `title`, `message`, `is_read` |

#### System & Audit

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `app_settings` | Global branding configuration (singleton) | `id`, `organization_name`, `app_name`, `logo_url`, `login_background_url` |
| `system_settings` | App configuration | `setting_key`, `setting_value` (JSONB) |
| `kpi_audit_logs` | KPI change tracking | `kpi_id`, `action`, `performed_by`, `old_value`, `new_value` |
| `kra_rollover_logs` | KRA rollover history | `source_period`, `target_period`, `kpis_copied` |
| `org_kpi_values` | Organization-level KPI scores | `category_id`, `review_period`, `achieved_value` |
| `import_progress` | Bulk import tracking | `id`, `status`, `total_rows`, `processed_rows` |

#### Storage Buckets

| Bucket | Purpose | Public |
|--------|---------|--------|
| `branding-assets` | App logo and login wallpaper images | Yes |
| `review-evidence` | Evidence documents uploaded during reviews | No |

### Row-Level Security (RLS) Policies

All tables have RLS enabled. Key policy patterns:

```sql
-- Pattern 1: Users can view own data
(auth.uid() = user_id)

-- Pattern 2: Managers can view team data
has_role(auth.uid(), 'manager') AND EXISTS (
  SELECT 1 FROM profiles 
  WHERE profiles.id = table.employee_id 
  AND profiles.reporting_manager_id = auth.uid()
)

-- Pattern 3: Admin full access
has_role(auth.uid(), 'admin')

-- Pattern 4: Role-based read access
has_role(auth.uid(), 'auditor') OR has_role(auth.uid(), 'management')
```

**Profiles Table RLS:**
- Users can view their own profile
- Managers can view direct reports
- Admins, Auditors, and Management can view all profiles

### Database Functions

| Function | Purpose |
|----------|---------|
| `has_role(user_id, role)` | Check if user has specific role |
| `get_user_role(user_id)` | Get user's primary role |
| `get_employee_workflow(employee_uuid)` | Get workflow stages for employee |
| `get_employee_workflow_info(employee_uuid)` | Get full workflow details |
| `is_period_locked(period, year)` | Check if review period is locked |
| `detect_training_needs_for_period(period, year, threshold)` | Auto-detect TNI |
| `handle_new_user()` | Trigger: Create profile on signup |
| `sync_kpi_status_from_submission()` | Trigger: Sync KPI status |
| `log_kpi_status_transition()` | Trigger: Audit logging |
| `notify_on_kpi_status_change()` | Trigger: Create notifications |
| `aggregate_sub_period_scores(kpi_id, month, year)` | Calculate monthly avg from daily/weekly submissions |
| `get_cycle_months(frequency, month, year)` | Get all months in a frequency cycle |
| `is_month_locked_for_frequency(frequency, month, year)` | Check if month is locked for multi-month frequency |
| `sync_sub_frequency()` | Trigger: Auto-derive sub_frequency from frequency |

### Enums

| Enum | Values |
|------|--------|
| `app_role` | admin, manager, employee, auditor, management |
| `review_status` | kra_set, self_review, manager_check, audit, management_review, approved |
| `kpi_status` | open, submitted, approved_by_manager, locked |
| `rating_level` | red, yellow, green, blue |
| `query_status` | open, resolved |
| `pip_status` | draft, pending_hr_approval, active, extended, completed, cancelled |
| `pip_outcome` | successful, partially_successful, unsuccessful |
| `tni_gap_type` | skill, knowledge, behavior |
| `tni_priority` | low, medium, high, critical |

---

## 4. Detailed Feature Breakdown

### 4.0 Multi-Module Architecture

**Route:** `/home` (Module Hub)

**Purpose:** Provides a centralized landing page after login where users can select which enterprise module to access.

**Flow:**
1. User logs in at `/auth`
2. Redirected to `/home` (Module Hub)
3. User selects a module (e.g., PMS)
4. Navigated to the module's dashboard (e.g., `/dashboard`)

**Database Tables:**
- `modules`: Stores available modules with code, name, description, icon, route, display_order
- `app_settings.enabled_modules`: JSONB array of enabled module codes

**Components:**
- `ModuleHub.tsx`: Main hub page with welcome message and module grid
- `ModuleCard.tsx`: Reusable card component for each module
- `MinimalHeader.tsx`: Simple header with logo and user menu (no sidebar)

**Navigation:**
- "Back to Hub" button in sidebar header allows returning to module selection
- Root path `/` redirects to `/home`

---

### 4.1 Authentication & Authorization

**Flow:**
1. User visits `/auth` → Sign in or Sign up form
2. Supabase Auth handles email/password authentication
3. On success, `handle_new_user()` trigger creates profile + default role
4. `AuthContext` loads user, profile, and role
5. `ProtectedRoute` component enforces role-based access

**Password Reset:**
- **Self-Service:** Users can click "Forgot Password?" on the login page to receive a password reset email. The email contains a link to `/reset-password` where they can set a new password. **Rate limited to 1 request per 60 seconds** to prevent abuse.
- **Admin-Initiated:** Admins can reset user passwords via the User Management page (key icon in Actions column) with two options:
  1. **Generate Reset Link:** Creates a one-time link to share with the user.
  2. **Set New Password:** Directly updates the user's password without requiring a link.
- **Admin-Initiated:** Admins can generate password reset links for any user via the User Management page (key icon in Actions column).

**Edge Cases:**
- Auto-confirm enabled (no email verification in dev)
- Password reset via `reset-password` edge function
- Session persistence via Supabase tokens

### 4.2 Global Branding

**Route:** `/admin/settings` (Branding tab)

**Purpose:** Allows admins to customize the application's visual identity.

**Configurable Elements:**
- **Organization Name:** Displayed in emails, reports, and sidebar subtitle
- **App Name:** Displayed in sidebar header and browser tab title
- **App Logo:** Custom logo shown in sidebar and login screen
- **Login Wallpapers:** Multiple background images for auto-rotating slideshow on login screen
- **Login Page Headline:** Main headline text displayed above the login form
- **Login Page Description:** Supporting text below the headline

**Implementation:**
1. Settings stored in `app_settings` table (singleton pattern - single row)
2. Images uploaded to `branding-assets` Supabase Storage bucket
3. `useAppSettings` hook fetches settings globally
4. Login page (`/auth`) features a modern split-screen design:
   - **Left side (desktop):** Wallpaper slideshow with branding overlay
   - **Right side:** Glassmorphism login card with configurable hero text
5. Sidebar (`AppSidebar`) displays dynamic app name and logo
6. Browser tab title (`document.title`) updates via `useEffect` in sidebar

**Login Screen Slideshow:**
- Supports multiple wallpapers stored in `login_wallpapers` JSONB array
- Auto-rotates every 5 seconds with fade transitions
- Slide indicators (dots) for manual navigation
- Mobile responsive: Shows subtle background overlay instead of split-screen

**Admin Multi-Wallpaper Upload:**
- Grid view of uploaded wallpapers with thumbnails
- Add/remove individual wallpapers
- Order badges showing rotation sequence
- Live slideshow preview within admin panel
- Displays cycle duration based on wallpaper count

**RLS Policies:**
- `SELECT`: Public (allows login page to load branding)
- `UPDATE`: Admin role only

**Database Schema:**
```sql
-- app_settings table columns for branding
login_wallpapers jsonb DEFAULT '[]'::jsonb  -- Array of wallpaper URLs
login_background_url text  -- Legacy single wallpaper (kept for backward compatibility)
login_hero_headline text  -- Configurable headline above login form
login_hero_description text  -- Configurable description text
```

**Fallback Behavior:**
- If no custom logo: Shows default BarChart3 icon
- If no wallpapers: Uses animated gradient background with floating blobs
- If no custom names: Uses "PMS Dashboard" and "Performance Management"
- If no hero text: Uses default "Manage performance with clarity." and "Track KPIs, conduct reviews, and drive organizational growth."

**Key Components:**
- `GlobalBrandingSettings.tsx`: Admin form for branding configuration
- `LoginSlideshow.tsx`: Reusable slideshow component for login screen
- `useAppSettings.ts`: Hook for fetching/updating branding settings

### 4.2 Dashboard (Employee View)

**Route:** `/dashboard`

**Layout Structure:**
```
┌────────────────────────────────────────────────────────────────────────────┐
│  Profile Card (Full Width)                                                 │
│  [Avatar] Name (Employee Code) / Designation / Department                  │
└────────────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────────────┐
│  Filters Row (Prominent, Full Width with subtle background)                │
│  [Filter Icon] Review Period: [Month ▼] [Year ▼]   Category: [All ▼]      │
│  Showing X of Y KPIs                                                       │
└────────────────────────────────────────────────────────────────────────────┘
┌─────────────┬──────────────────────────────────────────────────────────────┐
│ [1/6] Donut │ [5/6] Performance by Category (Horizontal Bar Chart)        │
└─────────────┴──────────────────────────────────────────────────────────────┘
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ Monthly      │ Total        │ Completed    │ Pending      │
│ Rating       │ Weighted     │ KPIs         │ KPIs         │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

**Features:**
- **Global Filters:** Period and Category filters affect ALL dashboard sections (metrics, charts, status, table)
- Profile card with compact layout: "Name (Employee Code) / Designation / Department"
- Key stat cards: Monthly Rating, Total Weighted Score, Completed, Pending
- Overall score chart (compact radial donut - 1/6 width)
- Category-wise score chart (horizontal bar - 5/6 width with 280px Y-axis for long category names)
  - **Category labels include dynamic weightage**: Each category displays its weightage percentage (e.g., "HR Operations (30%)") calculated by summing the individual KPI weightages assigned to that category for the specific employee. This ensures the displayed weightage accurately reflects the employee's unique scorecard composition rather than a static table value.
  - **All categories with mapped KPIs are shown**: Categories appear if the employee has at least one KPI assigned to that category, even if no scores have been submitted yet (displays 0% score bar)
- Review status distribution with progress bars
- KPI details table with status badges and action buttons

**Data Flow:**
```
useAuth() → user.id → useMyKpis() → Filter by Period/Category → Calculate metrics → Render
```

**Key Components:**
- `ProfileCard.tsx`: Compact employee info display
- `OverallScoreChart.tsx`: Small radial chart (innerRadius: 35, outerRadius: 50)
- `CategoryScoreChart.tsx`: Horizontal bar chart with 180px Y-axis width
- `KeyStatCard.tsx`: Stat cards with icons
- `ReviewPeriodSelector.tsx`: Month/Year dropdowns

### 4.3 KPI Self-Review

**Route:** `/my-kpis`

**Workflow:**
1. Employee views assigned KPIs for current period
2. Enters achieved value and self-rating
3. Optionally adds remarks and evidence (file upload)
4. Submits → Status changes to `submitted`
5. Notification sent to manager

**Input Types by UOM Type:**
- **Numeric KPIs**: Standard number input with auto-calculated score based on R5-R0 thresholds
- **Binary KPIs**: Yes/No option buttons with predefined ratings (Yes=R5, No=R0)
- **Tiered KPIs**: Custom dropdown options with admin-defined ratings (e.g., Compliant=R5, Partial=R3, Non-Compliant=R0)

**Score Calculation Modes:**
- `numeric`: System calculates from achieved value vs R5-R0 thresholds
- `binary`: Fixed Yes=5, No=0 scoring
- `tiered`: Admin-defined ratings per option (0-5 range)

### 4.4 Manager Review

**Route:** `/team-review`

**Workflow:**
1. Manager sees team members with KPI status counts
2. Selects employee to view their scorecard
3. Clicks "Review" on a KPI to open the Review Sheet
4. Reviews achieved values and self-ratings in context
5. Can approve, raise query, or send back via Review Sheet actions
6. Enters manager rating and remarks
7. Approved → Status moves to `manager_check`

**Review Sheet Actions:**
- **Save Draft**: Save progress without status change
- **Approve**: Move KPI to next workflow stage
- **Raise Query**: Open query dialog (requires reason)
- **Send Back**: Return KPI to employee for revision (requires reason)

**Note:** All actions are accessed through the Review Sheet, providing full KPI context before taking action.

**Query System:**
- Manager raises query → Employee notified
- Employee responds → Query resolved
- KPI returns to submitted state for re-review

### 4.5 Audit Review

**Route:** `/audit-panel`

**Features:**
- View all KPIs in `manager_check` status
- Validate manager assessments
- Add auditor score and remarks
- Approve → Moves to `audit` status
- Audit logs for compliance

### 4.6 Management Review

**Route:** `/management-review`

**Features:**
- Final approval authority
- View organization-wide performance
- Add management remarks
- Final approval → Status `approved`
- Lock review periods

### 4.7 Self Review Workflow

**Route:** `/my-kpis`

**Purpose:** Unified workflow where employees review KPIs and submit their performance data

**Flow:**
1. Employee views all assigned KPIs including those with `kra_set` status
2. For new KPIs (`kra_set` status), clicks "Review & Submit" button
3. Reviews KPI details (target, criteria, rating scale) in the side sheet (scrollable for Daily KPIs with extended content)
4. Enters achieved value, justification, and evidence
5. For Daily KPIs, views the Daily Submission Summary table by scrolling down
6. Clicks "Review & Submit" → KPI transitions from `kra_set` to `manager_check`
7. Notification sent to manager

**UI Indicators:**
- "New KRA" badge shown in the review sheet header for `kra_set` KPIs
- Info banner explaining the review and submission action
- Consistent "Review & Submit" button text for all KPI statuses
- Status badges showing current workflow stage
- Scrollable content area for Daily KPIs to accommodate Daily Submission Summary table

**Benefits:**
- Single-page workflow reduces navigation
- Clear, consistent terminology across all KPI states
- Clear visual distinction between new and existing KPIs

**KPI Table Sorting:**
- All KPI tables include sorting controls for Category and Weightage
- Default sort: Weightage (High to Low) to prioritize most impactful KPIs
- Secondary sort applies within same values (e.g., alphabetical category within same weightage)
- Sorting available on: Employee Dashboard, My KPIs, Team Review Scorecard

### 4.8 Query Inbox

**Route:** `/queries`

**Features:**
- View incoming queries raised to user
- View outgoing queries raised by user
- Respond to queries with resolution notes
- **Query Attachments:** View evidence attached when query was raised (`evidence_url`)
- **Response Attachments:** Upload evidence when resolving a query (`resolution_evidence_url`)
- Query cards display both original query and response attachments
- Raiser name prominently displayed in response dialog
- Query resolution triggers KPI status reset

### 4.9 Admin Features

#### 4.9.1 User Management (`/admin/users`)
- View all users with roles
- Create new users via `create-employee` edge function
- Assign/change roles
- Reset passwords
- Bulk actions

#### 4.9.2 Organization Structure (`/admin/organization`)
- Manage divisions, business units, departments
- Manage designations and PMS grades
- Hierarchical relationship setup

#### 4.9.3 KRA Categories (`/admin/categories`)
- Create/edit KRA categories
- Set weightages (must sum to 100%)
- Configure org-level categories
- Set category colors

#### 4.9.4 KPI Templates (`/admin/kra-library`)
- Create reusable KPI definitions
- Set rating thresholds (R5-R0)
- Configure UOM types (numeric, binary, tiered)
- Set applicable roles
- **Frequency Configuration:** 7 frequency types with sub-frequency support

#### 4.9.5 Unit of Measure (UOM) Options

Standard UOM options available in dropdown selectors across all KPI forms:

| Value | Label | Example Usage |
|-------|-------|---------------|
| `%` | Percentage (%) | Revenue growth, completion rate |
| `Number` | Number | Tasks completed, calls made |
| `Days` | Days | Turnaround time, SLA compliance |
| `Hours` | Hours | Response time, training hours |
| `Minutes` | Minutes | Call handling time |
| `Amount` | Amount (₹) | Sales revenue, cost savings |
| `Date` | Date | Project deadline, submission date |
| `Index` | Index | NPS score, satisfaction index |
| `Ratio` | Ratio | Conversion ratio, efficiency ratio |
| `Score` | Score | Quality score, audit score |
| `Count` | Count | Incidents, defects |
| `Rate` | Rate | Error rate, attrition rate |

**Source:** `src/lib/uomConstants.ts`

### 4.10 Frequency and Sub-Frequency System

The PMS supports 7 frequency types, each with specific submission and scoring behavior.

#### 4.10.1 Frequency Types Overview

| Frequency | Sub-Frequency | Submission Behavior | Score Calculation |
|-----------|---------------|---------------------|-------------------|
| **Daily** | Daily | Date dropdown (today + yesterday only) | Average of all daily submissions in month |
| **Weekly** | Weekly | Week dropdown (1-5), restricted review windows | Average of weekly submissions in month |
| **Monthly** | Monthly | Standard monthly submission | Direct entry |
| **Bi-Monthly** | Jan-Feb, Mar-Apr, etc. | Month 1 locked, Month 2 active | Score from Month 2 → Month 1 |
| **Quarterly** | Q1-Q4 | Months 1-2 locked, Month 3 active | Score from Month 3 → Months 1-2 |
| **Half-Yearly** | H1, H2 | Months 1-5 locked, Month 6 active | Score from Month 6 → Months 1-5 |
| **Yearly** | Jan-Dec (configurable) | Months 1-11 locked, Month 12 active | Score from Month 12 → Months 1-11 |

#### 4.10.2 Daily Frequency

**Behavior:**
- Rolling 2-day submission window (current date + yesterday)
- Only dates within the current review month are available
- Monthly score = Average of all daily submissions

**Example (January 15th):**
- Available dates: Jan 14, Jan 15
- Dates Jan 1-13 are closed

#### 4.10.3 Weekly Frequency

**Review Windows:**
| Week | Review Dates | Description |
|------|--------------|-------------|
| Week 1 | 8-10 of month | Review 1st-7th |
| Week 2 | 15-18 of month | Review 8th-14th |
| Week 3 | 22-24 of month | Review 15th-21st |
| Week 4 | 29-31 of month | Review 22nd-28th |
| Week 5 | 5-8 of next month | Review 29th-end (if applicable) |

**Scoring:** Monthly average of all weekly submissions

#### 4.10.4 Multi-Month Cycles (Bi-Monthly, Quarterly, Half-Yearly, Yearly)

**Locked Period Behavior:**
- KPIs show as locked/blurred in non-active months
- Overlay displays: "Review in {active_month}"
- Users cannot submit during locked periods

**Score Propagation:**
- Score entered in the active month automatically applies to all locked months in the cycle
- Ensures consistent reporting across the entire cycle

#### 4.10.5 Database Schema

```sql
-- Sub-period submissions table (Daily/Weekly)
CREATE TABLE public.sub_period_submissions (
  id UUID PRIMARY KEY,
  kpi_id UUID REFERENCES kpis(id),
  sub_period_type TEXT, -- 'daily' | 'weekly'
  sub_period_value TEXT, -- Date or week number
  achieved_value NUMERIC,
  remarks TEXT,
  review_month TEXT,
  review_year INTEGER,
  update_reason TEXT, -- Reason provided when resubmitting
  is_resubmitted BOOLEAN DEFAULT false -- True if entry has been updated once (no further edits allowed)
);

-- Frequency configuration
CREATE TABLE public.frequency_config (
  frequency TEXT UNIQUE,
  sub_frequency TEXT,
  review_window_rules JSONB,
  locked_months JSONB,
  active_month INTEGER
);

-- KPIs table additions
ALTER TABLE kpis ADD COLUMN sub_frequency TEXT;
ALTER TABLE kpis ADD COLUMN frequency_cycle_start TEXT;
ALTER TABLE kpis ADD COLUMN is_frequency_locked BOOLEAN;
ALTER TABLE kpis ADD COLUMN require_resubmit_reason BOOLEAN DEFAULT true;
```

#### 4.10.6 One-Time Update Policy

Sub-period submissions (daily/weekly) enforce a **one-time update** policy for audit compliance:

| Submission State | Status Badge | Action Available | Notes |
|------------------|--------------|------------------|-------|
| Not submitted | Pending | Enter | First submission allowed |
| Submitted (first time) | Done | Edit | One update allowed with mandatory reason |
| Resubmitted (final) | Final (🔒) | None | Locked, no further edits |

**Workflow:**
1. Employee submits data for the first time → Status shows "Done"
2. If employee clicks "Edit", a warning dialog appears:
   - *"You can update this record only once. It will be considered final and no further update will be allowed."*
   - Employee must provide a mandatory reason for the update
3. After resubmission, `is_resubmitted` is set to `true` → Status shows "Final" with lock icon
4. No further edits are allowed for that entry

**Configuration:**
- The `require_resubmit_reason` flag on KPIs controls whether this confirmation is required
- When enabled (default), the dialog and mandatory reason are enforced
- When disabled, employees can edit freely without confirmation (but still limited to one update)

#### 4.10.6 Key Components

| Component | Purpose |
|-----------|---------|
| `SubPeriodSelector.tsx` | Dropdown for date/week selection |
| `FrequencyLockedOverlay.tsx` | Locked state overlay for multi-month cycles |
| `DailySubmissionGrid.tsx` | Grid for daily value entry |
| `WeeklySubmissionTable.tsx` | Table for weekly value entry |
| `DailySubmissionSummary.tsx` | Read-only summary table showing all daily submissions with stats |

#### 4.10.7 Utility Functions (`src/lib/frequencyUtils.ts`)

| Function | Purpose |
|----------|---------|
| `isKpiLockedForPeriod()` | Check if KPI is locked for a review period |
| `getActiveMonthForCycle()` | Get the active month for multi-month cycles |
| `getCycleMonths()` | Get all months in a frequency cycle |
| `getDailySubPeriods()` | Get available dates for daily frequency |
| `getWeeklySubPeriods()` | Get available weeks with review window status |
| `canSubmitForSubPeriod()` | Check if submission is allowed |

#### 4.9.5 Template Bundles (`/admin/template-bundles`)
- Group templates into bundles
- Assign to departments/designations
- Bulk assign to employees
- Assignment history

#### 4.9.6 All KPIs (`/admin/all-kpis`)
- View all KPIs across organization
- Filter by period, department, status
- Admin override capabilities via Admin KPI Editor dialog:
  - Edit all KPI fields including employee, category, targets, thresholds
  - **Change UOM Type:** Switch between Numeric, Binary, and Tiered measurement types
  - Configure tiered options with custom labels, ratings (R0-R5), and definitions
  - Toggle Organization-Level KPI flag and set value scope
  - Status changes require reason and trigger notifications to employee/manager
- Audit logging for all changes

#### 4.9.7 Review Periods (`/admin/review-periods`)
- Create review periods (monthly/quarterly)
- Lock/unlock periods
- Prevent modifications to locked periods

#### 4.9.8 Workflow Configuration (`/admin/workflow-config`)
- Define workflow templates
- Assign workflows to departments/grades/employees
- Skip stages for specific groups

#### 4.9.9 Data Import (`/admin/import`)
- Bulk import employees from Excel
- Bulk import KPIs from Excel
- Background processing for large files
- Progress tracking
- Error reporting

#### 4.9.10 System Settings (`/admin/settings`)
- Score calculation mode
- KRA auto-rollover settings
- Email notification templates
- Organization name/branding

#### 4.9.11 PIP Management (`/admin/pip-management`)
- View all PIPs
- Approve/reject PIPs
- Track outcomes

#### 4.9.12 Org KPI Data Entry (`/admin/org-kpi-data`)
- Enter organization-level KPI values centrally
- Values can be scoped at three levels:
  - **Organization**: Same value applies to all employees (default)
  - **Department**: Different values per department
  - **Employee**: Different values per employee
- Admin can set scope when marking a KPI as "Organization-Level" in the KPI Editor

#### 4.9.13 Org KPI Overview (`/admin/org-kpi-overview`)
- Dashboard showing all organization-level KPIs
- Displays current achieved values and data sources
- Filter by review period and category

### 4.10 Reports

| Report | Route | Purpose |
|--------|-------|---------|
| Reports Hub | `/reports` | Dashboard of all reports |
| Monthly Scorecard | `/reports/monthly-scorecard` | Employee performance scorecards with PDF export |
| Performance Report | `/reports/performance` | Performance analytics |
| Department Report | `/reports/department` | Department-wise analysis |
| Completion Report | `/reports/completion` | Review completion status |
| Query Report | `/reports/queries` | Query analytics |
| Audit Trail | `/reports/audit-trail` | Change history |
| KRA Issuance | `/reports/kra-issuance` | KRA assignment tracking |
| TNI Report | `/reports/tni` | Training needs analysis |
| Issues Report | `/reports/issues` | System issues dashboard |
| Employee Summary | `/reports/employee-summary` | Individual performance |

#### 4.10.1 Monthly Scorecard PDF Export

The Monthly Scorecard Report includes an enhanced "Performance Dashboard" PDF export with preview functionality:

**UI Features:**
- **Eye Icon (Preview):** Click to open a full-screen PDF preview in a modal dialog before downloading
- **Download Icon:** Direct download of the PDF scorecard
- Both buttons appear in the Actions column for each employee row

**Page 1 - Dashboard Summary:**
- Company branding and period header
- Employee Profile Box (name, designation, department, employee code)
- Score Summary Box with progress bar, overall rating badge, and KPI completion status
- Performance by Category horizontal bar chart

**Page 2 - KPI Summary Table:**
- **Category Grouping:** KPIs grouped by category with colored header rows showing category averages
- **8-Column Layout:** KPI Name, Weight, Target, Self Achieved, Manager Score, Auditor Score, Final, Notes indicator
- **Color-Coded Rating Badges:** Final scores displayed with colored backgrounds (Blue=5, Green=4, Yellow=3, Red=1-2)
- **Achievement Indicators:** [+] for targets met, [-] for below target (ASCII-safe for PDF compatibility)
- **Legend Box:** Rating scale explanation in top-right corner

**Pages 3+ - Detailed Review Trail Cards:**
Each KPI gets a dedicated card-style layout similar to the web UI's ReviewTrailCard component:
- **Header Bar:** Category badge, KPI name, weight, target, and criteria
- **Achieved Value Bar:** Shows achieved value with final score badge
- **2x2 Review Grid:**
  - **Self Review Panel (Blue):** Score badge, full remarks text (up to 4 lines), evidence indicator
  - **Manager Review Panel (Amber):** Score badge, full remarks text, evidence indicator
  - **Auditor Review Panel (Purple):** Score badge, full remarks text, evidence indicator
  - **Final Assessment Panel (Emerald):** Large final score, rating label, status badge
- **Color-Coded Panels:** Each review stage has matching border, background, and text colors from the UI
- **Page Navigation:** Shows "KPI X of Y" for easy navigation
- **Full Remarks Display:** No truncation in detail cards - all remarks visible

**PDF Character Compatibility:**
- All indicators use ASCII-safe characters for maximum PDF compatibility:
  - `[+]` = Target Met/Exceeded
  - `[-]` = Below Target
  - `*` = Has Review Notes
  - `[Evidence attached]` = Evidence link present

### 4.11 Performance Improvement Plans (PIP)

**Workflow:**
1. Manager creates PIP for underperforming employee
2. Defines improvement areas, milestones, success criteria
3. Submits for HR approval
4. HR approves → PIP becomes active
5. Manager tracks milestone progress
6. On completion → Mark outcome (successful/unsuccessful)

**Statuses:** draft → pending_hr_approval → active → completed/cancelled

### 4.12 Notifications

**KPI Status Transition Notifications:**

| Status Transition | Recipients | Notification Type |
|-------------------|-----------|-------------------|
| `kra_set` → `self_review` | Reporting Manager | `kpi_submitted` - Self Review Submitted (employee submits data, awaiting manager) |
| `self_review` → `manager_check` | Employee | `kpi_approved` - Manager Reviewed (manager processes and provides score) |
| `manager_check` → `management_review` | Employee + Management | `kpi_approved` + `kpi_ready_for_management` |
| `manager_check` → `audit` | Employee + Auditors | `kpi_approved` + `kpi_ready_for_audit` (alternative workflow) |
| `audit` → `management_review` | Employee + Management | `kpi_approved` + `kpi_ready_for_management` |
| `management_review` → `approved` | Employee | `kpi_finalized` - KPI Finalized |
| `audit` → `approved` | Employee | `kpi_finalized` - KPI Finalized (skip management workflow) |

**Workflow Status Meanings:**
- `kra_set`: KPI assigned but not yet submitted by employee
- `self_review`: Employee has submitted self-review, awaiting manager processing
- `manager_check`: Manager has reviewed and scored, ready for next stage
- `audit`: Under auditor review (if applicable per workflow template)
- `management_review`: Under management final review
- `approved`: Workflow complete, KPI finalized

**Other Trigger Events:**
- Query raised → Notify recipient
- Query resolved → Notify raiser
- PIP status changes → Notify employee/HR

**Delivery:**
- In-app notifications (real-time via Supabase Realtime)
- Email notifications (via Resend edge function)

### 4.13 Frequency & Sub-Frequency Logic

The PMS supports 7 frequency types for KPIs, each with specific submission rules and scoring behavior:

| Frequency | Sub-Frequency | Submission Behavior | Scoring Logic |
|-----------|---------------|---------------------|---------------|
| **Daily** | Daily | Rolling 2-day window (today + yesterday) | Average of all daily submissions in the month |
| **Weekly** | Weekly | Week dropdown with specific review windows | Average of all weekly submissions in the month |
| **Monthly** | Monthly | Standard monthly submission | Direct entry |
| **Bi-Monthly** | Jan-Feb, Mar-Apr, etc. | Month 1 locked, Month 2 active | Score from Month 2 copies to Month 1 |
| **Quarterly** | Q1-Q4 | Months 1-2 locked, Month 3 active | Score from Month 3 copies to Months 1-2 |
| **Half-Yearly** | H1, H2 | Months 1-5 locked, Month 6 active | Score from Month 6 copies to Months 1-5 |
| **Yearly** | Jan-Dec, Jul-Jun, Apr-Mar | Months 1-11 locked, Month 12 active | Score from Month 12 copies to Months 1-11 |

**Daily KPI Behavior:**
- Employees can only submit data for the current date or the immediately preceding date
- All daily submissions are aggregated at month-end to calculate the monthly rating
- UI shows a date dropdown with available submission dates

**Weekly KPI Behavior:**
- Each week has a defined review window:
  - Week 1: Days 8-10 of the month
  - Week 2: Days 15-18 of the month
  - Week 3: Days 22-24 of the month
  - Week 4: Days 29-31 of the month
  - Week 5 (if applicable): Days 5-8 of the next month
- Weekly submissions aggregate to monthly rating

**Multi-Month Cycle Behavior (Bi-Monthly, Quarterly, Half-Yearly, Yearly):**
- KPIs are locked/blurred during early months of the cycle
- Review and scoring enabled only in the final month of the cycle
- When a score is entered in the active month, it automatically propagates to all locked months in the same cycle

**Database Tables:**

| Table | Purpose |
|-------|---------|
| `sub_period_submissions` | Stores granular daily/weekly submissions |
| `frequency_config` | System-wide frequency rules and review windows |

**Key KPI Columns:**
- `frequency`: The frequency type (Daily, Weekly, Monthly, etc.)
- `sub_frequency`: System-derived based on frequency
- `frequency_cycle_start`: For Yearly KPIs, defines the cycle start (Jan-Dec, Jul-Jun, Apr-Mar)
- `is_frequency_locked`: Indicates if the KPI is locked for the current period

**Key Components:**
- `SubPeriodSelector.tsx`: Dropdown for selecting dates (Daily) or weeks (Weekly)
- `FrequencyLockedOverlay.tsx`: Blur/lock overlay for KPIs in non-active periods
- `DailySubmissionGrid.tsx`: Grid view for entering daily values
- `WeeklySubmissionTable.tsx`: Table for entering weekly values
- `DailySubmissionSummary.tsx`: Read-only summary table visible across all roles showing:
  - Statistics cards: Total days, Submitted count (all entries regardless of value), Not Submitted count, "No" count (for binary KPIs)
  - Submission table: Date, Achieved Value (formatted for numeric/binary/tiered, "—" for pending), Submission Timestamp
  - Visual indicators: Red highlight for "No" values, Lock icon for final/resubmitted entries
  - Visible to: Employee (MyKpis), Manager/Admin (EmployeeScorecard), Auditor (AuditScorecard), Management (ManagementScorecard)
  - **Accessibility**: A "View" button appears for Daily KPIs in ALL statuses (not just `self_review`), allowing managers to view daily submissions even for KPIs in `kra_set` or other non-reviewable statuses. The sheet opens in read-only mode with no action buttons.
  - **Note**: Table displays all submissions including those with null achieved_value; dates are parsed from full YYYY-MM-DD format

**Key Hooks:**
- `useSubPeriodSubmissions.ts`: Fetch and submit granular submissions
- `useFrequencyConfig.ts`: Fetch system frequency configuration

**Key Utilities (`src/lib/frequencyUtils.ts`):**
- `isKpiLockedForPeriod()`: Checks if a KPI is locked for the current review period
- `getActiveMonthForCycle()`: Gets the active month where scoring is allowed
- `getCycleMonths()`: Gets all months in a frequency cycle
- `getDailySubPeriods()`: Gets available dates for Daily KPI submission
- `getWeeklySubPeriods()`: Gets available weeks for Weekly KPI submission

---

## 5. Project Structure

```
src/
├── App.tsx                    # Main app component with routing
├── main.tsx                   # React entry point
├── index.css                  # Global styles & design tokens
├── vite-env.d.ts              # Vite type declarations
│
├── components/
│   ├── ui/                    # shadcn/ui base components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── table.tsx
│   │   └── ...               # 40+ UI components
│   │
│   ├── layout/                # Layout components
│   │   ├── DashboardLayout.tsx   # Main app shell with sidebar
│   │   ├── AppSidebar.tsx        # Navigation sidebar
│   │   ├── PageHeader.tsx        # Page title & actions
│   │   └── ProtectedRoute.tsx    # Role-based route guard
│   │
│   ├── dashboard/             # Dashboard-specific components
│   │   ├── ProfileCard.tsx
│   │   ├── KeyStatCard.tsx
│   │   ├── OverallScoreChart.tsx
│   │   ├── CategoryScoreChart.tsx
│   │   ├── KpiTimeline.tsx
│   │   ├── KpiTrackerModal.tsx
│   │   └── KpiLogicModal.tsx
│   │
│   ├── review/                # Review-related components
│   │   ├── EmployeeScorecard.tsx
│   │   ├── AuditScorecard.tsx
│   │   ├── ManagementScorecard.tsx
│   │   ├── ReviewFilters.tsx
│   │   ├── ScoreSelector.tsx
│   │   ├── RatingSelector.tsx
│   │   ├── AchievedValueScoreInput.tsx
│   │   └── QualitativeValueInput.tsx
│   │
│   ├── admin/                 # Admin feature components
│   │   ├── TemplateFormDialog.tsx
│   │   ├── BundleFormDialog.tsx
│   │   ├── SmartAssignmentDialog.tsx
│   │   ├── ScoringSimulatorPopover.tsx
│   │   ├── EmailTemplateEditor.tsx
│   │   └── GlobalBrandingSettings.tsx
│   │
│   ├── pip/                   # PIP components
│   │   ├── PIPCreateDialog.tsx
│   │   ├── PIPDetailSheet.tsx
│   │   └── MilestoneTracker.tsx
│   │
│   └── issues/                # Issues tracking components
│       ├── IssuesTable.tsx
│       ├── IssueFilters.tsx
│       └── IssuesHeatmap.tsx
│
├── pages/
│   ├── Auth.tsx               # Login/signup page
│   ├── Index.tsx              # Root redirect
│   ├── Dashboard.tsx          # Employee dashboard
│   ├── MyKpis.tsx             # KPI list view
│   ├── SelfReview.tsx         # Self-review submission
│   ├── TeamReview.tsx         # Manager team review
│   ├── AuditPanel.tsx         # Auditor review panel
│   ├── ManagementDashboard.tsx
│   ├── ManagementReview.tsx
│   ├── KRAAcceptance.tsx
│   ├── QueryInbox.tsx
│   ├── AuditLogs.tsx
│   ├── NotFound.tsx
│   │
│   ├── admin/                 # Admin pages
│   │   ├── AdminDashboard.tsx
│   │   ├── UserManagement.tsx
│   │   ├── Organization.tsx
│   │   ├── Categories.tsx
│   │   ├── KRALibrary.tsx
│   │   ├── TemplateBundles.tsx
│   │   ├── AllKpis.tsx
│   │   ├── ReviewPeriods.tsx
│   │   ├── WorkflowConfig.tsx
│   │   ├── ImportData.tsx
│   │   ├── SystemSettings.tsx
│   │   ├── PIPManagement.tsx
│   │   └── OrgKpiDataEntry.tsx
│   │
│   └── reports/               # Report pages
│       ├── ReportsHub.tsx
│       ├── MonthlyScorecardReport.tsx
│       ├── PerformanceReport.tsx
│       ├── DepartmentReport.tsx
│       ├── CompletionReport.tsx
│       └── ...
│
├── hooks/                     # Custom React hooks
│   ├── useKpis.ts             # KPI CRUD operations
│   ├── useOrganization.ts     # Org structure data
│   ├── useSystemSettings.ts   # System configuration
│   ├── useAppSettings.ts      # Global branding settings
│   ├── usePIP.ts              # PIP management
│   ├── useTNI.ts              # Training needs
│   ├── useKpiTemplates.ts     # Template management
│   ├── useTemplateBundles.ts  # Bundle management
│   ├── useWorkflowConfig.ts   # Workflow settings
│   ├── useKpiFilters.ts       # Filter state management
│   ├── useNotifications.ts    # Notification handling
│   └── use-toast.ts           # Toast notifications
│
├── contexts/
│   └── AuthContext.tsx        # Authentication state
│
├── lib/
│   ├── utils.ts               # Utility functions (cn, etc.)
│   ├── dateUtils.ts           # Standardized date formatting
│   ├── pdfExport.ts           # PDF generation logic
│   ├── ratingCalculation.ts   # Score calculation logic
│   ├── qualitativeUom.ts      # Qualitative KPI helpers
│   ├── uomConstants.ts        # UOM dropdown options
│   ├── reviewConstants.ts     # Status/rating constants
│   ├── frequencyUtils.ts      # Frequency calculation helpers
│   └── importValidation.ts    # Import validation
│
├── integrations/
│   └── supabase/
│       ├── client.ts          # Supabase client (auto-generated)
│       └── types.ts           # Database types (auto-generated)
│
└── test/
    └── setup.ts               # Vitest configuration

supabase/
├── config.toml                # Supabase configuration
└── functions/                 # Edge Functions
    ├── send-email-notification/
    ├── create-employee/
    ├── reset-password/
    ├── auto-rollover-kpis/
    ├── import-kpis/
    └── generate-pip-letter/
```

---

## 6. Key Components & Hooks

### Core Hooks

#### `useAuth()` - Authentication Context
```typescript
const { user, session, profile, role, loading, signIn, signUp, signOut } = useAuth();
```
- Provides current user state
- Handles authentication actions
- Fetches profile and role on session change

#### `useKpis.ts` - KPI Management
```typescript
// Fetch KPIs
useMyKpis()                      // Current user's KPIs
useAllKpis()                     // All KPIs (admin)
useKpisByPeriod(period, year)    // Filtered by period
useKpisByEmployee(employeeId)    // Specific employee

// Mutations
useCreateKpi()
useUpdateKpi()
useSubmitSelfReview()
useApproveKpi()
useRaiseQuery()
useSendBackKpi()
```

#### `useOrganization.ts` - Org Structure
```typescript
useDivisions()
useBusinessUnits()
useDepartments()
useProfiles()
useTeamMembers(managerId)
useKraCategories()
```

#### `useSystemSettings.ts` - Configuration
```typescript
useSystemSettings()              // All settings
useScoreCalculationMode()        // Score calc mode
useAutoRolloverSetting()         // Rollover config
useUpdateSystemSetting()         // Update settings
```

#### `usePIP.ts` - Performance Improvement Plans
```typescript
usePIPs(filters)
usePIPDetails(pipId)
useCreatePIP()
useApprovePIP()
useCompletePIP()
useUpdateMilestone()
```

#### `useWorkflowConfig.ts` - Workflow Management
```typescript
useWorkflowTemplates()
useWorkflowConfigs()
useEmployeeWorkflow(employeeId)
getNextWorkflowStatus(current, stages)
```

### Core Components

#### `DashboardLayout`
Main application shell with sidebar navigation, header, and content area.

#### `ProtectedRoute`
Role-based route guard component:
```tsx
<ProtectedRoute allowedRoles={['admin', 'manager']}>
  <AdminPage />
</ProtectedRoute>
```

#### `EmployeeScorecard`
Comprehensive employee performance view with:
- Score summary
- Category breakdown
- KPI table with review actions
- Query/send-back dialogs

#### `KpiLogicModal`
Displays KPI rating logic and thresholds:
- Rating scale visualization
- Threshold values (R5-R0)
- Score calculation preview
- Edit capability for admins

#### `AchievedValueScoreInput`
Smart input component that:
- Handles numeric and qualitative inputs
- Auto-calculates scores based on thresholds
- Supports manual override mode

### Utility Libraries

#### `dateUtils.ts` - Standardized Date Formatting
All dates throughout the application use a consistent "dd MMM yyyy" format (e.g., "12 Dec 2025"):
```typescript
import { formatDate, formatDateTime, formatTime } from '@/lib/dateUtils';

formatDate('2025-12-12')           // "12 Dec 2025"
formatDateTime('2025-12-12T10:30') // "12 Dec 2025, 10:30 AM"
formatTime('2025-12-12T10:30')     // "10:30 AM"
```
Constants available: `DATE_FORMAT`, `DATE_TIME_FORMAT`, `TIME_FORMAT`

---

## 7. Third-Party Integrations

### NPM Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@supabase/supabase-js` | ^2.89.0 | Supabase client SDK |
| `@tanstack/react-query` | ^5.83.0 | Server state management |
| `react-router-dom` | ^6.30.1 | Client-side routing |
| `react-hook-form` | ^7.61.1 | Form handling |
| `zod` | ^3.25.76 | Schema validation |
| `recharts` | ^2.15.4 | Charts and graphs |
| `lucide-react` | ^0.462.0 | Icon library |
| `date-fns` | ^3.6.0 | Date formatting |
| `xlsx` | ^0.18.5 | Excel file handling |
| `jspdf` | ^4.0.0 | PDF generation |
| `jspdf-autotable` | ^5.0.7 | PDF tables |
| `sonner` | ^1.7.4 | Toast notifications |

### External Services

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **Lovable Cloud (Supabase)** | Backend infrastructure | Auto-configured |
| **Resend** | Email delivery | `RESEND_API_KEY` secret |

### Edge Functions

| Function | Endpoint | Purpose |
|----------|----------|---------|
| `send-email-notification` | POST | Send transactional emails |
| `create-employee` | POST | Create new employee accounts |
| `reset-password` | POST | Generate password reset links |
| `auto-rollover-kpis` | POST | Copy KPIs to new period |
| `import-kpis` | POST | Background KPI import |
| `generate-pip-letter` | POST | Generate PIP letter HTML |

---

## 8. Setup & Deployment

### Prerequisites

- Node.js 18+ (recommended: use nvm)
- npm or bun package manager

### Local Development

```bash
# Clone repository
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# Install dependencies
npm install

# Start development server
npm run dev
```

### Environment Variables

The following are auto-configured by Lovable Cloud:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project ID |

### Secrets (Configured in Lovable Cloud)

| Secret | Purpose |
|--------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Admin database access |
| `RESEND_API_KEY` | Email delivery |
| `LOVABLE_API_KEY` | Lovable AI integration |

### Deployment

1. Open Lovable project
2. Click **Share → Publish**
3. App deployed to: `https://bfclpms.lovable.app`

### Custom Domain

1. Navigate to **Project → Settings → Domains**
2. Click **Connect Domain**
3. Follow DNS configuration instructions

---

## Maintenance Protocol

> ⚠️ **IMPORTANT**: This documentation must be updated whenever code changes are made.

### Update Triggers

- New database tables or columns
- New or modified RLS policies
- New pages or routes
- New hooks or components
- New edge functions
- Configuration changes
- Dependency updates

### Update Process

1. Identify affected sections
2. Update relevant documentation
3. Update "Last Updated" date at top
4. Commit documentation with code changes

---

*This documentation is automatically maintained alongside the codebase.*
