# Performance Management System (PMS) - Documentation

> **Last Updated:** 2026-02-09  
> **Version:** 1.13.0
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

- **Unified Dashboard**: Single entry point for all user roles with integrated view modes. Users with multiple roles see a toggle bar at the top to switch between "My Dashboard", "Team Review", "Audit", and "Management" modes. URL-driven state (`/dashboard?view=team`) enables deep linking. The dashboard includes analytics, period/category filters, and direct KPI review from the table.
- **Management Dashboard** (`/management-dashboard`): Executive analytics view with hierarchical filters (Division → Business Unit → Department → Manager → Employee), department performance charts, rating distributions, pending reviews table, and period-to-period trend comparisons. Accessible to management and admin roles.
- **View Mode Toggle**: Role-based tab switcher showing available views (self, team, audit, management). Legacy routes (`/team-review`, `/audit`) automatically redirect to the unified dashboard with appropriate view mode.
- **Employee Selector Grid**: Unified component for reviewer modes showing filterable employee cards with role-specific stats and badges.
- **Dark Mode Support**: Full dark/light theme toggle with system preference detection via `next-themes`
- **Collapsible Sidebar with Mobile Support**: Sidebar auto-collapses on mobile; floating toggle button appears when sidebar is hidden (both mobile and desktop)
- **Workflow Progress Tracker**: Visual pipeline component showing KPI workflow progress with clickable stage cards (KRA Set → Self Review → Manager Check → Audit → Management → Approved). Each card shows count, icon, and progress bar. Clicking a stage on the Dashboard filters the KPI table by that status. Query indicators (orange dots) appear on stages with open queries. Displayed on Dashboard (interactive) and all reviewer scorecards (compact, read-only).
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

### Performance Optimizations

| Optimization | Implementation | Impact |
|-------------|---------------|--------|
| **Code Splitting** | All 28+ page components use `React.lazy()` with `Suspense` boundaries | Each page is a separate chunk; initial bundle reduced significantly |
| **QueryClient Caching** | `staleTime: 5min`, `gcTime: 10min`, `refetchOnWindowFocus: false`, `retry: 1` | Cached data reused for 5 minutes; ~50% fewer API calls |
| **Memoization** | Targeted `useMemo`/`useCallback` in Dashboard.tsx and QueryInbox.tsx for derived data, handlers, and insights props | Reduced unnecessary re-renders in heavy components |
| **Error Boundaries** | Top-level `ErrorBoundary` in App.tsx + per-route boundary in DashboardLayout with Suspense | Graceful error recovery instead of white screen |
| **Inbox Filter Stability** | `usePaginatedNotifications` keeps stale items visible during filter changes instead of clearing them eagerly; loading guard uses `\|\|` not `&&` | No more "No notifications yet" flash on tab/filter switch |

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
| `review_submissions` | Review data per KPI | `kpi_id`, `achieved_value`, `manager_achieved_value`, `auditor_achieved_value`, `management_achieved_value`, `self_rating`, `manager_rating`, `auditor_rating`, `final_score`, `kpi_status`, `*_remarks` |
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

#### Training, Queries & Observations

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `training_needs` | Identified training gaps | `employee_id`, `kpi_id`, `gap_type`, `priority`, `status` |
| `kpi_queries` | Review questions/clarifications | `kpi_id`, `raised_by`, `raised_to`, `reason`, `evidence_url`, `resolution_notes`, `resolution_evidence_url`, `status` |
| `kpi_observations` | Reviewer tags that can impact scores | `kpi_id`, `created_by`, `observer_role`, `observation_type`, `score_impact`, `title`, `is_applied` |
| `notifications` | User notifications | `user_id`, `type`, `title`, `message`, `is_read` |

#### System & Audit

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `app_settings` | Global branding configuration (singleton) | `id`, `organization_name`, `app_name`, `logo_url`, `login_background_url` |
| `system_settings` | App configuration | `setting_key`, `setting_value` (JSONB) |
| `workflow_settings` | Admin-configurable operational controls | `category`, `setting_key`, `setting_value`, `label`, `description`, `min_value`, `max_value`, `unit` |
| `kpi_audit_logs` | KPI change tracking | `kpi_id`, `action`, `performed_by`, `old_value`, `new_value` |
| `kra_rollover_logs` | KRA rollover history | `source_period`, `target_period`, `kpis_copied` |
| `org_kpi_values` | Organization-level KPI scores | `category_id`, `review_period`, `achieved_value` |
| `import_progress` | Bulk import tracking | `id`, `status`, `total_rows`, `processed_rows` |
| `employee_working_days` | Per-employee monthly working days configuration | `employee_id`, `month`, `year`, `working_days` |
| `backup_logs` | Database backup history | `id`, `backup_type`, `status`, `file_path`, `file_size_bytes`, `tables_count`, `total_rows` |

#### Backup & Restore

The system includes a full-database backup and restore feature accessible from **System Settings → Backups**.

| Feature | Description |
|---------|-------------|
| **Manual Backup** | Admin clicks "Backup Now" to create an immediate full snapshot of all ~40 public tables as JSON |
| **Scheduled Backup** | Configurable recurring backup via pg_cron. Admins choose frequency (Daily, Weekly, Monthly), day, and hour (UTC) from the UI. Schedule is saved as `backup_schedule` system setting and applied via the `update-backup-schedule` Edge Function |
| **Download** | Download any completed backup as a JSON file |
| **Restore** | Restore the entire database from a previous backup (double-confirmation required) |
| **Upload & Restore** | Upload an external backup JSON file (e.g. downloaded from another instance) and restore the database from it. The file is validated client-side, uploaded to the `database-backups` bucket under `uploads/`, logged with `backup_type = 'uploaded'`, and then restored via the same `restore-backup` Edge Function. Double-confirmation required. |
| **Auto-Backup Toggle** | Enable/disable the scheduled backup from the UI. When disabled, the cron job is removed entirely. |

**Schedule Options:**

| Frequency | Additional Options | Cron Example |
|-----------|-------------------|--------------|
| Daily | Hour (0-23) | `0 2 * * *` |
| Weekly | Day of week + Hour | `0 2 * * 0` (Sunday) |
| Monthly | Day of month (1-28) + Hour | `0 2 15 * *` (15th) |

**Storage**: `database-backups` private bucket (admin-only). **Edge Functions**: `create-backup`, `restore-backup`, `update-backup-schedule`. **Excluded**: `auth.users` (managed by auth system).

#### Workflow Settings Categories

| Category | Setting Key | Default | Range | Description |
|----------|-------------|---------|-------|-------------|
| **submission** | `daily_submission_window_days` | 2 | 1-7 days | Days employees can backfill daily entries |
| **submission** | `resubmission_grace_hours` | 0 | 0-72 hours | Grace period for penalty-free resubmission |
| **submission** | `working_days_per_month` | 22 | 18-26 days | Standard working days for missed days penalty |
| **sla** | `query_sla_warning_days` | 5 | 1-14 days | Days before query is flagged as high priority |
| **sla** | `query_sla_critical_days` | 10 | 3-30 days | Days before query is marked critical |
| **sla** | `stalled_kpi_warning_days` | 14 | 7-30 days | Days at same status before KPI is flagged |
| **sla** | `stalled_kpi_critical_days` | 30 | 14-60 days | Days at same status before KPI is critical |
| **sla** | `pending_kra_warning_days` | 7 | 3-14 days | Days after assignment before warning flag |
| **sla** | `pending_kra_critical_days` | 14 | 7-30 days | Days after assignment before critical flag |
| **validation** | `na_reason_min_chars` | 50 | 10-200 chars | Minimum characters for N/A reason |
| **validation** | `require_evidence_default` | false | boolean | Default mandatory evidence for new KPIs |
| **validation** | `password_min_length` | 6 | 6-16 chars | Minimum password length |
| **observation** | `max_observation_impact` | 5 | 1-5 points | Maximum score impact per observation |
| **observation** | `self_observation_auto_apply` | false | boolean | Auto-apply employee self-observations |

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
- Users can view their own profile (`authenticated` only)
- Managers can view direct reports (`authenticated` only)
- Admins, Auditors, and Management can view all profiles (`authenticated` only)

**Audit/System Log INSERT Policies:**
- `kra_rollover_logs`: Admin role only (service role bypasses RLS for cron/edge functions)
- `pip_audit_logs`: Admin role only (service role bypasses RLS for triggers)
- `notifications`: Users can insert their own (`user_id = auth.uid()`) or admin can insert any

**Public vs Authenticated READ Policies:**
- `app_settings`: Public read (required for login page branding before authentication)
- All other reference/config tables (`frequency_config`, `review_periods`, `workflow_config`, `workflow_templates`, `workflow_settings`): Restricted to `authenticated` role only — no unauthenticated access

### RLS Permission Model for Reviewers

The system enforces strict access control for KPI approvals:

| Role | Can Approve At Stage | Condition |
|------|---------------------|-----------|
| **Manager** | `self_review` → `manager_check` | Must be employee's `reporting_manager_id` |
| **Auditor** | `manager_check` → `audit`/`management_review` | Must have `auditor` role |
| **Management** | `management_review` → `approved` | Must have `management` role AND KPI at `management_review` stage |

**Silent Failure Prevention:** All approval mutations use `.select()` after updates to verify rows were affected. If RLS blocks the update (0 rows affected), an explicit error is thrown with a descriptive message instead of showing a misleading success toast.

### KPIs Table UPDATE Policies

The `kpis` table has specific UPDATE policies for workflow progression:

| Policy Name | Role | Condition |
|-------------|------|-----------|
| Users can update their own KPIs | Employee | `employee_id = auth.uid()` |
| Managers can update reports KPI status | Manager | `reporting_manager_id = auth.uid()` |
| Auditors can update KPI status | Auditor | Has `auditor` role |
| Management can update KPI status during review | Management | Has `management` role AND `status = 'management_review'` |
| Admins can manage all KPIs | Admin | Has `admin` role |

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
| `observation_type` | positive, concern, neutral |
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
- `SELECT`: Public (required for login page to load branding before authentication)
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
│  [Month][YTD][QTD][Custom] Period: [Month ▼] [Year ▼]   Category: [All ▼] │
│  Showing X of Y KPIs                                                       │
└────────────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────────────┐
│  Cumulative Summary Card (Only in YTD/QTD/Custom mode)                     │
│  [Period Range] (X months) | Avg Score: 3.8/5 | Trend: ↗ Improving        │
│  Completed: 24/30 | Pending: 6                                             │
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
- **Cumulative Performance Views:** Support for multiple period selection modes:
  - **Single Month:** Traditional single-period view (default)
  - **YTD (Year-to-Date):** Aggregates from January to selected month
  - **QTD (Quarter-to-Date):** Aggregates from quarter start to selected month
  - **Custom Range:** User-defined start/end months with cross-year support
- **Cumulative Summary Card:** Appears in YTD/QTD/Custom modes showing:
  - Period range and month count
  - Weighted average score across periods
  - Performance trend indicator (Improving ↗ / Stable → / Declining ↘)
  - Completed vs pending KPI counts
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
useAuth() → user.id → useMyKpis() / useCumulativeKpis() → Filter by Period/Category → Calculate metrics → Render
```

**Key Components:**
- `ProfileCard.tsx`: Compact employee info display
- `OverallScoreChart.tsx`: Small radial chart (innerRadius: 35, outerRadius: 50)
- `CategoryScoreChart.tsx`: Horizontal bar chart with 180px Y-axis width
- `KeyStatCard.tsx`: Stat cards with icons
- `ReviewPeriodSelectorEnhanced.tsx`: Mode toggle + Month/Year dropdowns with cumulative support
- `CumulativeSummaryCard.tsx`: Period summary with trend indicator
- `KpiTrendIndicator.tsx`: Visual trend arrows (improving/stable/declining)

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

#### Two-Level Submission for Daily/Weekly KPIs

Daily and Weekly KPIs follow a **two-level submission flow**:

```
┌─────────────────────────────────────────────────────────────┐
│  LEVEL 1: Sub-Period Entries                                │
│  ─────────────────────────────                               │
│  Day 1 ─┬─ Entry → sub_period_submissions table              │
│  Day 2 ─┤         (No workflow status change)                │
│  Day 3 ─┤                                                    │
│  ...    ─┤         Employees can add/update entries          │
│  Day N ─┘         throughout the month                       │
│                                                              │
│         ↓                                                    │
│                                                              │
│  LEVEL 2: Monthly Aggregated Submission                      │
│  ──────────────────────────────────────                      │
│  [Submit Month] → review_submissions (aggregated average)    │
│                 → kpis.status = 'self_review'                │
│                 → Manager gets notified                      │
│                 → KPI moves to manager's queue               │
└─────────────────────────────────────────────────────────────┘
```

**Level 1: Sub-Period Entries**
- Each day/week's value is saved to `sub_period_submissions` table
- No workflow status change occurs at this level
- Employees can update entries (with resubmission reason if required)
- Running average displayed in the submission sheet

**Level 2: Monthly Aggregated Submission**
- "Submit Month" button visibility for Daily/Weekly KPIs:
  | Scenario | Button State | Tooltip |
  |----------|--------------|---------|
  | Data still loading | Disabled (spinner) | "Loading..." |
  | No sub-period entries yet | Disabled | "Enter at least one daily/weekly value first" |
  | Has entries, status = `kra_set` | Enabled | (Clickable) |
  | Has entries, already submitted | Disabled | "This KPI has already been submitted for the month" |
  | Monthly/other frequency KPI | Hidden | N/A |
- Confirmation dialog shows:
  - Total number of entries
  - Calculated average score
  - Resulting rating
- On confirmation:
  - Average score written to `review_submissions.achieved_value`
  - Status transitions from `kra_set` → `self_review`
  - Manager notification triggered
  - KPI appears in manager's Team Review queue

#### Daily Binary KPI Scoring (Missed Days Penalty)

For Daily KPIs with **Binary targets (Yes/No)**, the monthly score uses a special calculation that treats both missed days AND "No" submissions as penalties:

**Formula:** `Total No = Missed Days + "No" Submissions`

| Total No Count | Final Score | Rating Level |
|---------------|-------------|--------------|
| 0 | 5 | Outstanding |
| 1 | 4 | Exceeds Expectations |
| 2 | 3 | Meets Expectations |
| 3 | 2 | Below Expectations |
| 4 | 1 | Needs Improvement |
| >4 | 0 | Not Achieved |

**Example Calculation:**
- Month has 31 days
- Employee submitted 28 days (3 missed)
- Of those 28 submissions, 2 were "No" responses

**Total No = 3 (missed) + 2 ("No" responses) = 5 → Final Score = 0**

This ensures that both non-compliance (explicit "No") and non-submission (missed days) are equally penalized in the final monthly score.

**Important Implementation Note:** For Daily Binary KPIs, the aggregated score (0-5) from `calculateBinaryDailyScore` **IS** the final rating. The system bypasses numeric threshold comparison (R5-R0) because binary KPIs don't have defined thresholds—the score directly maps to the rating level:
- Score 5 → Outstanding (Blue)
- Score 4 → Exceeds Expectations (Green)
- Score 3 → Meets Expectations (Yellow)
- Score 2-0 → Below Expectations / Needs Improvement (Red)

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

#### 4.4.1 Manager Review for Daily Binary KPIs

When a manager reviews a **Daily Binary KPI** (uom_type = `binary`, frequency = `Daily`), a special workflow is triggered:

**Agreement Toggle:**
- Manager is presented with the question: "Do you agree with the employee's daily submissions?"
- Two options:
  1. **Yes - Accept Score**: Accept the employee's self-review score as-is. Manager score = Employee score.
  2. **No - Override Entries**: Opens the Manager Daily Override Editor.

**Manager Daily Override Editor:**

When the manager selects "No", an inline editor appears allowing them to:
- View all days of the month in a table format
- See the current employee value (Yes/No/missing) for each day
- Override specific days by selecting a different value (Yes/No)
- View a **real-time score recalculation** based on overrides
- Provide a **mandatory reason** for the overrides (required before approval)

**Override Score Recalculation:**
```
Total No = Missed Days + "No" Submissions + Override Changes
Score: 0 No = 5, 1 No = 4, 2 No = 3, 3 No = 2, 4 No = 1, >4 No = 0
```

**UI Components:**
| Component | Purpose |
|-----------|---------|
| `ManagerDailyOverrideEditor.tsx` | Calendar-based editor for manager to override daily entries |
| Bulk Actions | "Mark all missing as No", "Reset overrides" buttons |
| Score Preview | Shows original score vs recalculated score with diff |
| Reason Field | Mandatory textarea for audit trail |

**Data Flow:**
1. Manager makes override selections
2. Score recalculates in real-time using `calculateOverriddenScore()`
3. On Approve:
   - **All** daily submissions get `manager_achieved_value` populated:
     - Overridden entries: Get manager's override value
     - Non-overridden entries: Get employee's `achieved_value` copied over
   - Audit log entry created with action `MANAGER_DAILY_OVERRIDE` containing full diff
   - KPI approved with the recalculated manager score

**Value Propagation (All Levels):**
When a reviewer approves (whether agreeing or overriding), ALL daily entries get the level-specific column populated:
| Scenario | Manager Behavior | Auditor/Management Behavior |
|----------|-----------------|----------------------------|
| Agrees | Copies `achieved_value` → `manager_achieved_value` for all entries | Copies previous level value → current level column for all entries |
| Disagrees | Override values → overridden dates; `achieved_value` → non-overridden dates | Override values → overridden dates; previous level → non-overridden dates |

**Audit Trail:**
```json
{
  "action": "MANAGER_DAILY_OVERRIDE",
  "performed_by": "manager-uuid",
  "on_behalf_of": "employee-uuid",
  "metadata": {
    "reason": "Verified HRMS logs, found discrepancies",
    "original_score": 5,
    "new_score": 3,
    "overrides": [
      {"date": "2026-01-15", "from": 5, "to": 0},
      {"date": "2026-01-18", "from": null, "to": 0}
    ]
  }
}
```

**Query System (Two-Step Resolution):**
- Reviewer raises query → Employee notified
- Employee submits response → Status becomes `responded` → Raiser notified
- Raiser accepts response → Status becomes `resolved` → Employee notified
- Intermediate managers see queries for their subordinates in "Team Queries" tab (read-only)
- Query History dialog shows chronological timeline of all queries/responses per KPI
- KPI returns to submitted state for re-review after resolution

### 4.5 Audit Review

**Route:** `/audit-panel`

**Features:**
- View all KPIs in `manager_check` status
- Validate manager assessments
- Add auditor score and remarks
- Forward to Management → Moves to `management_review` status
- Audit logs for compliance

**Send Back from Review Sheet:**
Auditors can send a KPI back for revision directly from the review sheet footer:
- **Send Back Button:** Orange-styled button at left side of footer opens Send Back dialog
- **Target Options:** Manager or Employee
- **Required Reason:** Must provide explanation for sending back
- **Status Update:** KPI status resets to target's stage (`self_review` or `kra_set`)
- **Audit Trail:** Action logged in `kpi_audit_logs` table

Footer Layout:
```
[ ↩ Send Back ]  ───────────  [ Cancel ]  [ Save Draft ]  [ ✓ Forward to Management ]
```

### 4.6 Management Review

**Route:** `/management-review`

**Features:**
- Final approval authority
- View organization-wide performance
- Add management remarks
- Final approval → Status `approved`
- Lock review periods

**Send Back from Review Sheet:**
Management can send a KPI back for revision directly from the review sheet footer without closing the dialog:
- **Send Back Button:** Orange-styled button at left side of footer opens Send Back dialog
- **Target Options:** Auditor, Manager, or Employee
- **Required Reason:** Must provide explanation for sending back
- **Status Update:** KPI status resets to target's stage (`audit`, `manager_check`, or `kra_set`)
- **Audit Trail:** Action logged in `kpi_audit_logs` table

Footer Layout:
```
[ ↩ Send Back ]  ───────────  [ Cancel ]  [ Save Draft ]  [ ✓ Approve ]
```

### 4.7 Self Review Workflow

**Route:** `/my-kpis`

**Purpose:** Unified workflow where employees review KPIs and submit their performance data

**Flow:**
1. Employee views all assigned KPIs including those with `kra_set` status
2. For new KPIs (`kra_set` status), clicks "Review" button
3. Reviews KPI details (target, criteria, rating scale) in the side sheet (scrollable for Daily KPIs with extended content)
4. Enters achieved value, justification, and evidence
5. For Daily KPIs, views the Daily Submission Summary table by scrolling down
6. Clicks "Submit" → KPI transitions from `kra_set` to `self_review`
7. Notification sent to manager

**View-Only Mode for Submitted KPIs:**
After an employee submits a KPI (status changes from `kra_set` to `self_review` or beyond), they can still view their submission in read-only mode:
- **Action Column:** Shows status badge + View button (Eye icon) instead of non-interactive badge
- **Sheet Header:** Displays "View Submission" title with "Read Only" badge
- **Read-Only Banner:** Informs employee "Viewing submitted data - This KPI is currently at [status] stage"
- **Input Fields:** Hidden (N/A checkbox, achieved value input, remarks textarea)
- **Evidence Upload:** Hidden; existing evidence shown as clickable link
- **Daily Submission Summary:** Remains visible for reviewing historical entries
- **Footer:** Only shows "Close" button; Save/Submit buttons are hidden

| Element | Edit Mode (`kra_set`) | View Mode (Other statuses) |
|---------|----------------------|---------------------------|
| Sheet Title | "Submit Self Review" | "View Submission" |
| Date/Week selector | Enabled | Hidden |
| Value input | Enabled | Hidden |
| Remarks input | Enabled | Shows read-only text |
| Evidence upload | Enabled | Shows link if exists |
| Save Entry button | Visible | Hidden |
| Submit Month button | Visible | Hidden |
| Close button | "Cancel" / "Done" | "Close" |
| Daily Summary table | Visible | Visible |
| Read-only banner | Hidden | Visible |

**UI Indicators:**
- "New KRA" badge shown in the review sheet header for `kra_set` KPIs
- "Read Only" badge shown in the review sheet header for submitted KPIs
- Info banner explaining the current review stage
- Status badges showing current workflow stage
- Scrollable content area for Daily KPIs to accommodate Daily Submission Summary table

**Benefits:**
- Single-page workflow reduces navigation
- Employees can always view their submissions even after submitting
- Clear visual distinction between edit and view modes
- Transparent tracking of submitted values

**KPI Table Sorting:**
- All KPI tables include sorting controls for Category and Weightage
- Default sort: Weightage (High to Low) to prioritize most impactful KPIs
- Secondary sort applies within same values (e.g., alphabetical category within same weightage)
- Sorting available on: Employee Dashboard, My KPIs, Team Review Scorecard

**Employee Filters (Team Review, Audit Panel, Management Review):**

All three review pages share a unified `EmployeeFilters` component with advanced filtering capabilities:

| Filter | Description |
|--------|-------------|
| **Search** | Free-text search by name, email, or employee code |
| **Department** | Filter by organizational department |
| **Designation** | Filter by job title/designation |
| **PMS Grade** | Filter by performance grade band |
| **Reporting Manager** | Filter by direct supervisor |
| **Status** | Filter by KPI workflow status (varies per page) |

**Implementation:**
- `useEmployeeFilterOptions` hook fetches distinct filter values from database
- `EmployeeFilters` reusable component renders the filter bar
- Active filters shown as removable badges
- "Clear All" button resets all filters at once
- Filters use AND logic (all conditions must match)

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

**Inline Quick Actions:**
- **Respond** button appears on open queries (for recipients) — expands an inline textarea with evidence upload below the row, no navigation needed
- **Accept** button appears on responded queries (for raisers) — shows the response text and a one-click accept button inline
- Keyboard shortcut: **Escape** closes any expanded panel and response dialog
- Both desktop table rows and mobile cards support the expandable inline panels
- Full detail sheet remains accessible via the "View" (external link) button
- Components: `InlineQuickAction`, updated `InboxRowItem`, `InboxTable`, `MobileInboxList`
- Helper: `getQuickAction()` in `inboxUtils.ts` determines available actions per item/user

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

#### 4.9.6 Date UOM Special Handling

When UOM is set to `Date`, the system provides specialized handling for date-based KPIs:

**Use Cases:**
- Submission deadlines (e.g., "Submit report by 5th of month")
- Milestone completion dates
- Compliance filing dates

**Input Method:**
- Calendar date picker restricted to the review month
- Selects a day of month (1-31) as the achieved value
- Available at all review levels (Self, Manager, Auditor, Management)

**Rating Calculation:**
- Uses "Lower is Better" logic: earlier date = higher rating
- R5-R0 thresholds are treated as day-of-month values (not percentages)
- Target value is ignored; thresholds determine rating directly

**Example Configuration:**
| Threshold | Value | Meaning |
|-----------|-------|---------|
| R5 | 5 | Submit by 5th day = Rating 5 (Outstanding) |
| R4 | 10 | Submit by 10th day = Rating 4 (Exceeds) |
| R3 | 15 | Submit by 15th day = Rating 3 (Meets) |
| R2 | 20 | Submit by 20th day = Rating 2 (Below) |
| R1 | 31 | Submit by end of month = Rating 1 (Needs Improvement) |

**Example Calculation:**
- Employee submits on day 8
- Day 8 is between R5 (5) and R4 (10)
- Result: Rating 4 (Exceeds Expectations)

**Implementation:**
- `calculateDateRating()` function in `src/lib/ratingCalculation.ts`
- `DateCalendarInput` component in `src/components/review/DateCalendarInput.tsx`
- Calendar restricted to review month using `fromDate`/`toDate` props

#### 4.9.7 Percentage (%) UOM Special Handling

When UOM is set to `%` or `percentage`, the system uses **direct threshold comparison** instead of ratio-based calculation. This is critical because percentage values are already normalized—dividing by a target would cause "double-normalization."

**Key Rule:**
> For UOM = %, the system compares the achieved value **directly** against thresholds. The target value is **completely ignored**.

**Use Cases:**
- Budget variance (e.g., "Stay within 100% of budget")
- Quality metrics (e.g., "Defect rate below 99%")
- Success rates (e.g., "Completion rate above 100%")

**Rating Calculation:**

| Criteria | Logic | Example |
|----------|-------|---------|
| **Lower is Better** | Lower value = higher rating | Error rate: 98% better than 102% |
| **Higher is Better** | Higher value = higher rating | Success rate: 102% better than 98% |

**Example: Lower is Better (Cost Variance)**

| Threshold | Value | Meaning |
|-----------|-------|---------|
| R5 | 99% | Achieved ≤ 99% = Rating 5 |
| R4 | 99.5% | Achieved ≤ 99.5% = Rating 4 |
| R3 | 100% | Achieved ≤ 100% = Rating 3 |
| R2 | 100.5% | Achieved ≤ 100.5% = Rating 2 |
| R1 | 101% | Achieved ≤ 101% = Rating 1 |

*Example: Employee achieves 100.4% → Rating 2 (between R3 and R2)*

**Example: Higher is Better (Completion Rate)**

| Threshold | Value | Meaning |
|-----------|-------|---------|
| R5 | 101% | Achieved ≥ 101% = Rating 5 |
| R4 | 100.5% | Achieved ≥ 100.5% = Rating 4 |
| R3 | 100% | Achieved ≥ 100% = Rating 3 |
| R2 | 99.5% | Achieved ≥ 99.5% = Rating 2 |
| R1 | 99% | Achieved ≥ 99% = Rating 1 |

*Example: Employee achieves 100.7% → Rating 4 (between R4 and R5)*

**Critical Differences from Numeric UOM:**

| Aspect | % UOM | Numeric UOM |
|--------|-------|-------------|
| Uses Target? | ❌ No | ✅ Yes |
| Uses Ratio? | ❌ No | ✅ Yes (achieved/target) |
| Direct Comparison? | ✅ Yes | ❌ No |
| Thresholds Are | Absolute values (99, 100, 101) | Ratios (0.99, 1.0, 1.01) |

**Implementation:**
- `calculatePercentageRating()` function in `src/lib/ratingCalculation.ts`
- Triggered when `uom === '%'` or `uom === 'percentage'`
- Applies to all review stages and the Scoring Simulator

#### 4.9.8 Threshold Mode: Absolute vs Ratio

The system now supports two scoring modes for numeric KPIs:

| Mode | Description | Threshold Example | Use When |
|------|-------------|-------------------|----------|
| **Absolute** (Default) | Direct value comparison | R5 = 100 (means achieved ≥ 100) | Simpler, more intuitive scoring |
| **Ratio** (Legacy) | Percentage of target | R5 = 100% (means achieved ≥ target) | Backward compatibility |

**Absolute Mode (Recommended):**
- Thresholds are actual values, not percentages
- No mental math required: "If you achieve 105, you get R5"
- Works like % and Date UOM scoring
- Example: R5=100, R4=95, R3=90 → Achieved 97 = Rating 4

**Ratio Mode (Legacy):**
- Thresholds are percentages of target value
- Achieved/Target ratio is compared against thresholds
- Example: Target=100, R5=100% → Need achieved ≥ 100 for R5

**Configuration:**
- Set via "Threshold Mode" selector in Admin KPI Create/Edit dialogs
- New KPIs default to "Absolute" mode
- Existing KPIs retain "Ratio" mode for backward compatibility
- Stored in `kpis.threshold_mode` column

**Database Column:**
```sql
threshold_mode text DEFAULT 'absolute'  -- 'absolute' | 'ratio'
```

**Implementation:**
- `calculateAbsoluteRating()` function in `src/lib/ratingCalculation.ts`
- `thresholdMode` parameter added to `calculateRating()` function

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
  achieved_value NUMERIC, -- For binary: 0 (No) or 5 (Yes); For tiered: rating value; For numeric: actual value
  remarks TEXT,
  review_month TEXT,
  review_year INTEGER,
  update_reason TEXT, -- Reason provided when resubmitting
  is_resubmitted BOOLEAN DEFAULT false, -- True if entry has been updated once (no further edits allowed)
  -- Per-level approved values (added 2026-01-31)
  manager_achieved_value INTEGER, -- Value approved/overridden by reporting manager
  auditor_achieved_value INTEGER, -- Value approved/overridden by auditor
  management_achieved_value INTEGER, -- Value approved/overridden by management
  admin_achieved_value INTEGER -- Value overridden by admin
);
```

#### 4.10.6 Per-Level Approved Values

The `sub_period_submissions` table now tracks per-level approved values, enabling a complete audit trail of how each daily entry was evaluated at each review stage:

| Column | Description |
|--------|-------------|
| `achieved_value` | Original value submitted by employee (Self) |
| `manager_achieved_value` | Value approved or overridden by reporting manager |
| `auditor_achieved_value` | Value approved or overridden by auditor |
| `management_achieved_value` | Value approved or overridden by management |
| `admin_achieved_value` | Value overridden by admin |

**UI Behavior:**
- The Daily Submission Summary table dynamically shows columns based on KPI status
- When a KPI reaches `manager_check` status, the "Manager Approved" column becomes visible
- When a KPI reaches `audit` status, the "Auditor Approved" column becomes visible
- When a KPI reaches `management_review` or `approved` status, the "Management Approved" column becomes visible
- Changed values between levels are highlighted with a "Changed" badge and strikethrough on the previous value

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
ALTER TABLE kpis ADD COLUMN day_count_type TEXT DEFAULT 'working_days'; -- 'working_days' or 'all_days'
```

#### 4.10.6 Day Count Type Configuration

For Daily KPIs, the system supports configurable day counting for missed days penalty calculation:

| Day Count Type | Description | Use Case |
|----------------|-------------|----------|
| **Working Days Only** (default) | Uses employee-specific working days (from `employee_working_days` table) or global default | Standard employees with variable working days |
| **All Calendar Days** | Uses all calendar days in the month (e.g., 31 for January) | Field staff, shift workers, or compliance KPIs |

**Configuration Hierarchy:**
1. **Employee-Specific**: `employee_working_days` table stores per-employee, per-month working days
2. **Global Default**: `working_days_per_month` system setting (default: 22)
3. **Calendar Days**: Used when `day_count_type = 'all_days'`

**Related Components:**
- `EmployeeWorkingDaysDialog.tsx` - Admin UI to configure employee working days
- `useDailyAggregation.ts` - Hook for calculating aggregated scores with dynamic day counting
- `dailyAggregation.ts` - Core aggregation functions

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
- **Admin Data Entry on Behalf of Users:**
  - **Enter Review Data:** Admins can enter or modify review submission data (achieved value, rating, score, remarks) for any role level (Self, Manager, Auditor, Management) via the "Enter Data" button (pen icon) on expanded KPI rows
  - **Enter Daily/Weekly Data:** For KPIs with Daily or Weekly frequency, admins can enter sub-period submissions for any day or week via the "Daily Data" button (calendar icon) - **NO DATE RESTRICTIONS** apply to admins
  - Admins can override locked entries (e.g., entries marked as "Final" with `is_resubmitted: true`)
  - **Mandatory reason field** for all admin entries to ensure audit compliance
  - All admin actions are logged in `kpi_audit_logs` with `on_behalf_of` and `on_behalf_role` tracking
  - Affected employees receive notifications about admin data changes
- **Admin Visibility in Audit Trails:**
  - **KPI Timeline:** Admin actions display with rose/pink color theme and show "by Admin Name (on behalf of Employee Name)"
  - **Audit Logs Page:** Includes dedicated "On Behalf Of" column showing employee name and role level
  - **Audit Trail Report:** Exports include "On Behalf Of", "On Behalf Role", and "Admin Reason" columns
  - **Admin Actions Stats Card:** New stat card showing count of admin/on-behalf actions for the period
  - Admin action types include: `ADMIN_DATA_ENTRY_SELF`, `ADMIN_DATA_ENTRY_MANAGER`, `ADMIN_DATA_ENTRY_AUDITOR`, `ADMIN_DATA_ENTRY_MANAGEMENT`, `ADMIN_DAILY_ENTRY_OVERRIDE`, `ADMIN_STATUS_OVERRIDE`, `ADMIN_OVERRIDE`
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

##### Import Columns Reference (PMS Data)

The PMS import template supports the following columns (41 total):

**Identification (4 columns):**
| Column | Required | Description |
|--------|----------|-------------|
| `sNo` | No | Serial number |
| `newCode` | **Yes** | Employee code |
| `fullName` | **Yes** | Employee full name |
| `month` | **Yes** | Review period (e.g., "Dec-25") |

**KPI Definition (9 columns):**
| Column | Required | Description |
|--------|----------|-------------|
| `category` | **Yes** | KRA category name (auto-created if missing) |
| `kra` | **Yes** | Key Result Area |
| `kpi` | **Yes** | KPI name/description |
| `target` | **Yes** | Target value |
| `uom` | No | Unit of measure (%, ₹, units, etc.) |
| `uomType` | No | Type: `numeric` (default), `binary`, `tiered` |
| `qualitativeOptions` | No | R-column format (preferred), template shorthand, or JSON array |
| `frequency` | No | Daily, Weekly, Monthly, Quarterly, Half-Yearly, Yearly |
| `frequencyCycleStart` | No | For Yearly: `Jan-Dec`, `Jul-Jun`, `Apr-Mar` |

**Scoring (8 columns):**
| Column | Required | Description |
|--------|----------|-------------|
| `kpiWeightage` | No | Weightage (0-100) |
| `criteria` | No | "Higher is Better" or "Lower is Better" |
| `r5` | No | Rating 5 threshold OR qualitative label (e.g., "Compliant") |
| `r4` | No | Rating 4 threshold OR qualitative label |
| `r3` | No | Rating 3 threshold OR qualitative label |
| `r2` | No | Rating 2 threshold OR qualitative label |
| `r1` | No | Rating 1 threshold OR qualitative label |
| `r0` | No | Rating 0 threshold OR qualitative label |

##### Qualitative KPI Import (Binary/Tiered)

For **binary** and **tiered** KPIs, the system provides user-friendly options to define qualitative choices without complex JSON:

**Method 1: R-Column Labels (Recommended)**

Enter text labels directly in the R5-R0 columns. Only the columns with text will become selectable options:

| uomType | R5 | R4 | R3 | R2 | R1 | R0 | qualitativeOptions |
|---------|-----------|----|---------|----|----|--------------|--------------------|
| binary  | Yes |    |    |    |    | No | auto |
| tiered  | Compliant |    | Partial |    |    | Non-Compliant | auto |
| tiered  | Low | Medium | High | Critical |    | Severe | auto |

**Result:** Only the defined options appear in the frontend (e.g., "Yes/No" or "Compliant/Partial/Non-Compliant").

**Extended Syntax with Definitions:**
Use `Label|Definition` format for custom tooltips:

| R5 | R0 |
|----|----|
| Yes\|Task fully completed | No\|Task not completed |

**Method 2: Template Shorthand**

Use predefined template names in the `qualitativeOptions` column:

| Code | Options |
|------|---------|
| `yes_no` | Yes (R5), No (R0) |
| `pass_fail` | Pass (R5), Fail (R0) |
| `compliance_3` | Compliant (R5), Partial (R3), Non-Compliant (R0) |
| `compliance_4` | Full (R5), Substantial (R4), Partial (R2), None (R0) |
| `achievement` | Achieved (R5), Partial (R3), Not Achieved (R0) |
| `risk_rating` | Low (R5), Medium (R3), High (R0) |
| `timeliness` | On-time (R5), Late (R2), Not Submitted (R0) |

**Example:**

| uomType | qualitativeOptions |
|---------|-------------------|
| tiered  | compliance_3      |

**Method 3: JSON Array (Legacy)**

Full JSON format for maximum control:

```
[{"label":"Compliant","rating":5,"definition":"All requirements met"},{"label":"Non-Compliant","rating":0,"definition":"Requirements not met"}]
```

**Advanced Inbox Search & Filters:**
- **Multi-criteria dropdowns**: Query Status (open/responded/resolved), SLA Status (on-time/at-risk/overdue), Notification Type, Date Range, Read Status — contextually shown per tab
- **SLA computation**: Items open > 48h are "overdue", > 36h are "at-risk", otherwise "on-time"; computed via `getItemSlaStatus()` in `inboxUtils.ts`
- **Advanced search syntax**: Supports `type:query`, `status:open`, `sla:overdue`, `period:Q4`, `notiftype:kpi_submitted` — parsed by `inboxSearchParser.ts`
- **Client-side filtering**: `filterInboxItems()` in `inboxUtils.ts` applies both dropdown and parsed-syntax filters to query tabs
- **Filter visibility**: Filters appear on all tabs (Notifications, Queries, Sent, Team) with tab-specific controls
- Tests: `src/lib/inboxSearchParser.test.ts`

**Inbox Insights Tab:**
- **Health Score** (0–100): Composite metric factoring SLA compliance, open query backlog, and average response time
- **Response Time Metrics**: Average, fastest, and slowest resolution times computed from `created_at` → `resolved_at`
- **SLA Compliance**: Percentage of queries resolved within the 2-day target, with progress bar
- **Volume Trends**: Bar chart showing query volume over the last 14 days
- **Status Distribution**: Donut chart of open/responded/resolved queries
- **Resolution Rate**: Percentage of total queries that are resolved, with breakdown
- **Weekly Comparison**: Week-over-week change in query volume
- Component: `InboxInsights` in `src/components/inbox/InboxInsights.tsx`

**Personal Productivity Insights** (within Insights tab):
- **My Avg Response Time**: Personal average compared to team average with percentage difference
- **My SLA Compliance**: Personal SLA % vs team average
- **Weekly Trend**: Queries resolved this week vs last week with percentage change
- **Open Backlog**: Current open query count with resolution ratio
- **Achievements/Badges**: Earned based on behavior — Speed Demon (all within 24h), SLA Champion (100% SLA), On Fire (5+ resolved/week), Zero Backlog (no open queries)
- **Bottleneck Areas**: KRA categories ranked by average resolution time with progress bars identifying slowest areas
- **Team Comparison Banner**: Side-by-side personal vs team average with faster/slower badge
- Component: `PersonalProductivityInsights` in `src/components/inbox/PersonalProductivityInsights.tsx`

**Organization Structure (4 columns):**
| Column | Required | Description |
|--------|----------|-------------|
| `division` | No | Division name (auto-created if missing) |
| `businessUnit` | No | Business Unit name (auto-created if missing) |
| `department` | No | Department name (auto-created if missing) |
| `subBranch` | No | Sub-branch name (optional) |

**Review Data (12 columns):**
| Column | Required | Description |
|--------|----------|-------------|
| `targetAchieved` | No | Achieved value |
| `rating` | No | Calculated rating (0-5) |
| `employeeTargetAchieved` | No | Employee's self-submitted value |
| `employeeRating` | No | Employee's self-rating |
| `employeeRemarks` | No | Employee's self-remarks |
| `managerTargetAchieved` | No | Manager's override value |
| `managerRating` | No | Manager's rating |
| `managerRemarks` | No | Manager's remarks |
| `auditTargetAchieved` | No | Auditor's override value |
| `auditRating` | No | Auditor's rating |
| `auditRemarks` | No | Auditor's remarks |
| `achievedWeight` | No | Weighted score (calculated) |

**Status & Metadata (5 columns):**
| Column | Required | Description |
|--------|----------|-------------|
| `reviewStatus` | No | Workflow status: `kra_set`, `self_review`, `manager_check`, `audit`, `management_review`, `approved` |
| `kpiStatus` | No | Submission status: `open`, `submitted`, `approved_by_manager`, `locked`, `sent_back` |
| `sourceOfData` | No | Data source (e.g., SAP, Excel) |
| `kpiWeightageScore` | No | Calculated weightage score |
| `isOrgLevel` | No | Set to `yes`/`true` for organization-level KPIs |

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

**Enhanced Filters:**
| Filter | Description |
|--------|-------------|
| Review Period/Year | Select the review cycle |
| Search | Search by employee name, code, or KPI name |
| Category | Filter by KRA category |
| Department | Filter by employee department |
| Designation | Filter by employee job title |
| KRA | Filter by specific KRA name |

**Table Columns:**
| Column | Description |
|--------|-------------|
| Category | KRA category with color indicator |
| KRA | Key Result Area name |
| KPI | KPI name |
| Employee Name (Code) | Employee or scope indicator |
| Department | Employee's department |
| Designation | Employee's job title |
| Achieved Value | Numeric input for value entry |
| Remark | Text input for additional notes |
| Supporting File | File upload for evidence |

**File Upload:**
- Supports PDF, DOC, DOCX, XLS, XLSX, PNG, JPG, JPEG
- Maximum file size: 5MB
- Files stored in `review-evidence` bucket
- URL saved to `evidence_url` column in `org_kpi_values`

#### 4.9.13 Org KPI Overview (`/admin/org-kpi-overview`)
- Dashboard showing all organization-level KPIs
- Displays current achieved values and data sources
- Filter by review period and category

#### 4.9.14 Org KPI Data Owners & Access Control

**Data Owner Assignment:**
- Admins can assign specific users as "data owners" for org-level KPIs via the **Org KPI Data Entry** page
- Each KPI row displays an "Actions" column with a **UserPlus** button to open the owner assignment dialog
- A badge shows the current owner count for quick visibility
- Data owners can enter/update values for their assigned KPIs
- Multiple owners can be assigned per KPI (primary + backup)
- Assignment is tracked in `org_kpi_data_owners` table

**Page Access Control:**
- **Admins**: Full access to all org-level KPIs plus owner assignment (Actions column visible)
- **Data Owners**: Access only to their assigned KPIs (Actions column hidden)
- **Non-owners**: No access (redirected to dashboard)
- Route protected by `DataOwnerRoute` component (checks admin role OR ownership status)
- Sidebar shows "Org KPI Data Entry" link under "Data Entry" section for data owners (non-admins)

**UI Component: `OrgKpiOwnerDialog`**
- Opened via UserPlus button in Actions column of Org KPI Data Entry table
- Shows current KPI info (KRA name, KPI name)
- Lists current data owners with remove option
- Searchable user list to add new owners (by name, email, or employee code)

**Access Control Hooks: `useOrgKpiDataOwner`**
- `useIsAnyOrgKpiDataOwner()`: Check if current user owns any org KPIs (for route access)
- `useOrgKpiOwnershipMap()`: Returns map of all ownership for quick lookup
- `useIsOrgKpiDataOwner(categoryId, kraName, kpiName)`: Check if current user can edit specific KPI
- `useAssignOrgKpiOwner()`: Mutation to assign owner (admin only)
- `useRemoveOrgKpiOwner()`: Mutation to remove owner (admin only)

**Route Guard: `DataOwnerRoute`**
- Custom route component at `src/components/layout/DataOwnerRoute.tsx`
- Allows access if user is admin OR has any data owner assignments
- Used for `/admin/org-kpi-data` route instead of `ProtectedRoute`

**Integration Across Review Stages:**
- All scorecards (Employee, Audit, Management) fetch `useOrgKpiValues` hook
- Org-level KPIs display org value read-only with "Org Level" badge
- Helper function `getOrgKpiValue(kpi)` resolves correct value based on scope:
  - Organization scope: Single value for all employees
  - Department scope: Looks up by employee's department_id
  - Employee scope: Looks up by employee's id

#### 4.9.15 Management Send-Back Workflow for Org KPIs

**Status Flow:**
```
┌─────────────┐  Owner submits   ┌──────────────┐  Management rejects  ┌─────────────┐
│  PENDING    │ ──────────────► │   APPROVED   │ ◄───────────────────  │  SENT_BACK  │
└─────────────┘                  └──────────────┘  Owner resubmits     └─────────────┘
```

**Send-Back Hook: `useSendBackOrgKpiValue`**
- Management can reject org values with reason
- Creates notification for data owner(s)
- Logs action in audit trail
- Owner resubmits → status returns to 'approved'

**UI Component: `SendBackOrgKpiDialog`**
- Shows in Management Review for org-level KPIs
- Displays current value, data owner, and reason field
- Triggers notification to data owner on submit

#### 4.9.16 Org Value Propagation

**Auto-Propagation Hook: `usePropagateOrgKpiValue`**
- When admin/owner saves org value, automatically creates/updates `review_submissions`
- Finds all matching KPIs by (category_id, kra_name, kpi_name, review_period, review_year)
- Calculates score using `calculateRating()` with org value as achieved_value
- Updates `achieved_value`, `self_score`, `self_rating` in review_submissions

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

**Daily KPI Aggregation Methods (Configurable):**

| Method | Description | Score Calculation |
|--------|-------------|-------------------|
| **Average** (default) | Simple average of all submitted daily values | `sum(values) / count(values)` |
| **Missed Days Penalty** | Score based on number of days missed | 5 (0 missed), 4 (1 missed), 3 (2 missed), 2 (3 missed), 1 (4 missed), 0 (5+ missed) |

Configuration: `System Settings > Scoring > Daily KPI Aggregation Method`

The selected method affects:
- Monthly aggregated score calculation when employee clicks "Submit Month"
- Score displayed in the KPI table for sub-period KPIs
- Auto-generated remarks indicating the aggregation method used

**Weekly KPI Behavior:**
- Each week has a defined review window:
  - Week 1: Days 8-10 of the month
  - Week 2: Days 15-18 of the month
  - Week 3: Days 22-24 of the month
  - Week 4: Days 29-31 of the month
  - Week 5 (if applicable): Days 5-8 of the next month
- Weekly submissions aggregate to monthly rating using the same aggregation method as Daily KPIs

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
│   │   ├── KpiReviewPanel.tsx     # **Unified KPI view panel** - shared across all review levels
│   │   ├── KpiHeaderSection.tsx   # Header with category, status, period badges
│   │   ├── KpiMetricsSection.tsx  # Target, criteria, weightage, rating scale
│   │   ├── KpiJourneySection.tsx  # 4-column review trail grid (all levels see all 4 stages for full transparency)
│   │   ├── KpiHistoryCard.tsx     # Sparkline + history table for previous months
│   │   ├── ReviewStageCard.tsx    # Individual stage card (Self/Manager/Auditor/Mgmt)
│   │   ├── KpiDetailsTable.tsx    # **Unified KPI table component** - shared across all views
│   │   ├── EmployeeScorecard.tsx  # Uses KpiReviewPanel for team review
│   │   ├── AuditScorecard.tsx     # Uses KpiReviewPanel for audit review
│   │   ├── ManagementScorecard.tsx # Uses KpiReviewPanel for mgmt review
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
│   ├── useNotifications.ts    # Legacy notification handling
│   ├── usePaginatedNotifications.ts # Paginated notifications with filters
│   └── use-toast.ts           # Toast notifications
│
├── components/inbox/           # Enterprise Inbox Components
│   ├── InboxFilters.tsx       # Search, status, date filters with debounce
│   ├── InboxTable.tsx         # Compact table view with date grouping
│   ├── InboxRowItem.tsx       # Individual row with unread indicator
│   ├── InboxDetailSheet.tsx   # Unified detail view for notifications/queries
│   ├── InboxStatsCards.tsx    # Summary stat cards
│   └── index.ts               # Barrel exports
│
├── contexts/
│   └── AuthContext.tsx        # Authentication state
│
├── lib/
│   ├── utils.ts               # Utility functions (cn, etc.)
│   ├── dateUtils.ts           # Standardized date formatting
│   ├── textFormatting.ts      # Text normalization for KPI display (normalizeKpiText)
│   ├── textFormatting.test.ts # Unit tests for text formatting
│   ├── pdfExport.ts           # PDF generation logic
│   ├── ratingCalculation.ts   # Score calculation logic
│   ├── cumulativeScoring.ts   # Cumulative performance calculations (YTD/QTD/Custom)
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

#### `useAdminDataEntry.ts` - Admin Data Override
```typescript
useAdminSubmitReviewData()       // Admin enters review data for any role level
useAdminSubmitSubPeriod()        // Admin enters daily/weekly data (no date restrictions)
```
- Bypasses all date/period restrictions for admins
- Creates audit logs with `on_behalf_of` and `on_behalf_role` tracking
- Sends notifications to affected employees

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

#### `KpiDetailsTable`
Unified, reusable KPI details table component used across all review views (My KPIs, Team Review, Audit, Management):

**Key Features:**
- **Dynamic Score Columns**: Score columns (Self, Manager, Auditor, Mgmt) appear progressively based on KPI status
  - `kra_set`: Self only
  - `self_review`: Self, Manager
  - `manager_check` / `audit`: Self, Manager, Auditor
  - `management_review` / `approved`: All four columns
- **Simplified Score Display**: Scores shown as single digit (1-5) without denominator or rating labels
- **Self Column**: Displays the employee's calculated **score** (1-5) from `review_submissions.self_score`, NOT the raw `achieved_value`
- **Consistent Columns**: Same structure across all views for cross-stage visibility
- **View-Type Actions**: Action buttons adapt based on `viewType` prop ('my-kpis', 'team-review', 'audit', 'management')
- **Universal View Access**: All review levels (Manager, Auditor, Management) can access the "View KPI Details" button for non-reviewable KPIs, providing full transparency into the review journey regardless of KPI status

**Action Button Logic:**
| Status | My KPIs | Team Review | Audit | Management |
|--------|---------|-------------|-------|------------|
| `kra_set` | Review | View | View | View |
| `self_review` | View | Review | View | View |
| `manager_check` | View | Reviewed + View | Review | View |
| `audit` | View | Reviewed + View | Continue | View |
| `management_review` | View | Reviewed + View | Forwarded + View | Review |
| `approved` | View | Reviewed + View | Forwarded + View | Completed + View |

**Status Badges with View Access:**
- **Team Review**: KPIs past `self_review` show "Reviewed" badge + View icon button
- **Audit Panel**: KPIs forwarded to management show "Forwarded" badge + View icon button  
- **Management Review**: Approved KPIs show "Completed" badge + View icon button
- All badges preserve access to the full KPI review panel for audit trail transparency

**Props:**
```typescript
interface KpiDetailsTableProps {
  kpis: KPI[];
  submissionMap: Map<string, ReviewSubmission>;
  queryMap?: Map<string, KpiQuery[]>;
  viewType: 'my-kpis' | 'team-review' | 'audit' | 'management';
  selectedPeriod: string;
  selectedYear: number;
  onReview?: (kpi: KPI) => void;
  onView?: (kpi: KPI) => void;  // Always pass to enable View button for all non-reviewable KPIs
  onSendBack?: (kpi: KPI) => void;
  onShowLogic?: (kpi: KPI) => void;
  expandedKpis?: Set<string>;
  onToggleExpand?: (kpiId: string) => void;
}
```

#### `KpiReviewPanel` - Unified KPI View
The central component for viewing KPI details across all review levels. Provides a consistent experience with:

**Layout Structure:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ KPI HEADER                                                              │
│ [Category Badge]  [Status Badge]  [Period Badge]  [Weightage Badge]     │
│ KRA: Full KRA Name                                                      │
│ KPI: Full KPI Name                                                      │
└─────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────┐  ┌───────────────────────────────────────┐
│ METRICS (40%)               │  │ REVIEW JOURNEY (60%)                   │
│ • Target & UOM              │  │ [Self] [Manager] [Auditor] [Mgmt]     │
│ • Criteria                  │  │ Scores, ratings, remarks, evidence    │
│ • Weightage                 │  │                                        │
│ • Rating Scale (R5-R1)      │  │ Query Summary: X open, Y resolved      │
│                             │  │                                        │
│ ┌─────────────────────────┐ │  └───────────────────────────────────────┘
│ │ KPI HISTORY             │ │
│ │ Sparkline + Last 6 Mo   │ │
│ │ [View Full History]     │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

**View Level Configurations:**
| Level | Visible Stages | Assessment Form | Actions |
|-------|---------------|-----------------|---------|
| Employee (My KPIs) | All 4 stages | Self input | Submit |
| Manager (Team Review) | All 4 stages | Manager input | Approve, Send Back |
| Auditor | All 4 stages | Auditor input | Forward, Send Back |
| Management | All 4 stages | Management input | Approve, Send Back |

**Achieved Value Persistence:**
Each review level can submit and persist their own achieved value:
- **Self**: `achieved_value` - Employee's original submission
- **Manager**: `manager_achieved_value` - Manager's assessed value (may differ from employee's)
- **Auditor**: `auditor_achieved_value` - Auditor's assessed value
- **Management**: `management_achieved_value` - Final management assessed value

The Review Journey displays each level's value alongside their rating, providing full transparency into any value modifications made during the review workflow.

**Props:**
```typescript
interface KpiReviewPanelProps {
  kpi: KPI;
  submission: ReviewSubmission | null;
  allKpis: KPI[];           // For history lookup
  allSubmissions: ReviewSubmission[];
  viewLevel: 'employee' | 'manager' | 'auditor' | 'management';
  selectedPeriod: string;
  selectedYear: number;
  onOpenQueryHistory?: () => void;
  onOpenFullHistory?: () => void;
}
```

**Usage:**
```tsx
<KpiReviewPanel
  kpi={selectedKpi}
  submission={submissionMap.get(selectedKpi.id)}
  allKpis={allKpis}
  allSubmissions={submissions}
  viewLevel="manager"
  selectedPeriod={selectedPeriod}
  selectedYear={selectedYear}
  onOpenFullHistory={() => setTrackerModalOpen(true)}
/>
```

#### `EmployeeScorecard`
Comprehensive employee performance view with:
- **KpiReviewPanel** for unified KPI details
- Score summary
- Category breakdown
- KPI table using KpiDetailsTable component
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
| **Resend** | Email delivery (default provider) | `RESEND_API_KEY` secret |
| **Custom SMTP** | Email delivery (optional) | Password via Admin UI or `SMTP_PASSWORD` secret |

### Email Configuration

The system supports two email providers:

#### 1. Resend (Default)
- Requires `RESEND_API_KEY` secret
- Domain verification required for custom sender addresses
- Configure in Admin → System Settings → Email tab

#### 2. Custom SMTP
- Use your organization's mail server
- **SMTP Password** can be set in two ways (priority order):
  1. **Admin UI** (recommended): Enter the password in System Settings → Email → SMTP Password field and click "Update Password". The password is stored securely in the `system_settings` table (key: `smtp_password`), protected by admin-only RLS, and never displayed after saving.
  2. **Environment secret**: Set `SMTP_PASSWORD` as a Lovable Cloud secret. If both are set, the environment secret takes priority.
- The `update-smtp-password` edge function handles secure storage with admin role verification.
- Configure other SMTP settings in Admin → System Settings → Email tab:
  - **Host**: SMTP server hostname (e.g., `mail.bfcl.com`)
  - **Port**: 25, 465 (SSL/TLS), 587 (STARTTLS), or 2525
  - **Security**: TLS, STARTTLS, or None
  - **Username**: SMTP authentication username
  - **From Address**: Email address for outgoing mail
  - **From Name**: Display name for outgoing mail

#### SMTP Settings in Database

| Setting Key | Description |
|-------------|-------------|
| `email_provider` | `resend` or `smtp` |
| `smtp_host` | SMTP server hostname |
| `smtp_port` | SMTP server port (default: 587) |
| `smtp_security` | `tls`, `starttls`, or `none` |
| `smtp_username` | SMTP authentication username |
| `smtp_from_address` | From email address |
| `smtp_from_name` | From display name |

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
| `RESEND_API_KEY` | Email delivery (Resend provider) |
| `SMTP_PASSWORD` | SMTP authentication (custom SMTP provider) |
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

## 9. Mobile Responsive Patterns

### Overview

The application uses responsive design patterns to ensure a good user experience on mobile devices (< 768px) while preserving the desktop layout on larger screens.

### Key Patterns

| Pattern | Implementation |
|---------|----------------|
| **Mobile Detection** | `useIsMobile()` hook from `src/hooks/use-mobile.tsx` |
| **Breakpoint** | 768px (Tailwind `sm:` and `md:` prefixes) |
| **Conditional Rendering** | `{isMobile ? <MobileComponent /> : <DesktopComponent />}` |
| **Responsive Classes** | `text-xs sm:text-sm`, `grid-cols-2 lg:grid-cols-4`, etc. |

### Page-Specific Mobile Optimizations

| Page | Mobile Behavior |
|------|-----------------|
| **Dashboard** | Charts stack vertically, KPI table becomes cards, 2-col stats grid |
| **My KPIs** | Stats become 2-col, KPI table becomes `MobileKpiCard` list |
| **Team Review** | 2-col stats, employee cards stack single column |
| **Audit Panel** | Same pattern as Team Review |
| **Management Review** | Same pattern as Team Review |
| **Query Inbox** | Tabs scrollable, table becomes `MobileInboxList` cards |

### Scorecard Components (Employee, Audit, Management)

| Element | Mobile Behavior |
|---------|-----------------|
| **Header** | Avatar/name/back button stack, period badge moves below |
| **Charts Grid** | Stacks vertically (Overall + Category), reduced height (140px) |
| **Stats Row** | 2-column grid, smaller text (`text-[10px]`), compact padding |
| **KPI Table** | Uses `MobileKpiCard` component via `useIsMobile()` |

### MobileKpiCard Component

Located at `src/components/review/MobileKpiCard.tsx`, this reusable component renders KPI data in a touch-friendly card format with role-aware actions:

```
┌─ KPI Card ──────────────┐
│ ● Category · Status     │
│ KRA Name                │
│ KPI description...      │
│ Target  Weight  Score   │
│ 100     15%     4.2     │
│ [Review] [View] [ℹ]     │
└─────────────────────────┘
```

**Props:**
- `viewType`: 'my-kpis' | 'dashboard' | 'team-review' | 'audit' | 'management'
- `onAction`, `onView`, `onShowLogic`, `onSendBack`: Action handlers
- `isLocked`, `isExpanded`: State flags

### MobileInboxList Component

Located at `src/components/inbox/MobileInboxList.tsx`, renders notifications and queries as cards with chronological grouping.

### Responsive Utility Classes

```css
/* Common patterns used throughout the app */
.text-xs sm:text-sm        /* Smaller text on mobile */
.p-4 sm:p-6                /* Reduced padding on mobile */
.gap-3 sm:gap-4            /* Tighter spacing on mobile */
.grid-cols-2 lg:grid-cols-4  /* Fewer columns on mobile */
.flex-col sm:flex-row      /* Stack vertically on mobile */
.hidden sm:block           /* Hide on mobile */
.sm:hidden                 /* Show only on mobile */
```

### Best Practices

1. **Use `useIsMobile()` sparingly** - Only for major layout changes (e.g., table → cards)
2. **Prefer CSS breakpoints** - For simple styling adjustments use Tailwind responsive prefixes
3. **Test at 320px** - Ensure layouts work on smallest phones (iPhone SE)
4. **Touch targets** - Minimum 44x44px for interactive elements on mobile

---

### Snooze & Reminders

The inbox supports snoozing notifications to defer them for later review.

#### Database Columns
- `notifications.snoozed_until` (TIMESTAMPTZ, nullable) — when set to a future timestamp, the notification is hidden from the main inbox
- `notifications.snooze_count` (INTEGER, default 0) — tracks how many times an item has been snoozed

#### Snooze Options
- **Presets:** 1 Hour, 4 Hours, Tomorrow 9 AM, Next Monday 9 AM
- **Custom:** Date picker + time input for arbitrary future times

#### Behavior
- Snoozed items are filtered server-side via `snoozed_until` column (items with future `snoozed_until` excluded from main queries)
- Client-side defense-in-depth filter also excludes snoozed items in `filterInboxItems()`
- When snooze expires, items automatically reappear in the Notifications tab
- A dedicated **Snoozed** tab shows all currently-snoozed items with un-snooze capability

#### Smart Suggestions
- Items snoozed 3+ times trigger a banner in the Snoozed tab suggesting the user mark them as read
- Snooze count badge (`Snoozed x3`) appears on items snoozed 2+ times in the main inbox

#### Key Files
| File | Purpose |
|------|---------|
| `src/hooks/useSnoozeNotification.ts` | Snooze/un-snooze mutations |
| `src/components/inbox/SnoozePopover.tsx` | Snooze UI with presets + custom picker |
| `src/hooks/usePaginatedNotifications.ts` | `showSnoozed` option for filtering |
| `src/components/inbox/InboxRowItem.tsx` | Snooze button + count badge per row |

---

### Testing

The project uses **Vitest** with **React Testing Library** for automated testing. Tests are co-located with source files using the `*.test.ts(x)` naming convention.

#### Test Coverage Summary

| Test File | Module | Tests |
|-----------|--------|-------|
| `src/lib/ratingCalculation.test.ts` | Rating engine (thresholds, scoring) | 110+ |
| `src/lib/inboxSearchParser.test.ts` | Advanced search syntax parsing | 8 |
| `src/lib/textFormatting.test.ts` | Text formatting utilities | ~10 |
| `src/lib/dailyAggregation.test.ts` | Daily KPI scoring & aggregation | 33 |
| `src/lib/cumulativeScoring.test.ts` | Cumulative scores & trend detection | 19 |
| `src/lib/frequencyUtils.test.ts` | Frequency cycles & locking logic | 25 |
| `src/lib/inboxUtils.test.ts` | Inbox grouping, filtering, SLA | 25 |
| `src/lib/importValidation.test.ts` | Import schema validation | 11 |
| `src/lib/dateUtils.test.ts` | Date/time formatting | 5 |
| `src/components/ui/ErrorBoundary.test.tsx` | Error boundary rendering & recovery | 5 |

**Total: ~250+ tests**

#### Running Tests

Tests are run via Vitest:
```bash
npx vitest run              # Run all tests
npx vitest run src/lib/     # Run only lib tests
npx vitest --watch           # Watch mode
```

#### Performance Optimizations

The application implements several performance optimizations:

- **Code Splitting**: All page components use `React.lazy()` with `Suspense` boundaries, reducing initial bundle size by loading pages on demand.
- **Query Caching**: React Query configured with 5-minute `staleTime` and 10-minute `gcTime`, with `refetchOnWindowFocus` disabled to minimize redundant API calls.
- **Memoization**: Dashboard and QueryInbox pages use targeted `useMemo`/`useCallback` for expensive derived data and event handlers.
- **Error Boundaries**: Top-level boundary in `App.tsx` plus per-route boundary in `DashboardLayout` for graceful error recovery.

---

*This documentation is automatically maintained alongside the codebase.*
