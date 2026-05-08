# Performance Management System (PMS) - Documentation

> **Last Updated:** 2026-04-23  
> **Version:** 2.66.7.50 — **RCA-2026-05-08: Org KPI propagation truth realigned to scorecard state.** Two latent defects were exposed when an admin propagated an individual employee (Atul Khaitan) for "Completion of Mandated Training Hours / April 2026" and the row badges did not match reality. (1) **RPC contract mismatch** — the live `propagate_org_kpi_value` RPC returns `{ propagated, skipped, results, skipped_details }`, but `callPropagationRpc` only read the legacy `{ propagated_count, skipped_count, details, skipped }` shape. This silently produced `propagatedCount = undefined`, breaking the per-batch summary toast and the half-propagation guard ("X / Y employees updated"). The mapper now reads either shape. (2) **Status-source-of-truth drift** — the per-row "Propagated / Not propagated" pill in `OrgKpiScopedEntryTable` was driven by `org_kpi_values.status`, but the OKV status update is a separate post-RPC `UPDATE` that historical propagations skipped. Result: 39 employees had real scorecard data (`review_submissions` + `kpis.status` advanced) yet the pill said "Not propagated". `OrgKpiDataEntry.buildCardData` now derives row status from the **scorecard fact** (presence in `useOrgKpiSubmissionFallback`), with OKV.status only used to detect `approved`. POLICY §111 codifies the rule: "Propagated" means a `review_submissions` row exists with a value or `is_na`, not OKV.status. Regressions: `orgKpiPropagateResultContract.test.ts`.
>
> **Previous Version:** 2.66.7.48 — **Safety shell UX parity with PMS.** The standalone `SafetyHeader` (top app bar with Hub button, notification bell, theme toggle, profile dropdown) was removed. All chrome now lives inside `SafetySidebar`: the sidebar header carries the Safety logo + a `SidebarTrigger` collapse button (mirroring `AppSidebar`), and a new `SidebarFooter` hosts Back-to-Hub, theme toggle, `SafetyNotificationBell`, `SafetyOfflineBadge`, the profile card, and sign-out. `SafetyLayout` no longer renders any top header — the Safety main pane starts at the top of the viewport, identical to the PMS `DashboardLayout`. Module-isolation invariants (no PMS imports inside `src/components/safety/*` and vice versa) are preserved and re-enforced by `safetyShellIsolation.test.tsx` (the obsolete `SafetyHeader` source assertion was dropped).
>
> **Previous Version:** 2.66.7.47 — **BUG-045 fix: Password rollout still failed after BUG-044 because the `handle_new_user()` trigger raised on duplicate keys.** After BUG-044, `auth.admin.createUser({ id: profile.id, ... })` succeeded the admin-API contract but Supabase still returned the generic `Database error creating new user`. Root cause: the `AFTER INSERT ON auth.users` trigger `public.handle_new_user()` did blind `INSERT INTO public.profiles` and `INSERT INTO public.user_roles` — for a backfilled employee the profile already exists and the trigger raised `duplicate key value`, aborting the entire auth-create transaction. Fix: a new migration replaces the trigger body to use `INSERT ... ON CONFLICT (id) DO NOTHING` for `public.profiles` (so HR-imported employee data — employee_code, department, reporting manager, company — is never overwritten on first login) and `ON CONFLICT (user_id, role) DO NOTHING` for the default-role insert (so backfilled non-employee roles aren't touched). The edge function additionally maps the generic "Database error creating new user" to a clearer admin-facing message that points at the trigger contract. Regression: `BUG-045` in `src/test/bugBountyFixes.test.ts` pins (a) the latest `handle_new_user` migration uses `ON CONFLICT (id) DO NOTHING` on `public.profiles`, (b) it uses `ON CONFLICT (user_id, role) DO NOTHING` on `public.user_roles`, (c) the rollout function maps the trigger DB error to an actionable message. Verified live for Binod Kumar Bhanja (201142): probe → createUser with profile id → trigger no-ops on the existing profile → password set → email dispatched.
>
> **Previous Version:** 2.66.7.46 — **BUG-044 fix: Password rollout auto-provisions auth users for backfilled employees.** The `password-rollout` edge function called `supabaseAdmin.auth.admin.updateUserById(profile.id, { password })` on every selected user. For employees imported via the master backfill (profile row exists, `auth.users` row does not — see `mem://features/admin/non-login-user-provisioning`), the admin API responded with **"User not found"** and the rollout failed (Rollout History showed two consecutive Failed entries for Binod Kumar Bhanja, employee 201142). Fix: `processOneUser` now calls `auth.admin.getUserById(profile.id)` first; if the user is missing it provisions via `auth.admin.createUser({ id: profile.id, email, password, email_confirm: true, user_metadata })` — passing the profile id verbatim so all FKs keyed on the profile id (user_roles, KPI assignments, audit logs) remain intact. Email-collision is reported with a clearer message than "User not found". The result payload now includes `auth_action: 'created' | 'updated'` so admins can distinguish first-login provisioning from a password reset. Regression: `BUG-044` in `src/test/bugBountyFixes.test.ts` pins the existence-check, the createUser invocation with `id: profile.id` and `email_confirm: true`, and the `auth_action` surfacing.
>
> **Previous Version:** 2.66.7.41 — **BUG-039 fix: Export Current Data no longer times out on review_submissions.** After the §109 / BUG-038 fix, `exportKpiData()` on `/admin/import` continued to fail with `canceling statement due to statement timeout (57014)` because it still ran a broad `fetchAllPaged()` over `review_submissions` (7,550 rows). The table's RLS SELECT policies join back to `kpis`/`profiles` for every candidate row, so even an ordered, slim, paginated query exceeded the statement timeout on the first page. Fix: after fetching `kpis`, the export now walks the resulting KPI ids in batches of 100 and pulls submissions via `.in('kpi_id', batch)` — index-backed (`idx_review_submissions_kpi_id`) and per-statement bounded. New POLICY §110 codifies the rule for any RLS-heavy child table. Regression covered by `BUG-039` in `src/test/bugBountyFixes.test.ts`.
>
> **Previous Version:** 2.66.7.23 — **Manual Refresh button on reviewer dashboards.** `EmployeeSelectorGrid` (used by HR PMS, Audit, Management, Team Reviews, Skip-Level, and the Pending bucket views) now exposes a **Refresh** button in the header toolbar. Clicking it invalidates every dataset feeding the grid — `profiles-by-workflow-stage`, `kpis-by-period-ranges`, `review-submission-scores`, `profiles`, `team-members`, `skip-level-team-members`, `employee-scores-for-period`, `bulk-employee-workflows`, `employee-filter-options`, `auditor-workload-summary`, `my-audit-assignments` — so stat cards, per-employee progress bars, and reviewed-count badges immediately re-pull from the server without a full page reload. The button shows a spinning `RefreshCw` icon and stays disabled while any of those queries are in-flight (tracked via `useIsFetching`) to prevent request storms.
>
> **Previous Version:** 2.66.7.22 — Org KPI "Stuck" badge no longer fires on entered-but-not-yet-propagated rows. New contract (enforced in `getKpiStatus` in `src/pages/admin/OrgKpiDataEntry.tsx` and the Pending Report row builder): a row is **Stuck** ONLY when the OKV row is `propagated`/`approved` AND the matching child `kpis` row is still `kra_set`. `useOrgLevelKpisWithEmployees` now also returns `kraSetEmpIdsByKey` so the page can apply the stuck check scope-by-scope (org / department / employee). Regression covered by `BUG-021` in `src/test/bugBountyFixes.test.ts`.
>
> **Version:** 2.66.7.20 — **Reviewer dashboard "Reviewed" counters and per-employee progress bars fixed.** `SLIM_KPI_SELECT` in `src/hooks/useKpis.ts` (the column list used by `useKpisByPeriodRanges`, which feeds every reviewer dashboard) was missing the five stage-score signature columns: `manager_score`, `skip_level_score`, `hr_pms_score`, `audit_score`, `management_score`. Because the HR PMS / Audit / Management stat cards and the per-employee progress bar in `EmployeeSelectorGrid.tsx` count "reviewed" via `score IS NOT NULL`, the omitted columns made the counters silently report **0** even when reviews existed, and made employee cards render dark progress bars whenever no KPI happened to be sitting AT the reviewer's stage at that moment. Added the five columns to the slim select; reworked `getProgressSegments` so HR PMS / Audit / Management views derive `done` from the score signature (consistent with the stat cards) and switched the progress-bar label from `clearedKraSet/total` to `done/total` for those views so the green segment and the numeric label always agree. Regression covered by `BUG-020` in `src/test/bugBountyFixes.test.ts`, which pins the slim-select contract.
>
> **Version:** 2.66.7.14 — **R0 threshold honored + Maintenance Cost Control master-data repair.** The scoring engine now treats R0 as a first-class threshold in `calculatePercentageRating` and `calculateAbsoluteRating` (`src/lib/ratingCalculation.ts`). Lower-is-Better → `achieved > R0` ⇒ rating 0 explicitly; Higher-is-Better → `achieved < R0` ⇒ rating 0. A dev-only `warnIfNonMonotonic` guard logs when an R5→R0 cascade is out of order, catching master-data typos before they silently zero scores. **Master-data fix**: every `kpis` and `kpi_templates` row for "Maintenance Cost Control (Spares & Consumables)" with the corrupted `R2='1%'` typo was repaired to the correct `R2='100.5%'`. **Re-score**: non-frozen `review_submissions` for the affected KPI had auto-calculated stage scores recomputed against the repaired thresholds; only NULL/0 cells were overwritten so reviewer-entered values stay intact, and approved/finalized rows are untouched per snapshot-immutability §88.
>
> **Version:** 2.66.7.11 — Inactive users visible in User Management list. The `/admin/users` page now defaults the **Status** filter to **All** (was `active`), so deactivated employees stay visible alongside active ones and can be discovered for reactivation without DB access. Inactive rows are visually muted (`opacity-60 bg-muted/30`) and tagged with the existing red **Inactive** badge; active rows show a primary-coloured **Active** pill. Filtered results are sorted active-first (alphabetical within each group) so the working roster stays at the top. Total / Active / Inactive counts continue to render as separate stat cards. The Status dropdown (All / Active / Inactive) lets admins narrow the view in one click. Purely a list-visibility fix in `src/pages/admin/UserManagement.tsx` — no backend, RLS, mutation, or other picker changes (other employee selectors continue to use `is_active=true` intentionally for assignment contexts).
>
> **Version:** 2.66.7.4 — Triple-Lock Guard for "Clear All KPI Data" (admin/import).
> The previous single-click `AlertDialog` on the destructive **Clear All KPI Data** button has been replaced with a hardened two-stage `ClearAllKpiDataDialog` (`src/components/admin/ClearAllKpiDataDialog.tsx`). Stage 1 shows the live blast radius (KPIs / review_submissions / performance_reviews / import_progress counts fetched on open) plus a 3-second cooldown on the "I understand, continue" button. Stage 2 requires the admin to type the case-sensitive phrase **`DELETE ALL KPI DATA`** AND tick a responsibility-acknowledgement checkbox before the red "Permanently Delete" button enables. Before the destructive deletes execute, `handleClearKpiData` writes a `BULK_KPI_DATA_CLEARED` row to the new `system_audit_logs` table (admin-only RLS, immutable — no UPDATE/DELETE policies), capturing performer + per-table counts + the source/confirmation method. Per POLICY.md §90, this triple-lock pattern is now mandatory for any future bulk-wipe operation.
>
> **Version:** 2.66.7.3 — Design Decisions & Rejected Refactors documented.
> **(Doc-only)** Records the architectural rationale for three patterns flagged as "overdoing": (a) the client-side `nk()` natural-key helper is a JS Map key, never a SQL predicate — DB joins use the indexed `(category_id, kra_name, kpi_name, review_period, review_year)` composite key; (b) `review_submissions.achieved_value` is an immutable per-submission snapshot mandated by HR audit policy and `final-score-governance-and-immutability`, not a cache — replacing with a live FK to `org_kpi_values` would silently mutate already-approved historical scores; (c) `ORG_KPI_PROPAGATED` audit rows are emitted per-KPI by design because they are consumed by `KpiTimeline`, `KpiJourneySection`, and the `repair-stepped-back-siblings` recovery engine. See §"Design Decisions & Rejected Refactors" below and POLICY.md §88, §89.
>
> **Version:** 2.66.7 — Forward-Sync of Org KPI Status + Bi-Monthly Cascade Awareness.
> **(1) Forward-Sync Trigger:** New AFTER UPDATE trigger `trg_sync_org_status_to_future_open_periods` on `public.kpis`. When an admin promotes (`is_org_level` false→true) or demotes (true→false) a KPI — or changes `org_level_scope` — the change is automatically cascaded to all sibling KPIs (same `category_id+kra_name+kpi_name+employee_id`) in **future open periods** (later in the fiscal year, not in `review_period_locks`). Demotions additionally delete orphaned `draft` rows in `org_kpi_values` for those future periods. Every sync is audit-logged as `ORG_KPI_FORWARD_SYNCED` with full `from`/`to` metadata. Gated by new flag `app_settings.enable_org_kpi_forward_sync` (default `true`).
> **(2) Bi-Monthly Cycle-Aware Cascade:** `change_org_kpi_scope_cascading` now detects KPI frequency and uses `resolve_terminal_period()` to map every requested period to its cycle's terminal month (e.g. Bi-Monthly Feb-Mar → March, Quarterly Jul-Sep → September). Forward-cascade de-duplicates so each cycle is touched exactly once. Audit metadata records the resolved `cycle_anchor`. Prevents silent no-ops when admins edit on a non-terminal month.
> **(3) Governance UI:** New 3rd toggle in System Settings → Org KPI Governance for the Forward-Sync flag. `OrgKpiScopeChangeDialog` now displays an amber cycle-anchor banner when editing a multi-month KPI.
> **(4) Phase A2 Re-Propagation — ABORTED:** The 4 OKVs reset by Bucket-F repair on 2026-04-21 (Power generation 1050 TPD, Campaign life 1050 TPD, Power generation 45 MWh/AFBC, Production 3X100 TPD — all February 2026) cannot be auto-re-propagated. The reset wiped `achieved_value` to `0` and `sub_factors` to `null`; the original source values were not preserved in audit metadata. Admin must re-enter the actual achieved values via Org KPI Data Entry before triggering propagation. Auto-propagation of zeros would silently zero-score employees (destructive). No data action taken.
>
> **Version:** 2.65.1 — Explorer Mode extended to Management view. Management users now see the same "Explore All" toggle and amber read-only banner on the Management Review panel, with a sidebar sub-link "Explore Employees (Read-Only)" deep-linking via `/dashboard?view=management&explore=1`. Cross-check filter, read-only scorecard enforcement (`isReviewable()` returns false in explore mode hiding Final Score input, Approve, Send Back, queries, and observations), and `EXPLORER_VIEW` audit-log entries (with `metadata.viewLevel='management'`) are reused unchanged. No DB / RLS / workflow changes.
>
> **Version:** 2.65.0 — Auditor Explorer Mode. Auditors get a first-class "Explore All" toggle on the Audit panel that switches to read-only org-wide browsing (powered by the existing `cross_check` filter). UI now enforces read-only: scoring inputs, Save/Send Back/Forward, query, and observation actions are hidden in the scorecard sheet; per-row Send Back is suppressed; an amber banner explains the mode. Sidebar gains an "Explore Employees (Read-Only)" sub-link that deep-links via `?explore=1`. Each KPI opened in Explorer Mode appends a lightweight `EXPLORER_VIEW` entry to `kpi_audit_logs` for compliance. No DB / RLS / workflow changes — RLS already blocked writes; this aligns the UI with that contract.
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
| **HR PMS** | Conducts HR PMS Review stage in the workflow, assignable via User Management |
| **Management** | Final approval authority, organizational oversight |
| **Admin** | System configuration, user management, data imports |

### Key Features

- **Unified Dashboard** (`/dashboard`): The single self-service view for all employees, combining performance analytics AND self-review submission into one page. Users with multiple roles see a toggle bar to switch between "My Dashboard", "Team Review", "Audit", and "Management" modes. URL-driven state (`/dashboard?view=team`, `/dashboard?kpi={id}`) enables deep linking. Clicking any KPI opens a `SelfReviewSheet` component that handles both read-only viewing (for submitted KPIs) and full self-review submission (for `kra_set` KPIs) including achieved value input, score calculation, remarks, evidence upload, sub-period entry for Daily/Weekly KPIs, N/A marking, and monthly aggregation. The former `/my-kpis` route now redirects here. Uses a dual-submission query pattern: period-filtered submissions for score calculations and a second unfiltered `allSubmissions` query for both the KPI Tracker Modal's annual trend chart AND the KpiReviewPanel's inline KPI History Card. **Pending Period Alert**: When viewing "My Dashboard" in self mode, a dismissible amber alert banner appears if the employee has KPIs in earlier periods with actionable statuses (`kra_set` or `self_review`). The banner shows the count and offers a one-click "Switch to [Month]" button to navigate to the pending period. This prevents employees from missing deadlines when the dashboard defaults to the current month. Zero additional API calls — derived from already-fetched `useMyKpis()` data.
- **Admin Dashboard** (`/admin`): Central monitoring hub for administrators displaying system-wide statistics, KPI counts across all review stages, quick administrative actions, and review period status tracking. Accessible from the sidebar under the Administration section.
- **Management Dashboard** (`/management-dashboard`): Executive analytics view with hierarchical filters (Division → Business Unit → Department → Manager → Employee), department performance charts, rating distributions, pending reviews table, and period-to-period trend comparisons. Accessible to management and admin roles.
- **View Mode Toggle**: Role-based tab switcher showing available views (self, team, hr_pms, audit, management). The `team` mode ("Team Reviews") automatically merges both direct reports and skip-level (indirect) reports into a single unified list — the former separate `skip_level` toggle button has been removed. Each employee card shows a **"Direct"** or **"Indirect"** relationship badge. When a manager selects an indirect report, the scorecard automatically uses `viewLevel="skip_level"` to write to the correct score field (`skip_level_score`). The `hr_pms` mode appears for users with the `hr_pms` role. The URL `?view=skip_level` still works for backward compatibility (deep links, notifications) and maps to the merged team view. Legacy routes (`/team-review`, `/audit`) automatically redirect to the unified dashboard with appropriate view mode.
- **Employee Selector Grid**: Unified component for reviewer modes showing filterable employee cards with role-specific stats and badges. In the merged **Team Reviews** mode, stat tiles show "Direct Pending", "Skip-Level Pending", and "Reviewed" counts with corresponding filter support. Includes **smart period detection**: when a reviewer clicks an employee who has no KPIs in the currently selected period, the system auto-switches to the most recent period containing that employee's KPIs. **Clickable Stat Tiles**: Dashboard stat cards are interactive — clicking a tile filters the employee list to show only employees with KPIs at that status. Clicking the same tile again clears the filter (toggle behavior). Active tiles display a highlighted ring. The "Total Employees" tile resets all filters to show everyone.
- **No-KPIs Period Hint**: When a reviewer opens an employee scorecard and the selected period has no KPIs, a helpful hint displays alternate periods with a one-click "Switch" button (via `useEmployeeKpiPeriods` hook).
- **Dark Mode Support**: Full dark/light theme toggle with system preference detection via `next-themes`
- **Collapsible Sidebar with Mobile Support**: Sidebar auto-collapses on mobile; floating toggle button appears when sidebar is hidden (both mobile and desktop). Sidebar sections include: **Main** (My Dashboard, Inbox, PMS Policy), **Manager** (Team Reviews — combines direct and skip-level reports), **HR PMS** (HR PMS Review — visible to `hr_pms` and `admin` roles), **Management**, **Audit**, **Data Entry** (for non-admin data owners), **Administration**, and **Reports**. The `hr_pms` role is included in the "My Dashboard" roles list so HR PMS users can access the dashboard.
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
- **Admin Role Switch ("View as My Role")**: Admin users see a toggle switch in the sidebar footer labeled "Admin View" (on by default). Turning it off makes the UI behave as if the admin were their natural hierarchical role (Manager or Employee, determined by checking if they have direct reports). This affects sidebar section visibility, route guarding via `ProtectedRoute`, Dashboard `availableModes`, `EmployeeSelectorGrid` full-access behavior, KPI filter admin checks, KPI edit permissions, PMS Policy admin controls, and PIP management HR checks. The actual database `user_roles` record remains `admin` — no RLS or workflow engine changes. The preference is persisted in `localStorage` (key: `pms_admin_mode`). The `AuthContext` exposes `effectiveRole`, `naturalRole`, `isAdminMode`, and `toggleAdminMode`. Components use `effectiveRole` for UI decisions and the raw `role` for audit/logging purposes.

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
| **Memoization** | Targeted `useMemo`/`useCallback` in Dashboard.tsx, QueryInbox.tsx, AuditScorecard.tsx, ManagementScorecard.tsx, PerformanceReport.tsx, and KpiTrackerModal.tsx for derived data (submissionMap, queryMap), handlers, and insights props | Reduced unnecessary re-renders in heavy components |
| **Lazy Query Loading** | `Dashboard.tsx`: `allSubmissions` query is conditional on `selectedKpiReview` — only fetches when a KPI review panel is open | Eliminates eager fetch of 1000+ submission rows on every dashboard load |
| **Server-Side Unread Count** | `QueryInbox.tsx`: Replaced local `useMemo` filter with `useUnreadNotificationCount()` hook (server-side `SELECT count(*)`) | Accurate unread count across all pages, not just the first loaded page |
| **Error Boundaries** | Top-level `ErrorBoundary` in App.tsx + per-route boundary in DashboardLayout with Suspense | Graceful error recovery instead of white screen |
| **AuthContext Init Guard** | `useRef` flag ensures `fetchProfile`/`fetchRole` fire exactly once on mount, preventing race between `onAuthStateChange` and `getSession()`. Try/catch with toast on fetch failure prevents "forever loading" | Eliminates duplicate fetches and silent auth failures |
| **Inbox Filter Stability** | `usePaginatedNotifications` keeps stale items visible during filter changes instead of clearing them eagerly; loading guard uses `\|\|` not `&&` | No more "No notifications yet" flash on tab/filter switch |
| **AllKpis Server-Side Filtering** | Default to current month/year via `useKpisByPeriod` instead of `useAllKpis`. Added `useOpenQueryCounts` (single aggregated query replacing ~47 sequential batch requests) and `useDistinctKpiPeriods` (lightweight period/year list without full KPI load) | HTTP requests reduced from ~55 to ~6-8; KPIs fetched from ~4,693 to ~300-500; load time from 3-6s to <1s |

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
| `profiles` | User profiles linked to auth.users | `id`, `email`, `full_name`, `employee_code`, `designation`, `department_id`, `reporting_manager_id`, `pms_grade`, `level` |
| `user_roles` | Role assignments | `user_id`, `role` (admin/manager/employee/auditor/management) |
| `kpis` | Key Performance Indicators | `id`, `employee_id`, `category_id`, `kra_name`, `kpi_name`, `target_value`, `weightage`, `review_period`, `review_year`, `status`, `is_issued`, `r5-r0` (thresholds), `require_resubmit_reason` |
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
| `levels` | Employee classification levels | `id`, `name`, `code`, `description` |

#### Review & Workflow

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `review_periods` | Review cycle definitions | `period_name`, `review_year`, `start_date`, `end_date`, `is_locked` |
| `performance_reviews` | Aggregate review per employee/period | `employee_id`, `review_period`, `review_year`, `overall_score`, `status` |
| `workflow_templates` | Configurable review stages | `id`, `name`, `stages` (JSONB), `is_default` |
| `workflow_config` | Template assignments | `workflow_template_id`, `config_type`, `config_value` |
| `kpi_rollback_requests` | User-initiated rollback requests | `kpi_id`, `requested_by`, `requested_from_status`, `target_status`, `reason`, `status` (pending/approved/rejected/expired), `actioned_by` |

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
| `kpi_queries` | Review questions/clarifications | `kpi_id`, `raised_by`, `raised_to`, `reason`, `evidence_url`, `resolution_notes`, `resolution_evidence_url`, `status`, `query_type`, `ticket_number` (auto-generated `Q-XXXXX`) |
| `kpi_observations` | Reviewer feedback with reply threads | `kpi_id`, `created_by`, `observer_role`, `observation_type`, `title`, `status` (open/acknowledged/resolved), `evidence_urls`, `ticket_number` (auto-generated `OBS-XXXXX`) |
| `kpi_observation_replies` | Reply thread on observations | `observation_id`, `reply_by`, `reply_text`, `evidence_urls` |
| `notifications` | User notifications | `user_id`, `type`, `title`, `message`, `is_read` |

#### System & Audit

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `app_settings` | Global branding configuration (singleton) | `id`, `organization_name`, `app_name`, `logo_url`, `login_background_url` |
| `system_settings` | App configuration | `setting_key`, `setting_value` (JSONB) |
| `workflow_settings` | Admin-configurable operational controls | `category`, `setting_key`, `setting_value`, `label`, `description`, `min_value`, `max_value`, `unit` |
| `kpi_audit_logs` | KPI change tracking | `kpi_id`, `action`, `performed_by`, `old_value`, `new_value` |
| `kra_rollover_logs` | KRA rollover history | `source_period`, `target_period`, `kpis_copied`, `details` (JSONB per-employee breakdown) |
| `org_kpi_values` | Organization-level KPI scores | `category_id`, `review_period`, `achieved_value`, `department_id`, `employee_id`. Scoped unique index (`org_kpi_values_scoped_unique`) on `(category_id, kra_name, kpi_name, review_period, review_year, COALESCE(department_id), COALESCE(employee_id))` allows one row per department/employee per KPI per period. |
| `org_kpi_value_history` | Org KPI value audit trail | `org_kpi_value_id`, `old_achieved_value`, `new_achieved_value`, `changed_by`, `change_type` |
| `import_progress` | Bulk import tracking | `id`, `status`, `total_rows`, `processed_rows` |
| `employee_working_days` | Per-employee monthly working days configuration | `employee_id`, `month`, `year`, `working_days` |

#### Review Period Governance

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `review_period_locks` | Lock records with hierarchy (Global > Role > Department > Employee) | `review_period_id`, `lock_type`, `target_id`, `permissions` (JSONB), `is_locked`, `locked_by`, `reason` |
| `review_period_auto_rules` | Configurable auto-lock triggers | `review_period_id`, `rule_type` (deadline_passed/review_submitted/approval_complete/calibration_complete), `trigger_condition` (JSONB), `action` (JSONB), `is_active` |
| `review_period_audit_log` | Immutable audit trail for all governance actions | `review_period_id`, `action`, `performed_by`, `previous_state` (JSONB), `new_state` (JSONB), `reason`, `target_type`, `target_id` |
| `review_period_stages` | Stage lifecycle tracking | `review_period_id`, `stage`, `started_at`, `ended_at`, `started_by` |
| `backup_logs` | Database backup history | `id`, `backup_type`, `status`, `file_path`, `file_size_bytes`, `tables_count`, `total_rows` |
| `email_logs` | Email send audit trail | `id`, `event_type`, `recipient_email`, `recipient_name`, `subject`, `status` (sent/failed/skipped), `error_message`, `provider`, `metadata` (JSONB) |

#### Backup & Restore

The system includes a full-database backup and restore feature accessible from **System Settings → Backups**.

| Feature | Description |
|---------|-------------|
| **Manual Backup** | Admin clicks "Backup Now" to create a full snapshot of all 81 public tables as JSON. Uses **client-orchestrated multi-phase batching** for reliability. |
| **Scheduled Backup** | Configurable recurring backup via pg_cron. Uses a **time-guarded single-invocation** approach — processes tables sequentially and finalizes with partial success if the 100s time guard is reached. |
| **Download** | Download any completed backup as a JSON file |
| **Restore** | Restore the entire database from a previous backup (double-confirmation required) |
| **Upload & Restore** | Upload an external backup JSON file (e.g. downloaded from another instance) and restore the database from it. The file is validated client-side, uploaded to the `database-backups` bucket under `uploads/`, logged with `backup_type = 'uploaded'`, and then restored via the same `restore-backup` Edge Function. Double-confirmation required. |
| **Auto-Backup Toggle** | Enable/disable the scheduled backup from the UI. When disabled, the cron job is removed entirely. |

**Multi-Phase Backup Architecture (v2.34.0):**

The `create-backup` Edge Function operates in 3 modes:

| Mode | Body Params | Description |
|------|-------------|-------------|
| **INIT** | `{ backup_type }` | Creates `backup_logs` entry, returns `backup_id`, `folder_path`, and table batches (9 tables each) |
| **PROCESS BATCH** | `{ backup_id, folder_path, tables: [...] }` | Processes only the specified tables, returns results + errors |
| **FINALIZE** | `{ backup_id, folder_path, finalize: true, table_manifest, ... }` | Generates storage + table manifests, updates log as completed |

For **manual backups**, the client (`useTriggerBackup` hook) orchestrates: INIT → loop through batches (with up to 2 retries per batch) → FINALIZE. Progress is exposed via `BackupProgress` state for real-time UI feedback.

For **scheduled backups**, the function runs all phases internally with a 100-second time guard. If time runs out, it finalizes with status `partial` — the manifest reflects only tables that completed. This prevents CPU timeout while keeping cron backups self-contained.

**Schedule Options:**

| Frequency | Additional Options | Cron Example |
|-----------|-------------------|--------------|
| Daily | Hour (0-23) | `0 2 * * *` |
| Weekly | Day of week + Hour | `0 2 * * 0` (Sunday) |
| Monthly | Day of month (1-28) + Hour | `0 2 15 * *` (15th) |

**Storage**: `database-backups` private bucket (admin-only). **Edge Functions**: `create-backup`, `restore-backup`, `update-backup-schedule`. **Excluded**: `auth.users` (managed by auth system). **Restore Warnings**: If the restore completes with warnings (e.g. FK constraint issues), the full list of warning messages is displayed in the toast notification for 15 seconds so admins can diagnose issues. The `password_rollout_logs` table is included in the backup/restore dependency chain to prevent FK constraint failures when clearing `profiles`.

> ⚠️ **MANDATORY — New Table Backup Checklist**
>
> When **any new table** is created via a database migration, the following files **MUST** be updated in the **same change**:
>
> | File | What to update |
> |------|----------------|
> | `supabase/functions/create-backup/index.ts` | Add the table to the `TABLES_TO_BACKUP` array in the correct **foreign-key dependency order** |
> | `supabase/functions/restore-backup/index.ts` | Add the table to **both** `INSERT_ORDER` (parent-first) and `DELETE_ORDER` (leaf-first) arrays |
>
> **Backup Coverage Policy**: No table may exist in the production schema without being included in the scheduled backup system. Any migration that creates a new table without updating the backup/restore functions is considered **incomplete**.

> ℹ️ **Report Access Override — Full Data Scope**
>
> When an admin grants a user View or Download access to a report via **User-Level Overrides** (`report_access_user_overrides`), that user gains full SELECT access to the `kpis`, `review_submissions`, and `profiles` tables via the `has_report_access_override()` SECURITY DEFINER function. This ensures override users see the complete organization-wide report, not just their team-scoped data. The override is read-only (SELECT only) and explicitly admin-granted.

#### Workflow Settings Categories

| Category | Setting Key | Default | Range | Description |
|----------|-------------|---------|-------|-------------|
| **submission** | `daily_submission_window_days` | 2 | 1-60 days | Number of past days (including today) employees can submit daily KPI entries. The SubPeriodSelector shows all dates in the review month; only dates within this window are enabled for selection. |
| **submission** | `resubmission_grace_hours` | 0 | 0-72 hours | Grace period for penalty-free resubmission |
| **submission** | `working_days_per_month` | 22 | 18-26 days | Standard working days for missed days penalty |
| **submission** | *Month-end gate* | N/A | automatic | For Daily/Weekly KPIs, the "Submit Month" button is disabled while the review month is still active. It unlocks automatically on the 1st of the following month. This prevents premature aggregation of incomplete data and eliminates unnecessary rollback requests. A Lock icon and tooltip ("Available after {Month} {Year} ends") inform the user. |
| **sla** | `query_sla_warning_days` | 5 | 1-14 days | Days before query is flagged as high priority |
| **sla** | `query_sla_critical_days` | 10 | 3-30 days | Days before query is marked critical |
| **sla** | `stalled_kpi_warning_days` | 14 | 7-30 days | Days at same status before KPI is flagged |
| **sla** | `stalled_kpi_critical_days` | 30 | 14-60 days | Days at same status before KPI is critical |
| **sla** | `pending_kra_warning_days` | 7 | 3-14 days | Days after assignment before warning flag |
| **sla** | `pending_kra_critical_days` | 14 | 7-30 days | Days after assignment before critical flag |
| **validation** | `na_reason_min_chars` | 50 | 10-200 chars | Minimum characters for N/A reason |
| **validation** | `require_evidence_default` | false | boolean | Default mandatory evidence for new KPIs |
| **validation** | `password_min_length` | 6 | 6-16 chars | Minimum password length |
| **observation** | `max_observation_impact` | 5 | 1-5 points | Maximum score impact per observation (legacy, score impact removed) |
| **observation** | `self_observation_auto_apply` | false | boolean | Auto-apply employee self-observations (legacy) |

#### Storage Buckets

| Bucket | Purpose | Public |
|--------|---------|--------|
| `branding-assets` | App logo and login wallpaper images | Yes |
| `review-evidence` | Evidence documents uploaded during reviews | No |

### Row-Level Security (RLS) Policies

> **Full per-table policy inventory:** [`docs/rls-policies.md`](docs/rls-policies.md)
> **Live audit script:** [`docs/rls-audit.sql`](docs/rls-audit.sql)
> **Behavioral tests:** [`src/test/rls-policies.test.ts`](src/test/rls-policies.test.ts)

All 46 public tables have RLS enabled. Key policy patterns:

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
- Managers can view skip-level reports — employees whose `reporting_manager_id` is one of the manager's direct reports (`authenticated` only, v1.28.2). Uses `get_direct_report_ids()` SECURITY DEFINER function to avoid infinite recursion (same pattern as `has_role` and `is_data_owner_for_employee`).
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
| `get_bulk_employee_workflows(employee_ids UUID[])` | Batch-fetch workflow stages for multiple employees (used by EmployeeSelectorGrid) |
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

> **⚠️ Enum Warning:** `review_status` (used by `kpis.status`) and `kpi_status` (used by `review_submissions.kpi_status`) are **different enums** with different valid values. `review_status` has `approved`; `kpi_status` does **not** — its terminal state is `locked`. Never write `"approved"` to `review_submissions.kpi_status`.
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

**Auth-Guarded Query Pattern:**
- `useModules()` uses `enabled: !!user` to prevent the query from firing before the auth token is ready, avoiding RLS-blocked empty results being cached.
- `AuthContext` invalidates the `['modules']` query cache on login to clear any stale empty results.
- This pattern should be applied to any new hooks fetching RLS-protected data that run immediately after login.

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
- Email change via `update-user-email` edge function
- Session persistence via Supabase tokens

#### Admin Change Email

**Purpose:** Admins can change any user's email address directly from the Edit User dialog in User Management.

**How It Works:**
1. Admin opens Edit dialog for a user and modifies the Email field (previously read-only, now editable).
2. On save, if the email has changed, the frontend calls the `update-user-email` edge function.
3. The edge function validates admin JWT, checks admin role, validates email format, then:
   - Updates the auth record via `auth.admin.updateUserById(userId, { email, email_confirm: true })` (instant, no confirmation email)
   - Updates `profiles.email` to keep the database in sync
4. If the email update succeeds, the remaining profile fields are saved normally.
5. If the email update fails, the save is aborted and an error toast is shown.

**Key Details:**
- No confirmation email sent — admin-controlled by design
- User's password and `user_id` remain unchanged; all relational data is preserved
- The `email_confirm: true` flag ensures the new email is immediately verified in auth

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
│             │  Sort: [Weightage] [Score]                                   │
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
  - **Sort toggle**: Two compact toggle buttons — **[Weightage ↕]** and **[Score ↕]** — with a "Sort:" label prefix. Clicking an inactive button activates it (defaults to descending). Clicking the active button toggles direction (ascending ↑ / descending ↓). Uses `ArrowDown`/`ArrowUp` icons for the active field and `ArrowUpDown` for inactive. Default is "Score" descending. Available across all views: Dashboard, UnifiedScorecard, EmployeeScorecard, AuditScorecard, ManagementScorecard, and the Performance Report.
  - **All categories with mapped KPIs are shown**: Categories appear if the employee has at least one KPI assigned to that category, even if no scores have been submitted yet (displays 0% score bar)
- Review status distribution with progress bars
- KPI details table with status badges and action buttons

**Overall Rating Calculation (Weighted Average):**
- **Formula:** `overallRating = totalWeightedScore / totalEffectiveWeight`
- **N/A Exclusion:** KPIs marked as N/A (`is_na = true`) are excluded from **both** numerator (weighted score) AND denominator (total weight)
- **Zero/NULL Scores:** All non-NA KPIs are included in both numerator and denominator, even if their score is 0 or NULL. This ensures KPIs without scores penalize the rating rather than being silently ignored.
- **Example:** If an employee has 100 total weightage, 3 N/A KPIs with weightage 6.5, and weighted score sum of 314.5, the rating = 314.5 / 93.5 = 3.36

**Data Flow:**
```
useAuth() → user.id → useMyKpis() / useCumulativeKpis() → Filter by Period/Category → Calculate metrics → Render
```

**Key Components:**
- `ProfileCard.tsx`: Compact employee info display
- `OverallScoreChart.tsx`: Small radial chart (innerRadius: 35, outerRadius: 50)
- `CategoryScoreChart.tsx`: Premium horizontal bar chart with dynamic 30% label area, custom dual-tone tick (bold name + de-emphasized weightage), thinner bars (`barSize={12}`), 2% category gap, 36px per-category row height, and subtle vertical grid lines at 0/25/50/75/100%. **All containers** across every dashboard level (Self, Team, Audit, Management, Unified, Reports) use dynamic height sizing (`Math.max(180, count * 36)`) to prevent category label clipping. All Y-axes use `interval={0}` to force Recharts to render every tick label instead of auto-hiding alternates.
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
- **Target Options:** Manager or Employee (plus Skip-Level, HR PMS if those stages exist in the workflow)
- **Required Reason:** Must provide explanation for sending back
- **Status Update:** KPI status resets to the stage PRECEDING the target reviewer's stage (e.g., sending to Manager sets status to `self_review`, sending to Employee sets `kra_set`)
- **Cascading Data Clear (v1.28.0):** All review submission fields from the target stage onward are cleared (ratings, scores, remarks, evidence, achieved values) to prevent stale data. This mirrors the admin step-back logic.
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
- **Target Options:** Dynamically computed from `resolveSendBackTargets('management', effectiveStages)` — includes Auditor, HR PMS, Skip-Level, Manager, or Employee filtered by the employee's active workflow stages
- **Required Reason:** Must provide explanation for sending back
- **Status Update (v1.44.0 fix):** Uses `resolveSendBackStatus(target, 'management', stages)` from the workflow engine to set the KPI status to the stage PRECEDING the target reviewer's stage. Previously used a hardcoded map that incorrectly set statuses to the target's "completed" stage (e.g., sending to Manager set `manager_check` instead of `self_review`).
- **Cascading Data Clear (v1.44.0 fix):** All downstream review fields (ratings, scores, remarks, evidence, achieved values) are cleared from the target stage forward through management, including `final_rating` and `final_score`. Previously only cleared management fields.
- **Audit Trail:** Action logged in `kpi_audit_logs` table

Footer Layout:
```
[ ↩ Send Back ]  ───────────  [ Cancel ]  [ Save Draft ]  [ ✓ Approve ]
```

### 4.6.5 Rollback Request Feature (v1.21.0)

**Purpose:** Allows any workflow participant to request a rollback of a KPI they have already submitted/forwarded, enabling corrections before the next level processes it.

**How it works:**
1. After submitting, the user opens "View KPI Details" and clicks **"Request Rollback"**
2. A dialog prompts for a mandatory reason
3. A `kpi_rollback_requests` record is created (only one pending request per KPI allowed via unique partial index)
4. The next-level reviewer sees a **red banner** with the request reason and "Roll Back" / "Dismiss" buttons
5. **Roll Back**: Reverts KPI status to the previous stage using `resolvePreviousStatus()`, notifies the requester
6. **Dismiss**: Rejects the request, notifies the requester

**Components:** `RollbackRequestDialog`, `RollbackRequestBanner`
**Hook:** `useKpiRollbackRequests` — `usePendingRollbackRequest`, `useCreateRollbackRequest`, `useApproveRollbackRequest`, `useRejectRollbackRequest`

**Edge cases:** Auto-expire trigger on KPI status change, unique partial index prevents duplicates, approved KPIs excluded.

### 4.6.6 Admin Rollback Request Management Panel (v1.45.55)

**Route:** `/admin/rollback-requests`

**Purpose:** Centralized admin panel to monitor, filter, and action all rollback requests across the organization. Resolves self-manager deadlock scenarios where users listed as their own reporting managers cannot have their rollback requests actioned.

**Features:**
- **Stats cards** showing counts per status (Pending, Approved, Rejected, Expired)
- **Status filter chips** with default view set to Pending
- **Search** by requester name, employee name, KPI name, or employee code
- **Self-manager deadlock indicator**: Warning icon next to requests where the requester is the employee's own reporting manager
- **Approve/Reject actions** for pending requests (reuses existing hooks)
- **Dashboard integration**: "Pending Rollbacks" stat card on Admin Dashboard linking to this page

**Components:** `src/pages/admin/RollbackRequests.tsx`
**Hooks:** `useAllRollbackRequests`, `useRollbackStatusCounts` (from `src/hooks/useAllRollbackRequests.ts`)
**Sidebar:** Listed under Administration as "Rollback Requests" with `Undo2` icon

### 4.7 Self Review Workflow

**Route:** `/my-kpis`

**Purpose:** Unified workflow where employees review KPIs and submit their performance data

**Flow:**
1. Employee views all assigned KPIs including those with `kra_set` status
2. For new KPIs (`kra_set` status), clicks "Review" button
3. Reviews KPI details (target, criteria, rating scale via KpiMetricsSection inside KpiReviewPanel) in the side sheet (scrollable for Daily KPIs with extended content). Note: The rating scale is shown only once, inside the KpiReviewPanel's Metrics & Scale card.
4. Enters achieved value, justification, and evidence
5. For Daily KPIs, views the Daily Submission Summary table by scrolling down
6. Clicks "Submit" → KPI transitions from `kra_set` to `self_review`
7. Notification sent to manager

**Self-Review Edit Capability:**
Employees can edit their self-review as long as the KPI is still at `self_review` status (before the manager picks it up). Once the KPI advances to `manager_check` or beyond, it becomes read-only. This allows employees to correct mistakes or update values without requiring a manager rollback.

| KPI Status | Employee Access | Sheet Title | Submit Button |
|---|---|---|---|
| `kra_set` | Editable | "Submit Self Review" | "Submit" |
| `self_review` | Editable (re-submit) | "Edit Self Review" | "Update" |
| `manager_check`+ | Read-only | "View KPI Details" | Hidden |

**View-Only Mode for Advanced KPIs:**
After a KPI moves beyond `self_review` (to `manager_check` or later), employees can still view their submission in read-only mode:
- **Action Column:** Shows status badge + View button (Eye icon) instead of non-interactive badge
- **Sheet Header:** Displays "View KPI Details" title with "Read Only" badge
- **Read-Only Banner:** Informs employee "Viewing submitted data - This KPI is currently at [status] stage"
- **Input Fields:** Hidden (N/A checkbox, achieved value input, remarks textarea)
- **Evidence Upload:** Hidden; existing evidence shown as clickable link
- **Daily Submission Summary:** Remains visible for reviewing historical entries
- **Footer:** Only shows "Close" button; Save/Submit buttons are hidden

| Element | Edit Mode (`kra_set` / `self_review`) | View Mode (`manager_check`+) |
|---------|----------------------|---------------------------|
| Sheet Title | "Submit Self Review" / "Edit Self Review" | "View KPI Details" |
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
- All KPI tables include sorting controls for Weightage, Category, KRA Name, and Final Score
- Default sort: Weightage (High to Low) to prioritize most impactful KPIs
- Final Score sorting uses the submission's final_score; KPIs without a final score sink to the bottom
- Secondary sort applies within same values (e.g., weightage descending within same final score)
- Sorting available on: Employee Dashboard, My KPIs, Team Review, Audit, and Management Scorecards

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
- Edit users: Full Name (editable), Email (read-only), Employee Code, Role, Department, Reporting Manager, Designation, PMS Grade
- Assign/change roles
- Reset passwords
- Bulk actions

#### 4.9.2 Organization Structure (`/admin/organization`)
- Manage divisions, business units, departments
- Manage designations and PMS grades
- Hierarchical relationship setup

#### 4.9.3 KRA Categories (`/admin/categories`)
- Create/edit KRA categories (name limited to 35 characters)
- Set weightages (must sum to 100%)
- Configure org-level categories
- Set category colors

#### 4.9.4 KPI Templates (`/admin/kra-library`)
- Create reusable KPI definitions
- Set rating thresholds (R5-R0)
- Configure UOM types (numeric, binary, tiered)
- Set applicable roles
- **Frequency Configuration:** 7 frequency types with sub-frequency support

#### 4.9.4a Cascading KRA/KPI Dropdowns in "Assign New KRA"

The **AdminKpiCreateDialog** uses searchable cascading dropdowns for KRA and KPI names, powered by the **union** of the KPI Templates library (`kpi_templates` table via `useKpiTemplates` hook) and existing assigned KPIs (`kpis` table via `useAllKpis` hook):

1. **Category selected** → KRA Name dropdown shows the **deduplicated union** of KRA names from active templates AND existing KPIs matching that category. The Category field itself is now a searchable combobox (Popover + Command) with a **"+ Create new category"** option that opens an inline form for name, weightage (%), and color (hex picker). On save, the new category is persisted via `useCreateKraCategory` and auto-selected.
2. **KRA selected** → KPI Name dropdown shows templates matching category + KRA, **plus** any additional unique KPIs from existing assignments (deduplicated case-insensitively by KPI name).
3. **KPI selected** → All form fields auto-fill from the template (or existing KPI): UOM type, UOM, criteria, target value, weightage, frequency, source of data, rating thresholds (R5-R0), qualitative options, threshold mode, and resubmit reason setting.
4. **Custom entry** → A "+ Enter custom" / "+ Create new" option in each dropdown (Category, KRA, KPI) switches to a free-text input (or inline form for Category) with a back button to return to dropdown mode.

**Reset behavior:** Changing the category resets both KRA and KPI. Changing the KRA resets the KPI. This ensures cascading consistency.

**No impact on existing KPIs** — the same `handleSubmit` logic and `createKpi.mutateAsync()` call are used regardless of selection method.

#### 4.9.4b Cascading Filters in "Bulk Assign from Template"

The **BulkTemplateAssignDialog** replaces the former flat dropdown (540+ templates) with a structured cascading filter approach:

1. **Global search bar** — Free-text search across template title, KRA name, and KPI name fields. Filters the KPI options list in real time.
2. **Category filter** — Narrows templates to a specific KRA category. Shows template count badges per category. Selecting a category resets KRA and KPI selections.
3. **KRA Name filter** — Populated from unique KRA names within the selected category. Selecting a KRA resets KPI selection.
4. **KPI Name selector** — Final pick from the filtered list. Selecting a KPI displays an enhanced preview card with all key fields (Target, UOM, Weightage, Frequency, R0-R5 thresholds).
5. **Duplicate detection** — Before inserting, the system queries existing KPIs for the selected employees + period + KRA name + KPI name. If duplicates are found, a warning lists the affected employees and offers to proceed (skipping duplicates) or cancel.

**Files:** `src/components/admin/BulkTemplateAssignDialog.tsx`

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
- Calendar date picker spanning the **previous month and review month**
- Selects a day of month (1-31) as the achieved value
- If a date from the previous month is selected, the value is stored as **0** (meaning "completed before the review month started")
- Displays "Before 1st {Month}" when value is 0
- Available at all review levels (Self, Manager, Auditor, Management)

**Rating Calculation:**
- Uses "Lower is Better" logic: earlier date = higher rating
- Value 0 (pre-month completion) naturally scores highest (e.g., 0 ≤ R5 threshold)
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

#### 4.9.9 Out-of-Range Value Validation Warnings

To prevent garbage-in/garbage-out scoring (e.g., entering a raw production quantity into a percentage field), the system provides **non-blocking** orange warning banners when entered values appear unreasonable relative to thresholds and targets.

**Validation Rules:**
| Condition | Trigger | Example |
|-----------|---------|---------|
| **% UOM threshold check** | Value > 2× the highest R5–R1 threshold | R5=20%, entered 37,560 → warning |
| **Target multiplier check** | Value > 10× the target value | Target=100, entered 5,000 → warning |

**Where warnings appear:**
- **Org KPI Data Entry** (`OrgKpiEntryCard`): Inline alert below the achieved value input for org-wide scope
- **Self-Review** (`AchievedValueScoreInput`): Inline alert below achieved value input in auto-calculate and suggested-override modes

**Implementation:**
- `isValueOutOfRange()` utility exported from `src/lib/ratingCalculation.ts`
- Warnings are advisory only — they do NOT block saving or propagation
- Designed to catch domain-mismatch errors (e.g., raw MW entered into a % incentive field)

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
- KPIs show as locked/blurred in non-active months via `FrequencyLockedOverlay` component
- Overlay displays: "Review in {active_month}"
- Users cannot submit during locked periods — the Submit button is disabled
- **Self Review Sheet (`SelfReviewSheet.tsx`):** The "Your Assessment" card is wrapped with `FrequencyLockedOverlay`; the overlay blurs inputs and shows a lock message when the current month is not the active month for the KPI's cycle. The Submit button checks `isKpiLockedForPeriod` and is disabled when locked.
- **Dashboard KPI Table:** Each KPI row displays a `FrequencyLockBadge` (e.g., "Review in March") next to the KPI name when the KPI is in a locked period, providing immediate visual context.
- **Org KPI Data Entry:** The Data Entry tab filters out KPIs that are not in their active month, so locked KPIs are not shown at all.

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
- **Auto-Generate from KPIs:** "Generate from KPIs" button analyzes all existing assigned KPIs and automatically creates KPI templates and bundles for each unique department + designation combination. Uses the `generate_bundles_from_kpis()` database function. Safe to run multiple times — skips existing bundles/templates. Shows a confirmation dialog before execution and displays a success toast with counts of templates, bundles, and links created.

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
  - **Dynamic Workflow Stage Resolution (v1.42.0):** The Admin Data Entry dialog dynamically fetches the employee's assigned workflow stages via `useEmployeeWorkflowStages` and only displays role levels that exist in the employee's pipeline. For example, if an employee's workflow includes Skip-Level and HR PMS stages, those options appear alongside Self, Manager, Auditor, and Management. The `AdminRoleLevel` type supports all 6 levels: `self`, `manager`, `skip_level`, `hr_pms`, `auditor`, `management`.
  - **Enter Review Data:** Admins can enter or modify review submission data (achieved value, rating, score, remarks) for any role level present in the employee's workflow via the "Enter Data" button (pen icon) on expanded KPI rows
  - **Scoring Logic Alignment (v1.27.0):** The Admin Data Entry dialog now uses the **exact same scoring logic** as the Self Review Sheet (`SelfReviewSheet.tsx`). This ensures identical results regardless of whether data is entered by the employee or the admin. Key alignments:
    - **Qualitative KPI Input:** Binary/Tiered KPIs now render `QualitativeValueInput` (the same button-based label selector used in Self Review) instead of a plain numeric input. Admin selects "Yes"/"No" or tiered options; the component maps labels to numeric ratings automatically.
    - **Date UOM Input:** KPIs with `uom === 'Date'` now render `DateCalendarInput` (the same calendar picker used in Self Review) instead of a plain numeric input.
    - **R0 Threshold:** The scoring engine now receives `r0: kpi.r0` (the actual KPI threshold) instead of the previously hardcoded `r0: null`.
    - **Daily/Weekly Qualitative Special Case:** For qualitative KPIs with Daily or Weekly frequency, the rating is clamped directly (0-5) from the aggregated achieved value, matching the Self Review behavior.
    - **Score Storage:** The `score` field now stores the **raw rating (0-5)** from the scoring engine, NOT the previous `(rating / 5) * weightage` formula. This matches what Self Review stores as `self_score`.
    - **Achieved Value for Qualitative KPIs:** For binary/tiered KPIs, the `achieved_value` field stores the **numeric rating** (e.g., 5 for "Yes", 0 for "No"), not the raw text label. This matches Self Review's behavior.
    - **Rating Level Derivation:** Uses `getRatingLevel(score)` (>=4=blue, >=3=green, >=2=yellow, else red) matching Self Review, or the rating level returned directly from `QualitativeValueInput` for qualitative KPIs.
  - **Auto-Calculated Rating & Score:** When an admin enters an achieved value, the dialog automatically runs the aligned `calculateScoreFromAchieved()` function using the KPI's full thresholds (R5-R0), criteria, UOM type, and threshold mode. An "Auto" badge indicates calculated values. Admins can manually override both fields if needed — doing so clears the auto badge.
  - **Full 0-5 Rating Scale:** The Rating dropdown displays all 6 rating levels: Outstanding (5), Exceeds (4), Meets (3), Below (2), Needs Improvement (1), and Not Achieved (0). Ratings 0 and 1 map to the `red` DB enum value but display distinct labels and colors (orange for 1, gray for 0). The dropdown uses numeric string values ("0"-"5") internally and converts to DB-compatible `RatingLevel` on submission.
  - **Score Range:** The Score field now represents the raw rating (0-5) from the scoring engine, clamped to this range. This replaces the previous weighted score formula.
  - **Enter Daily/Weekly Data:** For KPIs with Daily or Weekly frequency, admins can enter sub-period submissions for any day or week via the "Daily Data" button (calendar icon) - **NO DATE RESTRICTIONS** apply to admins
  - Admins can override locked entries (e.g., entries marked as "Final" with `is_resubmitted: true`)
  - **Mandatory reason field** for all admin entries to ensure audit compliance
  - **N/A Flag Handling:** The Admin Data Entry Dialog includes a "Mark as Not Applicable" toggle switch showing the current `is_na` status. Admins can explicitly set or clear the N/A flag. Additionally, when an admin enters an `achieved_value`, the `is_na` flag is **automatically cleared** (set to `false`) to ensure the KPI is included in dashboard score calculations. This prevents the scenario where admin corrections remain invisible because a stale N/A flag excludes the KPI from scoring.
  - **Zero-Value Preservation:** Achieved values and scores of `0` are valid entries. The dialog uses explicit empty-string checks (`value !== ''`) instead of truthy checks to prevent JavaScript falsy coercion from discarding legitimate zero entries.
  - **Workflow Status Advancement (v1.43.0):** Admin data entry now optionally advances the KPI's workflow status (`kpis.status`) to match the role level being entered. An "Advance workflow status" toggle (default: ON) controls this behavior. When enabled: Self → `self_review`, Manager → `manager_check`, Skip-Level → `skip_level_check`, HR PMS → `hr_pms_review`, Auditor → next stage via `resolveForwardStatus()`, Management → `approved`. The `review_submissions.kpi_status` is also synced to `submitted`. When the toggle is OFF, only submission data is updated without changing the KPI's workflow stage — useful for correcting values without moving the workflow forward.
  - **Cache Invalidation:** The admin data entry mutation invalidates both `review-submission-admin` (dialog's own fetch key) and `review-submissions` (shared key) to ensure the UI reflects saved data immediately.
  - **Workflow Mutation Cache Invalidation Rule:** All workflow mutations (send-back, approve, submit, N/A forward) MUST invalidate `['kpis']`, `['kpis-by-period']`, and `['review-submissions']` query keys. The `kpis-by-period` key is used by the EmployeeSelectorGrid for pending/reviewed badge counts and will not be invalidated by `['kpis']` alone due to TanStack Query's prefix matching rules. Send-back mutations also close the review sheet (`setReviewSheetOpen(false)`) to provide immediate visual feedback.
  - All admin actions are logged in `kpi_audit_logs` with `on_behalf_of` and `on_behalf_role` tracking
  - Affected employees receive notifications about admin data changes
- **Admin Visibility in Audit Trails:**
  - **KPI Timeline:** Admin actions display with rose/pink color theme and show "by Admin Name (on behalf of Employee Name)"
  - **Audit Logs Page:** Includes dedicated "On Behalf Of" column showing employee name and role level
  - **Audit Trail Report:** Exports include "On Behalf Of", "On Behalf Role", and "Admin Reason" columns
  - **Admin Actions Stats Card:** New stat card showing count of admin/on-behalf actions for the period
  - Admin action types include: `ADMIN_DATA_ENTRY_SELF`, `ADMIN_DATA_ENTRY_MANAGER`, `ADMIN_DATA_ENTRY_AUDITOR`, `ADMIN_DATA_ENTRY_MANAGEMENT`, `ADMIN_DAILY_ENTRY_OVERRIDE`, `ADMIN_STATUS_OVERRIDE`, `ADMIN_OVERRIDE`, `ADMIN_STATUS_STEP_BACK`
  - Workflow forwarding actions: `MANAGER_FORWARDED`, `AUDITOR_FORWARDED` — logged when a reviewer forwards a KPI to the next stage
- **Admin KPI Status Step-Back:**
  - Admins can move any KPI's workflow status **one step backward** via the "Step Back" button (undo icon) on expanded KPI rows in the All KPIs page
  - The button is only visible when the KPI is not at `kra_set` (the first stage)
  - Opens `AdminStatusStepBackDialog` showing current status, target (previous) status, KPI name, and employee name
  - **Mandatory reason field** required for audit compliance
  - On submit: updates `kpis.status`, clears downstream review data, inserts `ADMIN_STATUS_STEP_BACK` entry in `kpi_audit_logs`, creates a `kpi_queries` entry with `[ADMIN SENT BACK]` prefix and `query_type: 'send_back'` (auto-resolved), and notifies the affected employee
  - **Downstream data clearing:** When stepping back, all review submission fields for stages **after** the target status are cleared to prevent stale data:
    - To `kra_set`: Clears self, manager, skip_level, hr_pms, auditor, and management fields; resets `kpi_status` to `open`
    - To `self_review`: Clears manager, skip_level, hr_pms, auditor, and management fields
    - To `manager_check`: Clears skip_level, hr_pms, auditor, and management fields
    - To `skip_level_check`: Clears hr_pms, auditor, and management fields
    - To `hr_pms_review`: Clears auditor and management fields
    - To `audit`: Clears management fields
  - **Reviewer Send-Back (v1.28.0):** The same cascading clear logic is used by the `UnifiedScorecard` send-back mutation, ensuring consistency between admin step-back and reviewer send-back operations.
  - **Visible send-back reason:** A `kpi_queries` row with `[ADMIN SENT BACK] <reason>` and `query_type: 'send_back'` is created as auto-resolved, making the reason visible in the employee's Review Journey and query trail (matching `useSendBackKpi` behavior) without appearing in the active Query Inbox
  - **Safety-net trigger (`trg_sync_submission_on_kra_set`):** A database trigger on `kpis` fires whenever `kpis.status` transitions to `kra_set`. It resets `review_submissions.kpi_status` to `open` **and nullifies ALL review data fields** (self, manager, skip-level, HR PMS, auditor, management ratings/scores/remarks/evidence, final rating/score, is_na, na_marked_by_role). This ensures no stale data remains regardless of which code path triggered the send-back. **(Enhanced in v1.45.1 to clear all fields; previously only reset kpi_status.)**
  - Status step-back mapping: `approved` → `management_review` → `audit` → `hr_pms_review` → `skip_level_check` → `manager_check` → `self_review` → `kra_set`
  - **(v1.45.0)** `getPreviousStatus` now accepts an optional `workflowStages` parameter and uses the full 8-stage `FULL_STATUS_ORDER` as default. Cascade-clear logic uses index-based comparison against the full order instead of hardcoded status strings, correctly handling `skip_level_check` and `hr_pms_review` stages.
- Audit logging for all changes
- **Copy KRAs (`CopyKrasDialog`):** Replicate KRAs from one employee to another without re-drafting.
  - **Step 1 – Source:** Select source employee, review period, and year. KRAs auto-load.
  - **Step 2 – Select KRAs:** Cherry-pick individual KRAs with Select All / Deselect All toggle. Shows category, KPI name, and weightage.
  - **Step 3 – Target:** Multi-select target employees (excludes source), set target period/year.
  - **Duplicate Detection:** Automatically detects and skips KRAs already assigned to target employees for the target period (using `kra_name + kpi_name` composite key). Displays per-employee duplicate count and a summary warning.
  - **Fields Copied:** `category_id`, `kra_name`, `kpi_name`, `target_value`, `uom`, `uom_type`, `weightage`, `frequency`, `sub_frequency`, `criteria`, `source_of_data`, `r0-r5`, `threshold_mode`, `qualitative_options`, `is_org_level`, `org_level_scope`, `ref_code`, `day_count_type`, `frequency_cycle_start`, `require_resubmit_reason`. New KPIs are created with `status: 'kra_set'`.
  - **No new infrastructure:** Reuses existing `kpis` table INSERT path and admin RLS policies.
- **Delete Assigned KRA:** Admins can permanently remove an assigned KRA from any employee.
  - A red trash icon button appears on each KPI row in the expanded employee view on the All KPIs page.
  - Clicking opens a confirmation dialog displaying the KRA name and KPI name to prevent accidental deletions.
  - On confirm, the KRA is deleted from the `kpis` table and the table refreshes automatically.
  - Enforced by a DELETE RLS policy on `kpis` restricted to admin role via `has_role()`.
  - If dependent data exists (review submissions, queries) with CASCADE foreign keys, it is also removed; otherwise the delete fails gracefully with an error toast.

#### 4.9.7 Review Periods (`/admin/review-periods`)
- Create review periods (monthly/quarterly)
- Lock/unlock periods
- Prevent modifications to locked periods

#### 4.9.8 Workflow Configuration (`/admin/workflow-config`)
- Define workflow templates
- Assign workflows to departments/grades/employees
- Skip stages for specific groups

#### 4.9.9 Data Import (`/admin/import`)
- **Organization Structure Import** (first tab)
  - Bulk import divisions, business units, departments, sub-branches, designations, PMS grades, and levels from Excel
  - **Flexible row format:** Each column can be filled independently — rows don't need to be connected across all columns. You can add all Divisions in separate rows, all Business Units in other rows, etc.
  - **Smart parent resolution:** If a child entity (e.g. Business Unit) is on a row without its parent (Division), the system auto-assigns if only one parent exists (in the file or database). If multiple parents exist and none is specified, the entry is skipped with a warning.
  - Warnings (not blocking errors) are shown for entities that can't be resolved; all other valid entries are imported
  - Deduplication by name (case-insensitive); codes updated if provided for existing entries
  - Download template and export current data supported
- Bulk import employees from Excel
  - New employees are provisioned via the `create-employee` backend function (server-side admin API), which prevents the admin session from being logged out during bulk creation
  - Existing employees are matched by **employee_code or email only** (name matching removed to prevent silent overwrites of unrelated profiles with common names)
  - Existing employees are updated in-place via direct profile updates
- Bulk import KPIs from Excel
- **Employee matching is by `employee_code` only** — no name-based fallback. If the code doesn't match, the employee is auto-created or an error is reported. This prevents silent substitution of a different employee who happens to share the same name.
- **Imported ratings are preserved exactly as provided.** When a rating value (self/manager/auditor) is present in the uploaded file, it is stored as-is without recalculation. Nullish coalescing (`??`) is used instead of truthy checks (`||`) so that a legitimate rating of `0` is never silently dropped.
- **Threshold values (R5-R0) are UOM-aware.** For non-percentage UOMs (Days, Number, Hours, Minutes, Amount, Index, Ratio, Score, Count, Rate), thresholds are stored as plain absolute numbers (e.g., `3`, `5`, `7`). Only when UOM is explicitly `%` or `percentage` are thresholds converted to percentage strings (e.g., `85%`, `100%`). This prevents incorrect conversions like storing `3` as `300%` for a "Days" KPI.
- **Excel percentage handling (≤ 200% heuristic):** Excel delivers percentage-formatted cells as decimals (e.g., 102% → `1.02`, 150% → `1.5`). The import code detects values in the 0–2 range for `%` UOM KPIs and multiplies by 100 to recover the intended percentage. This applies to `target_value`, `achieved_value`, and rating thresholds (R5–R0). The `<= 2` threshold covers up to 200%, which is sufficient for virtually all KPI scenarios. Values already containing a `%` sign are also checked: if the numeric part is ≤ 2 with a decimal (e.g., `"1.02%"`), it is treated as an Excel artifact and corrected to `"102%"`.
- **Remarks fields** (`employeeRemarks`, `managerRemarks`, `auditRemarks`) are preserved even when they contain whitespace-only or edge-case values. Broader column name aliases (e.g., `Audit_Remarks`, `Auditor_Remarks`, `auditor_remarks`) are recognized.
- Background processing for large files (error reports capped at 500 entries per import)
- Progress tracking
- **Detailed Error Reporting** (`ImportResultsSummary` component):
  - After every import (Employee, KPI foreground, KPI background), a results summary card replaces the old simple alerts
  - Shows stats row: Total, Success, Failed, Skipped counts
  - Displays a scrollable error table with Row Number, Employee Code, Name, Status, and Error Message
  - **Download Error Report** button exports all failed/skipped rows as an Excel file (`import-errors-{type}-{date}.xlsx`)
  - Per-row results are tracked as structured `ImportRowResult` objects (`{ row, employeeCode, employeeName, status, message }`)
  - Background import errors are parsed from string format into the same structured display
   - **Zero Silent Drop Policy:** All pre-import validation errors are surfaced in the UI as skipped rows at upload time, regardless of how many or few fail. The edge function validates every row (no early exit after N errors) and returns all validation failures (capped at 500 in the response payload) alongside the 202 success response. The frontend immediately displays an `ImportResultsSummary` card with the skipped rows so the user can download the error report. No error is silently dropped.
   - **Review Submission Rollback:** If a KPI is successfully inserted but the corresponding `review_submissions` record fails to create, the system automatically rolls back (deletes) the orphaned KPI and marks the row as "failed" in the import results. This prevents data integrity issues where KPIs exist without review submission records, which would break the review workflow. The specific error message is surfaced in the error report.
  - **Automatic N/A Detection:** Both client-side and background (edge function `import-kpis`) import paths use identical NA detection logic. KPIs where `targetAchieved` is "NA", "N/A", "not applicable", or "-" — or where all score-related fields (achievedValue, employeeRating, rating, managerRating, auditRating) are truly empty (null/undefined/blank) — are automatically marked as N/A (`is_na = true`) with all scores/ratings nulled out. **Important:** Explicit zero values (`0`) are treated as valid data, not as empty. Only truly blank cells trigger automatic N/A detection. This prevents blank or NA cells from silently counting against an employee's weighted average while preserving legitimate zero-score data.

##### Import Columns Reference (PMS Data)

The PMS import template supports the following columns (42 total):

**Identification (6 columns):**
| Column | Required | Description |
|--------|----------|-------------|
| `sNo` | No | Serial number |
| `refCode` | No | User-defined reference code for data verification. Preserved on export for round-trip tracking. |
| `newCode` | **Yes** | Employee code |
| `fullName` | **Yes** | Employee full name |
| `month` | **Yes** | Review period (e.g., "Dec-25") |
| `reviewStatus` | No | Explicit review status. When provided, overrides the auto-inferred status. Accepted values: `Approved`, `Audit`, `Manager Check` / `Manager Review`, `Self Review`, `KRA Set`. If omitted or unrecognized, the system infers the status from which rating columns are populated. |

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
- **Health Score** (0–100): Composite metric factoring SLA compliance, open query backlog, and average response time. When no resolved queries exist, SLA defaults to a neutral score (80) instead of penalizing with 0%.
- **Response Time Metrics**: Average, fastest, and slowest resolution times computed from `created_at` → `resolved_at`
- **SLA Compliance**: Percentage of queries resolved within the configurable SLA target (default 2 days, admin-configurable via `query_sla_target_days` in Workflow Settings). Displays "N/A" when no resolved queries exist.
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

**Import Data Preservation Rules:**
- All per-level achieved values (`employeeTargetAchieved`, `managerTargetAchieved`, `auditTargetAchieved`) are stored in their dedicated `review_submissions` columns (`achieved_value`, `manager_achieved_value`, `auditor_achieved_value`), preserving the full review trail exactly as uploaded.
- Values of `0` are treated as valid data (not skipped). Only `null`/`undefined`/empty values are treated as missing.
- Ratings and remarks at every level are preserved regardless of `reviewStatus`.
- R5-R0 thresholds are stored as plain numbers for non-percentage UOMs (Days, Number, Hours, etc.) and only converted to percentage strings when UOM is explicitly `%`.

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
- KRA auto-rollover settings with enhanced multi-step rollover dialog:
  - **Step 1 – Configuration**: Select source/target period, choose all or specific employees
  - **Step 2 – Preview & Conflicts**: Dry-run shows employees ready to rollover vs those with existing KPIs; admin checks boxes to rollover balance (missing) KPIs only or skip
  - **Step 3 – Results & Report**: Summary cards, detailed results table, downloadable Excel report with employee-level breakdown
- Email notification templates
- Organization name/branding
- **File Upload Limit**: Centralized `max_upload_size_mb` setting (default: 5 MB) controls the maximum file size for all evidence uploads, attachments, and branding assets. Configurable under **General** tab with a range of 1–50 MB. All upload components (`MultiFileUpload`, `EvidenceUpload`, `OrgKpiFileUpload`, branding asset upload) read this value dynamically via the `useUploadLimits` hook. Import file validation (`importValidation.ts`) uses a separate hardcoded limit.
- **Paste-to-Upload (Ctrl+V / Cmd+V)**: All file upload components (`MultiFileUpload`, `EvidenceUpload`, `OrgKpiFileUpload`) support clipboard paste for images. Users can focus the upload area and press Ctrl+V to paste a screenshot or copied image. Pasted files go through the same validation and upload logic as click/drag-and-drop. Note: browsers only support pasting images via clipboard — arbitrary files (PDFs, Excel) cannot be pasted from a file explorer.
- **Unified Evidence Upload**: All scorecard components (`UnifiedScorecard`, `EmployeeScorecard`, `AuditScorecard`, `ManagementScorecard`, `SelfReviewSheet`) now use `MultiFileUpload` for consistent paste-to-upload and multi-file (up to 5) support. The legacy single-file `EvidenceUpload` component is no longer used in any scorecard.
- **Multi-File Evidence Persistence**: All scorecard components (`SelfReviewSheet`, `UnifiedScorecard`) save both `*_evidence_url` (first URL, backward compat) and `*_evidence_urls` (full JSONB array) to `review_submissions`. The `ReviewTrailCard`, `ReviewTrailCardCompact`, `ReviewStageCard`, and `KpiJourneySection` components render all evidence files from the `*_evidence_urls` JSONB arrays (with fallback to single `*_evidence_url` columns for backward compatibility), ensuring downstream reviewers across all workflow stages (Manager, Skip-Level, HR PMS, Auditor, Management) can see all uploaded evidence in the Review Journey. A one-time data migration syncs legacy single-URL values into the JSONB arrays for all 6 reviewer levels, so existing evidence is visible without re-submission. The `ReviewSubmission` TypeScript interface includes all `*_evidence_urls` fields for type-safe access.

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
| Impact | Button to open Impact Analysis sheet (shows affected employees) |
| Supporting File | File upload for evidence |

**File Upload:**
- Supports PDF, DOC, DOCX, XLS, XLSX, PNG, JPG, JPEG
- Maximum file size: 5MB
- Files stored in `review-evidence` bucket
- URL saved to `evidence_url` column in `org_kpi_values`

#### 4.9.13 Org KPI Overview (`/admin/org-kpi-overview`)
- Dashboard showing all organization-level KPIs with three tabs: **Overview**, **Mapping**, and **Change History**
- Displays current achieved values and data sources
- Filter by review period and category

**Overview Tab:**
- KPIs grouped by category with target/achieved values, weight, data source, and remarks
- Each row has an **Impact** button (Users icon) to open the Impact Analysis Sheet
- Shows simulated score changes before values are saved

**Mapping Tab (Feature 2: Org KPI Mapping Dashboard):**
- Three sub-views: **By KPI**, **By Employee**, **By Department**
- **By KPI**: Each org KPI with all mapped employees, their department, designation, and status
  - **Scope dropdown**: Change scope (Organization / Department / Employee) directly on each KPI card
  - **Add Employee button**: Opens dialog to assign new employees (searchable, filterable by department, multi-select)
  - **Remove button**: Trash icon per employee row to unlink from Org KPI (preserves data, clears `is_org_level` flag)
- **By Employee**: Each employee with all their org KPIs listed; hover over a KPI badge to reveal a remove button
- **By Department**: Department-wise grouping showing employee count, unique KPIs, and total records
- Summary cards: Unique Org KPIs, Employees Mapped, Total Records
- Search across KPI names and employee names

**Change History Tab (Feature 5: Audit Log):**
- Timeline of all changes to org KPI values
- Shows: who changed, old → new value, status changes, propagation count
- Data stored in `org_kpi_value_history` table
- Admin-only visibility (RLS policy)

**Impact Analysis Sheet (Feature 1):**
- Slide-out panel showing affected employees for a specific Org KPI
- Summary: total employees affected, department breakdown
- Simulate score changes by entering a value before saving
- Score change indicators: improved, declined, unchanged
- Employee table: name, code, department, weight, current score, simulated score, change

**Propagation Summary Report (Feature 3):**
- Shown after values are propagated to employee KPIs
- Summary cards: improved, declined, unchanged, new entries
- Details table: employee name, department, old score → new score, change

**Database: `org_kpi_value_history`:**
| Column | Description |
|--------|-------------|
| `org_kpi_value_id` | FK to `org_kpi_values` |
| `old_achieved_value` / `new_achieved_value` | Before/after values |
| `old_status` / `new_status` | Status transitions |
| `changed_by` | User who made the change |
| `change_type` | 'create', 'update', 'status_change', 'propagation' |
| `propagated_count` | Number of employees affected |
| `metadata` | Additional context (JSONB) |

#### 4.9.14 Org KPI Data Owners & Access Control

**Data Owner Assignment:**
- Admins can assign specific users as "data owners" for org-level KPIs via the **Org KPI Data Entry** page
- Each KPI row displays an "Actions" column with a **UserPlus** button to open the owner assignment dialog
- A badge shows the current owner count for quick visibility
- Data owners can enter/update values for their assigned KPIs
- Multiple owners can be assigned per KPI (primary + backup)
- Assignment is tracked in `org_kpi_data_owners` table
- **RLS Policy (kpis)**: A dedicated SELECT policy on the `kpis` table (`"Data owners can view assigned org-level KPIs"`) allows data owners to see org-level KPIs they are assigned to, even if those KPIs belong to employees outside their reporting chain. This policy checks `is_org_level = true` and verifies ownership via the `org_kpi_data_owners` table.
- **RLS Policy (profiles)**: A SELECT policy on the `profiles` table (`"Data owners can view org kpi employee profiles"`) allows data owners to see profile information (name, department, designation) for employees who have org-level KPIs the data owner manages. This policy uses a **SECURITY DEFINER function** (`is_data_owner_for_employee`) to avoid circular RLS dependencies — the `profiles` policy needs to check `kpis`, but `kpis` policies also check `profiles` (for manager access). The SECURITY DEFINER function bypasses RLS when querying `kpis`, breaking the circular chain. This enables the Impact Analysis feature to display all affected employees, not just the data owner's direct reports.
- **RLS Policy (review_submissions)**: Three dedicated policies on `review_submissions` allow data owners to **SELECT**, **INSERT**, and **UPDATE** submissions for org-level KPIs they manage. The SELECT policy is critical — without it, UPDATE operations silently return 0 rows (PostgreSQL requires row visibility for updates), causing the fallback INSERT to fail with a duplicate key violation. All three policies check `kpis.is_org_level = true` and verify ownership via `org_kpi_data_owners`.

**Page Access Control:**
- **Admins**: Full access to all org-level KPIs plus owner assignment (Actions column visible)
- **Data Owners**: Access only to their assigned KPIs (Actions column hidden)
- **Non-owners**: No access (redirected to dashboard)
- Route protected by `DataOwnerRoute` component (checks admin role OR ownership status)
- Sidebar shows "Org KPI Data Entry" link under "Data Entry" section for data owners (non-admins)

**Governance Integration:**
- Data Owners inherit governance permissions from their base role (employee, manager, etc.)
- The `useReviewPeriodPermissions` hook is checked on the Data Entry page for `edit_scores` and `view_only`
- When governance locks restrict the user's role, all inputs, N/A toggles, and propagate buttons are disabled
- A `GovernanceLockBanner` is displayed at the top of the page explaining which restrictions apply
- Admins always retain full access regardless of governance locks

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
| Employee Summary | `/reports/performance-summary` | Individual performance ranked by weighted score |

#### 4.10.0 Employee Performance Summary Scoring

The Employee Performance Summary report uses the **same weighted scoring logic as the Dashboard**:

- **Weighted Score**: `totalScore += score × weight` (not raw score addition)
- **Max Possible Score**: `outOfScore += weight × 5`
- **Overall Rating**: `totalScore / totalWeight` (weighted average out of 5)
- **N/A Exclusion**: KPIs marked as N/A are excluded from both numerator and denominator
- **Zero Preservation**: Uses nullish coalescing (`??`) so scores of 0 are treated as valid data, not missing
- **Score Priority (Fallback Chain)**: `final_score ?? management_score ?? auditor_score ?? manager_score ?? self_score ?? 0`. The system always uses the most authoritative score available, ensuring in-progress reviews reflect the latest reviewer assessment rather than falling back to the employee's self-score.

**Filters:**
- **Month Filter**: Static dropdown with 12 calendar months (January–December) plus "All Months". Replaces the previous DB-driven review periods dropdown.
- **Status Filter**: Dropdown populated from `STATUS_LABELS` (Approved, Management Review, Audit, Manager Check, Self Review, KRA Set) plus "All Status" default. Filters rows by review status.

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

| Status Transition | Recipients | Notification Type | Email Event Type |
|-------------------|-----------|-------------------|------------------|
| `kra_set` → `self_review` | Reporting Manager | `kpi_submitted` | `kpi_submitted` |
| Any status → `kra_set` (send-back) | Employee | `manager_rejected` | `manager_rejected` |
| `self_review` → `manager_check` | Employee + Auditors | `kpi_approved` + `kpi_ready_for_audit` | `manager_approved` + `kpi_ready_for_audit` |
| `manager_check` → `management_review` | Employee + Management | `kpi_approved` + `kpi_ready_for_management` | `manager_approved` + `kpi_ready_for_management` |
| `manager_check` → `audit` | Employee + Auditors | `kpi_approved` + `kpi_ready_for_audit` | `manager_approved` + `kpi_ready_for_audit` |
| `audit` → `management_review` | Employee + Management | `kpi_approved` + `kpi_ready_for_management` | `manager_approved` + `kpi_ready_for_management` |
| `management_review` → `approved` | Employee | `kpi_finalized` | `final_approved` |
| `audit` → `approved` | Employee | `kpi_finalized` | `final_approved` |

**KPI Creation Notifications:**

| Event | Recipients | Notification Type | Email Event Type |
|-------|-----------|-------------------|------------------|
| KPI created (INSERT) | Employee | `kra_assigned` | `kra_assigned` |

**Review Period Notifications:**

| Event | Recipients | Notification Type | Email Event Type |
|-------|-----------|-------------------|------------------|
| Period locked | All employees in period | `period_locked` | `period_locked` |

**Query Notifications:**

| Event | Recipients | Notification Type | Email Event Type |
|-------|-----------|-------------------|------------------|
| Query raised | Recipient | `query_raised` | `query_raised` |
| Query response submitted | Raiser + Manager (FYI) | `query_response_submitted` / `query_response_fyi` | `query_response_received` |
| Query resolved | Employee + Manager (FYI) | `query_resolved` / `query_resolved_fyi` | `query_resolved` |

**PIP Notifications:**

| Event | Recipients | Notification Type | Email Event Type |
|-------|-----------|-------------------|------------------|
| PIP created | Employee | `pip_initiated` | `pip_initiated` |
| PIP completed | Employee | `pip_completed` | `pip_completed` |
| PIP milestone reminder | Employee | `pip_milestone_reminder` | `pip_milestone_reminder` |

**Admin Action Notifications:**

| Event | Recipients | Notification Type | Email Event Type |
|-------|-----------|-------------------|------------------|
| Admin status change | Employee | `admin_status_change` | `admin_status_change` |
| Admin data entry | Employee | `admin_data_entry` | `admin_data_entry` |
| Admin data override | Employee | `admin_data_override` | `admin_data_override` |
| Admin status step-back | Employee | `admin_status_step_back` | `admin_status_step_back` |
| Org KPI sent back | Data Owner(s) | `org_kpi_sent_back` | `org_kpi_sent_back` |

**Observation Access:** Observations can be raised at **all view levels** (employee, manager, skip-level, HR PMS, auditor, management) and for **all KPI statuses** including approved KPIs. Observations are independent of the KPI review lifecycle — they remain interactive (add, edit, reply, resolve) regardless of whether the KPI is in `kra_set`, `self_review`, or `approved` status. This applies to past, current, and future review periods.

**Observation Notifications:**

| Event | Recipients | Notification Type | Email Event Type |
|-------|-----------|-------------------|------------------|
| Observation raised | KPI owner (employee) | `observation_raised` | `observation_raised` |
| Reply posted on observation | Observation creator + KPI owner (excl. replier) | `observation_reply` | `observation_reply` |
| Observation resolved | KPI owner + observation creator (excl. resolver) | `observation_resolved` | `observation_resolved` |

**Email Notification Type Mapping:**
The database trigger `send_email_on_notification()` maps internal notification types to email template event types. This allows in-app notification display to use descriptive internal types while emails use the correct template keys. Key mappings:
- `kpi_approved` → `manager_approved`
- `kpi_finalized` → `final_approved`
- `query_response_submitted` / `query_response_fyi` → `query_response_received`
- `query_resolved_fyi` → `query_resolved`
- `observation_raised`, `observation_reply`, `observation_resolved` → pass through as-is
- `admin_status_step_back`, `rollback_requested`, `rollback_approved`, `rollback_rejected` → pass through as-is
- All other types pass through unchanged

**Trigger HTTP Call:**
The `send_email_on_notification()` trigger uses `net.http_post()` (from the `pg_net` extension) to call the `send-email-notification` edge function. The call signature is `net.http_post(url, body::jsonb, params::jsonb, headers::jsonb)`. The body is passed as native `jsonb` (not cast to `text`), and an empty `params := '{}'::jsonb` argument is required. Earlier versions incorrectly used `extensions.http_post()` with a `::text` body cast, which caused silent failures for all trigger-based emails.

**Trigger Auth & RLS Requirements:**
The DB trigger sends the **publishable JWT** (~208 chars) as both `apikey` and `Authorization` headers. The edge function's `SUPABASE_ANON_KEY` env var is a shorter internal key (~46 chars) that will never match. To resolve this, the `validateCaller` helper in the edge function falls back to reading the stored publishable key from `system_settings.supabase_anon_key`. This requires:
1. An RLS policy allowing the `anon` role to SELECT from `system_settings` (safe — contains only config keys, not secrets).
2. The fallback `createClient` call uses `serviceRoleKey` first (bypasses RLS as belt-and-suspenders).
3. All `catch` blocks in `validateCaller` now log errors explicitly (previously silent, making diagnosis impossible).
Test emails from the UI work because they carry a real user JWT validated via `supabase.auth.getUser()`.

**Delivery:**
- In-app notifications (real-time via Supabase Realtime)
- Email notifications (via configurable provider: Resend, SMTP, or Microsoft 365 Graph API)
- Email events are individually toggleable in System Settings → Email Notifications
- 27 event types supported with customizable email templates (including observation raised, reply, resolved, password rollout, admin status step back, rollback requested/approved/rejected)
- **Email Header Logo**: The App Logo configured in Global Branding (`app_settings.logo_url`) is automatically displayed in the **top-right corner** of all email headers. Falls back to the email-specific company logo if the branding logo is not set.
- **Auto-Linkified URLs**: All URLs (http/https) in email template bodies are automatically converted to **clickable blue hyperlinks** when the email is rendered. This applies to all existing and future templates — no manual HTML is needed.

**Smart Notification Navigation (Deep-Link):**

Clicking a notification row in the Inbox navigates directly to the relevant page. The centralized `getNotificationNavigationPath(item, currentUserId?)` utility in `src/lib/inboxUtils.ts` maps each notification type to a target route. The optional `currentUserId` parameter enables context-aware routing: if the notification is about the current user's own KPI, it navigates to self-view; if it's about another employee's KPI, it builds a reviewer deep-link with the employee context. For query-related notifications (`query_resolved`, `query_resolved_fyi`, etc.), the function uses `fromUser.id` (mapped from the notification's `related_user_id` column, which stores the KPI owner / `raised_to`) to determine the correct employee context, bypassing the `isSelfTargeted` check to ensure reviewers are directed to the team-view scorecard rather than their own empty dashboard. The `notify_on_query_resolved` trigger skips `send_back` type queries and fires on any status transition to `resolved` (not just `open` → `resolved`).

| Notification Type | Target Route |
|---|---|
| `kpi_submitted` | `/dashboard?view=team&employee={employeeId}&kpi={kpiId}` |
| `kpi_approved` / `kpi_finalized` / `manager_rejected` / `admin_status_step_back` | `/dashboard?kpi={kpiId}` (employee's own KPI) |
| `admin_status_change` / `admin_data_entry` / `admin_data_override` | `/dashboard?kpi={kpiId}` (self) or `/dashboard?view=team&employee={employeeId}&kpi={kpiId}` (if manager-targeted with `metadata.employee_id`) |
| `kpi_ready_for_audit` | `/dashboard?view=audit&employee={employeeId}&kpi={kpiId}` |
| `kpi_ready_for_management` | `/dashboard?view=management&employee={employeeId}&kpi={kpiId}` |
| `kra_assigned` / `kra_batch_assigned` / `period_locked` | `/dashboard` |
| `query_raised` / `query_resolved` / `query_responded` / `query_response_submitted` / `query_resolved_fyi` | `/dashboard?kpi={kpiId}&panel=queryHistory` (self) or `/dashboard?view=team&employee={employeeId}&kpi={kpiId}&panel=queryHistory` (reviewer) |
| `observation_raised` / `observation_reply` / `observation_resolved` | `/dashboard?kpi={kpiId}` (self-targeted) or `/dashboard?view=team&employee={employeeId}&kpi={kpiId}` (reviewer-targeted) |
| `pip_initiated` / `pip_completed` / `pip_milestone_reminder` | `/admin/pip` |
| `password_rollout` | `/` (home) |
| `rollback_requested` | `/dashboard?view=team&employee={employeeId}&kpi={kpiId}` (reviewer) or `/dashboard?kpi={kpiId}` (self) |
| `rollback_approved` / `rollback_rejected` | `/dashboard?kpi={kpiId}` |

**Dashboard Employee Deep-Link Handler:** When the Dashboard receives `?employee={id}&kpi={kpiId}`, it fetches the employee's profile, switches to the appropriate view mode, and calls `handleSelectEmployee()` to open `UnifiedScorecard` with `autoOpenKpiId` set — navigating directly to the exact KPI. **Period Auto-Switch:** When a self-view deep-link KPI isn't found in the currently selected period, the Dashboard automatically looks up the KPI's review period from all loaded KPIs and switches to it, ensuring the deep-link resolves correctly even across period boundaries.

**Snoozed Item Enrichment:** Snoozed notification items receive the same profile/metadata enrichment as regular notifications (fromUser, kpiName, kraName), ensuring navigation paths work correctly when items are unsnoozed.

**Enriched Notification Detail Sheet:** The `InboxDetailSheet` now displays KPI name, KRA name, and the "From" user for notifications. These fields are extracted from the notification's `metadata` JSON (`kra_name`, `kpi_name`, `employee_name`) and resolved via a batch profile lookup on `related_user_id`. When `metadata.from_status` and `metadata.to_status` are present, a visual workflow status transition is displayed (e.g., `[Self Review] → [Manager Review]`) using styled badges and an arrow icon. The `getStatusLabel()` helper in `inboxUtils.ts` converts internal status codes to human-readable labels.

- **All rows (notification & query)**: Click always opens the detail sheet first (marks as read automatically). Navigation to the target page happens via the "Open in App" button inside the detail sheet.
- **Eye icon**: Always opens the detail sheet for all item types
- **"Open in App" button**: Inside the detail sheet, navigates to the deep-linked dashboard page with employee context

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
- **Frequency Indicator Badges**: Bi-Monthly and Quarterly KPIs display colored badge indicators across all views (desktop table, review panel header, mobile cards) similar to the existing "Daily" badge. Bi-Monthly badges use violet styling; Quarterly badges use teal. In the review panel header (`KpiHeaderSection`), the badge also shows the current cycle label (e.g., "Bi-Monthly: Jan-Feb", "Quarterly: Q1 (Jan-Mar)") derived from `getCycleLabel()` in `frequencyUtils.ts`.
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
│   │   ├── KpiTimeline.tsx          # Review audit timeline dialog — uses native `overflow-y-auto` scrolling (not Radix ScrollArea) for reliable flex-layout compatibility
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
│   │   ├── OrgKpiDataEntry.tsx
│   │   └── ObservationsOverview.tsx  # Admin view of all observations
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
    ├── create-backup/
    ├── restore-backup/
    ├── update-backup-schedule/
    ├── update-smtp-password/
    ├── password-rollout/
    └── generate-pip-letter/
```

### Edge Function Authentication Patterns

All edge functions use `verify_jwt = false` in `config.toml` and implement their own authorization in code. There are three auth patterns:

| Pattern | Functions | How It Works |
|---------|-----------|-------------|
| **Bearer JWT + Admin Role** | `create-employee`, `password-rollout`, `update-smtp-password`, `update-backup-schedule`, `import-kpis` | Validates the `Authorization: Bearer <jwt>` header via `supabase.auth.getUser()`, then checks `user_roles` for admin role. Used by frontend calls via `supabase.functions.invoke()`. |
| **Dual Auth (JWT OR CRON_SECRET)** | `auto-rollover-kpis`, `create-backup` (manual=JWT, scheduled=CRON_SECRET) | Accepts either a valid admin JWT **or** an `X-Cron-Secret` header matching the `CRON_SECRET` environment variable. This allows both frontend admin calls and pg_cron scheduled jobs to authorize. |
| **Service-Role or User JWT** | `send-email-notification` | Accepts either the `SUPABASE_SERVICE_ROLE_KEY` as the Bearer token (used by DB triggers via `net.http_post` and by other edge functions like `password-rollout`) **or** a valid user JWT (used by admin test-email calls from the frontend). |

**Secrets Required:**
- `CRON_SECRET` — Random string shared between cron SQL jobs and edge functions. Must be set as a Cloud secret. When backup schedules are saved via the admin UI, the `update-backup-schedule` function automatically includes this secret in the cron job SQL headers.
- `SUPABASE_SERVICE_ROLE_KEY` — Auto-provisioned by Supabase. Used by `send-email-notification` to validate DB trigger callers.

**Important:** After adding or changing the `CRON_SECRET`, admins must re-save the backup schedule from the Backup Settings UI so the cron job picks up the new secret value.

#### Shared Admin Auth Helper — Standard Destructuring

All admin-only edge functions MUST use the shared `requireAdminUser` helper and destructure `user` into local scope to prevent `ReferenceError` regressions when referencing `user.id` in audit logs:

```typescript
import { requireAdminUser } from "../_shared/admin-auth.ts";

const auth = await requireAdminUser(req);
if (!auth.authorized || !auth.adminClient) {
  return new Response(JSON.stringify({ error: auth.error }), {
    status: auth.status ?? 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
const supabase = auth.adminClient;
const user = auth.user; // MANDATORY — keeps user.id in scope for audit logs
```

**CAPA Note (2026-04-10):** The `user` alias was missing after the auth refactor, causing `ReferenceError: user is not defined` in `repair-stepped-back-siblings`. Always destructure `user` alongside `adminClient`.

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
- **Dynamic Workflow-Mapped Score Columns**: Score columns are built dynamically from the `workflowStages` prop. Each workflow stage maps to its corresponding score column (e.g., `skip_level_check` → "Skip-Level", `hr_pms_review` → "HR PMS", `audit` → "Auditor"). The "Final" column is always appended. If no `workflowStages` prop is provided, falls back to the default 6-stage pipeline columns (Self, Manager, Auditor, Mgmt, Final). This ensures employees with custom workflows (e.g., Self → Manager → Skip-Level → HR PMS → Approved) see only the relevant score columns.
- **Simplified Score Display**: Scores shown as single digit (1-5) without denominator or rating labels
- **Self Column**: Displays the employee's calculated **score** (1-5) from `review_submissions.self_score`, NOT the raw `achieved_value`
- **Final Column**: Displays the final approved score from `review_submissions.final_score`
- **Weightage Column**: Displays each KPI's weightage percentage after the Target column (e.g., "10%"), defaults to 0% if unset
- **Consistent Columns**: Same structure across all views for cross-stage visibility (columns adapt per employee workflow)
- **KPI Text Layout**: The KPI name cell uses `whitespace-pre-wrap` without `flex` layout, ensuring Description/Formula/Scoring Logic sections stack vertically as lines rather than spreading horizontally. The Info icon is absolutely positioned to avoid interfering with text flow.
- **View-Type Actions**: Action buttons adapt based on `viewType` prop ('my-kpis', 'team-review', 'audit', 'management', 'skip-level-review', 'hr-pms-review')
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
- **Team Review (Draft Detection)**: KPIs at `management_review` with a saved `management_score` show an amber **"Draft (Mgmt)"** badge instead of "Reviewed". This helps dual-role users (who are both Manager and Management Reviewer) identify that their management-level approval is still pending — they only saved a draft, not a final approval. The same logic applies to `skip-level-review` and `hr-pms-review` views.
- **Audit Panel**: KPIs forwarded to management show "Forwarded" badge + View icon button  
- **Management Review**: Approved KPIs show "Completed" badge + View icon button
- All badges preserve access to the full KPI review panel for audit trail transparency

**Props:**
```typescript
interface KpiDetailsTableProps {
  kpis: KPI[];
  submissionMap: Map<string, ReviewSubmission>;
  queryMap?: Map<string, KpiQuery[]>;
  viewType: 'my-kpis' | 'team-review' | 'audit' | 'management' | 'skip-level-review' | 'hr-pms-review';
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
  allSubmissions={allSubmissions}   // MUST be all-period submissions, not filtered to current period
  viewLevel="manager"
  selectedPeriod={selectedPeriod}
  selectedYear={selectedYear}
  onOpenFullHistory={() => setTrackerModalOpen(true)}
/>
```

**Important — Data Scoping:**
The `allSubmissions` prop and the `submissions` passed to `KpiTrackerModal` must contain submissions for **all periods** (not just the currently selected period). Scorecard components fetch KPIs for all periods via `useKpisByEmployee`, then filter to the current period for display. A separate `allKpiIds` array (derived from the unfiltered `allKpis`) is used to fetch all-period submissions via a second `useReviewSubmissions(allKpiIds)` call. The current-period `submissions` remain unchanged for scoring and workflow logic.

**N/A Month Handling:**
Both `KpiTrackerModal` and `KpiHistoryCard` check the `is_na` flag on each submission. When a month is marked Not Applicable: the Tracker Modal table shows an amber "N/A" badge in both the Achieved and Rating columns (instead of "-"), and nulls out `achieved`/`target` so the trend chart skips that month. The History Card shows "N/A" text instead of the numeric ratio and excludes N/A entries from the sparkline trend line. This is consistent with the existing `KpiDetailsTable` N/A badge behavior.

**Reviewer-Initiated N/A Marking:**
Any reviewer (Manager, Skip-Level, HR PMS, Auditor, Management) can mark a KPI as "Not Applicable" at their review stage, even if the employee submitted a normal score. This is available via a "Mark as N/A" toggle switch in the review sheet (powered by `NaConfirmationCard` with `canMarkNa` prop). When toggled on:
- Score/achieved-value input fields are hidden (irrelevant for N/A KPIs)
- A mandatory justification textarea appears
- The action button changes to "Mark N/A & Forward" (or "Mark N/A & Approve" for Management)
- On submit: `is_na = true` and `na_marked_by_role = '{role}'` are set on `review_submissions`, the reason is stored in the level's remarks field, the KPI advances to the next workflow stage, and an audit log entry (e.g., `MANAGER_MARKED_NA`, `AUDITOR_MARKED_NA`) is created
- The `na_marked_by_role` column (nullable text on `review_submissions`) tracks which role initiated the N/A, displayed as a badge in `KpiDetailsTable` (e.g., "N/A (Auditor)")
- Dashboard scoring automatically excludes the KPI since it checks `is_na = true`
- Components: `UnifiedScorecard`, `EmployeeScorecard`, `AuditScorecard`, `ManagementScorecard` all support this flow
- **N/A Remarks Resolution:** When displaying the N/A reason in the confirmation card, the system resolves the correct remarks field based on `na_marked_by_role` (e.g., `skip_level` → `skip_level_remarks`, `auditor` → `auditor_remarks`). Falls back to `self_remarks` when `na_marked_by_role` is null or `employee`.
- **Per-Stage N/A Display (Review Journey):** The `KpiJourneySection` computes `isNA` per stage rather than using the global `submission.is_na` flag. A stage shows "N/A" only if the KPI is globally marked N/A AND that stage has no score (`stageIsNA = globalIsNA && stageScore === null`). This ensures that if a manager (or any reviewer) overrides N/A and provides a score, their stage correctly displays the score while the self stage still shows "N/A". The `useSubmitSelfReview` hook always sets `na_marked_by_role: 'employee'` when `is_na` is true, both in the database upsert and the optimistic cache update.

**N/A Override at Any Review Stage:**
When a KPI has been marked as N/A (by any prior stage), subsequent reviewers are NOT forced to accept it. Each reviewer independently decides whether the KPI is truly N/A or deserves a score:
- The `NaConfirmationCard` displays an "Override: This KPI is applicable" toggle switch alongside the existing "Confirm N/A" checkbox
- When the override toggle is activated: the confirm checkbox is hidden, a mandatory justification textarea appears, and standard score input fields (AchievedValueScoreInput, remarks, evidence) become visible in the review sheet
- On submit with override: `is_na` is set to `false`, `na_marked_by_role` is cleared to `null`, the reviewer's score/rating/remarks are submitted normally, and an audit log entry (`{ROLE}_NA_OVERRIDDEN`) is created
- The KPI is immediately re-included in weighted score calculations since the scoring engine checks `submission?.is_na` dynamically
- If the reviewer instead confirms N/A (default), the existing behavior is preserved — the KPI stays excluded from scoring
- Any later stage can also re-mark it as N/A using the existing "Mark as N/A" toggle, or override a previous N/A again — the LAST stage's decision is final
- `KpiDetailsTable` no longer blocks the Review button for N/A KPIs; reviewers can always open the review sheet to choose confirm or override
- Components: `UnifiedScorecard`, `EmployeeScorecard`, `AuditScorecard`, `ManagementScorecard` all support this override flow
- No database schema changes required — `is_na` (boolean) and `na_marked_by_role` (nullable text) columns already exist and are simply toggled

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

#### `textFormatting.ts` - KPI Text Display

- `normalizeKpiText(text)` — Inserts newlines before section markers for clean display. Supports standard (`- Description:`) and non-standard (`Formula -`, `Scoring :-`, `Formula :`) variants. Pure string function used by exports and non-visual contexts.
- `splitKpiTextSegments(text)` — Splits normalized text into `{ text, bold }` segments, marking section markers for bold rendering. Recognizes the same expanded pattern set as `normalizeKpiText`.
- `renderBoldKpiText(text)` (in `FormattedText.tsx`) — Returns React nodes with section markers wrapped in `<strong style="white-space:nowrap">` tags to prevent markers from splitting across lines. Used in all KPI display components (KpiDetailsTable, MobileKpiCard, MobileSelfReviewCard, ReviewDetailsCard, ReviewDetailsCardCompact, KpiHeaderSection, KpiLogicModal, KpiTrackerModal, OrgKpiOverview).
- `FormattedText` component — Renders text with `whitespace-pre-wrap` and optional bold markers (default: enabled).

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

#### 3. Microsoft 365 / Graph API (OAuth2)
- Best for organizations using Outlook / Microsoft 365 where SMTP STARTTLS is required (not supported in edge runtime)
- Uses Microsoft Graph API with OAuth2 client credentials flow — no SMTP connection needed
- **Azure AD Setup**:
  1. Register an app in [Azure Portal → App Registrations](https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RegisteredApps)
  2. Note the **Tenant ID** and **Client ID**
  3. Create a **Client Secret**
  4. Add API Permission: **Microsoft Graph → Application → Mail.Send** and grant admin consent
  5. The "From Address" must be a valid mailbox (user or shared) in the tenant
- Configure in Admin → System Settings → Email tab:
  - **Tenant ID**: Azure AD Tenant ID
  - **Client ID**: Application (client) ID
  - **Client Secret**: Stored securely via "Update Secret" button (same mechanism as SMTP password)
  - **From Address**: Must be a valid Microsoft 365 mailbox
  - **From Name**: Display name for outgoing mail

#### Email Settings in Database

| Setting Key | Description |
|-------------|-------------|
| `email_provider` | `resend`, `smtp`, or `microsoft_graph` |
| `smtp_host` | SMTP server hostname |
| `smtp_port` | SMTP server port (default: 587) |
| `smtp_security` | `tls`, `starttls`, or `none` |
| `smtp_username` | SMTP authentication username |
| `smtp_from_address` | SMTP from email address |
| `smtp_from_name` | SMTP from display name |
| `graph_tenant_id` | Azure AD Tenant ID |
| `graph_client_id` | Azure AD Application Client ID |
| `graph_from_address` | Microsoft 365 mailbox address |
| `graph_from_name` | Graph API from display name |
| `graph_client_secret` | Stored securely in system_settings (admin-only) |

### Edge Functions

| Function | Endpoint | Purpose |
|----------|----------|---------|
| `send-email-notification` | POST | Send transactional emails (Resend, SMTP, or Microsoft Graph) |
| `update-smtp-password` | POST | Securely store SMTP password or Graph client secret |
| `create-employee` | POST | Create new employee accounts |
| `reset-password` | POST | Generate password reset links |
| `auto-rollover-kpis` | POST | Enhanced KRA rollover with conflict detection, dry-run preview, selective employee rollover, balance-only mode, and per-employee detailed reporting. Supports `source_month/year`, `target_month/year`, `employee_ids`, `dry_run`, `rollover_balance_only`, `skip_employee_ids` parameters. The Step 2 Preview dialog uses a fixed-height layout (`h-[85vh]`) with an always-visible scrollbar so all conflict employees are accessible. Action buttons (Back/Proceed, Close/Download) are pinned outside the scroll area for constant visibility. |
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
| **Review Timeline** | Dialog uses `p-4` padding, workflow stages show icons only (labels hidden), timeline cards stack timestamp below content, KRA badge truncated to 150px. ScrollArea wrapped in `flex-1 min-h-0 overflow-hidden` div with `h-full` to ensure Radix scrollbar activates in flex layouts. |

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
5. **Never combine `line-clamp` with `flex` on the same element** - `line-clamp` requires `display: -webkit-box`, but `flex` overrides it to `display: flex`, breaking truncation. Instead, wrap the clamped text in its own element and keep `flex` on a parent container.
6. **Always use `renderBoldKpiText()` and `whitespace-pre-wrap`** for KRA/KPI name fields in mobile cards so that section markers (e.g., "- Description:", "- Formula:") render with bold formatting and proper line breaks.

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

### Employee Import Performance

- **Batch Concurrency**: Employee imports process 5 records concurrently using `Promise.allSettled`, reducing import time from ~5 minutes to ~1 minute for 100 employees.
- **Progress Indicator**: Real-time progress bar shows "Processing X of Y employees..." during import.
- **Reliable Auth User Lookup**: The `create-employee` edge function uses a try-create-catch approach instead of the unreliable `listUsers` filter, preventing admin profile corruption during bulk imports.
- **Admin Profile Protection**: The primary admin account (`535d9a14-...`) is explicitly guarded in the `create-employee` edge function. If an employee_code lookup matches the admin profile, the function skips the update and creates a new user instead. Duplicate-email fallback queries the `profiles` table directly (excluding admin) rather than paginating through `auth.admin.listUsers`.
- **Role Updates on Re-Import**: When re-importing the Employee Master, role changes in the `role` column are now applied to existing employees. If the role column contains a valid role (admin, manager, employee, auditor, management), the system updates the `user_roles` table accordingly — inserting a new role if none exists, or updating the existing role if it differs. Leaving the role column blank will NOT downgrade an existing employee's role (the update is skipped when `row.role` is falsy).

---

### Frequency Cycle Configuration

The system allows administrators to configure when multi-month frequency cycles start (Bi-Monthly, Quarterly, Half-Yearly, Yearly) via **System Settings → Cycles** tab. Individual KPIs can override the global default via the **Cycle Start** field in the KPI create/edit dialogs or the `frequencyCycleStart` column in the import template.

**Available Cycle Options:**

| Frequency | Standard | Financial (Apr) | Mid-Year (Jul) / Offset |
|-----------|----------|-----------------|------------------------|
| **Bi-Monthly** | Jan-Feb, Mar-Apr, May-Jun... (`Jan-Feb`) | — | Feb-Mar, Apr-May, Jun-Jul... (`Feb-Mar`) |
| **Quarterly** | Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec (`Jan-Mar`) | Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar (`Apr-Jun`) | Jul-Sep, Oct-Dec, Jan-Mar, Apr-Jun (`Jul-Sep`) |
| **Half-Yearly** | Jan-Jun, Jul-Dec (`Jan-Jun`) | Apr-Sep, Oct-Mar (`Apr-Sep`) | Jul-Dec, Jan-Jun (`Jul-Dec`) |
| **Yearly** | Jan-Dec (`Jan-Dec`) | Apr-Mar (`Apr-Mar`) | Jul-Jun (`Jul-Jun`) |

**How it works:**
- Each frequency has a row in the `frequency_config` table with `locked_months`, `active_month`, and `sub_frequency` columns (global defaults).
- Individual KPIs can store a `frequency_cycle_start` value to override the global default.
- The resolution priority is: **per-KPI override → global config → hardcoded default**.
- The `isKpiLockedForPeriod()` and related functions in `frequencyUtils.ts` use `resolveEffectiveCycleOption()` from `frequencyCycleOptions.ts` to determine the effective cycle.
- The `FrequencyLockedOverlay` component automatically respects both global and per-KPI cycle settings.

**Per-KPI cycle start values (stored in `kpis.frequency_cycle_start`):**
- Bi-Monthly: `Jan-Feb` or `Feb-Mar`
- Quarterly: `Jan-Mar`, `Apr-Jun`, or `Jul-Sep`
- Half-Yearly: `Jan-Jun`, `Apr-Sep`, or `Jul-Dec`
- Yearly: `Jan-Dec`, `Apr-Mar`, or `Jul-Jun`
- `NULL` = use system default

**Files involved:**
- `src/lib/frequencyCycleOptions.ts` — Shared cycle option constants and resolution logic
- `src/components/admin/FrequencyCycleSettings.tsx` — Admin UI with radio groups per frequency (global defaults)
- `src/components/admin/AdminKpiCreateDialog.tsx` — Per-KPI cycle start dropdown
- `src/components/admin/AdminKpiEditDialog.tsx` — Per-KPI cycle start dropdown
- `src/hooks/useFrequencyConfig.ts` — Fetch and update hooks for `frequency_config` table
- `src/lib/frequencyUtils.ts` — Core logic using `resolveEffectiveCycleOption()` for priority resolution
- `src/components/review/FrequencyLockedOverlay.tsx` — Uses config-driven locking

---

### 4.19 Zero-Score Truthy Bug Fix

**Problem:** JavaScript treats `0` as falsy. Code using `if (value)` instead of `if (value != null)` on score/rating fields silently drops legitimate zero scores.

**Rule:** Always use `!= null` (or `?? 0` / nullish coalescing) when checking score, rating, or achieved-value fields. Never use truthy checks (`if (value)`, `value || default`) on numeric fields that can legitimately be `0`.

**Fixed locations (v1.14.2):**
- `MonthlyScorecardReport.tsx` — weighted score aggregation now uses `!= null` checks
- `import-kpis/index.ts` — `determineReviewStatus()` and `determineKpiStatus()` now use `!= null` checks so `auditRating=0` correctly infers status as `approved`/`locked`
- `ImportData.tsx` — `exportKpiData()` function replaced all `|| ''` with `?? ''` for numeric fields (target, weightage, scores, achieved values)

**Not affected (already correct):**
- Dashboard scoring (`useCumulativeKpis`, `Dashboard.tsx`) — uses `?? 0`
- `EmployeePerformanceSummary.tsx` — uses `??`
- `finalScore || 0` patterns — `0 || 0 = 0`, which is correct

---

### 4.20 Export-Import Column Parity

The `exportKpiData()` function in `ImportData.tsx` now exports **all columns** that the import template expects, enabling full round-trip fidelity (export → edit → re-import). Added columns:

| Column | Source |
|--------|--------|
| `sNo` | Row serial number (auto-generated) |
| `reviewStatus` | `performance_reviews.status` |
| `division` | `profiles → departments → business_units → divisions` |
| `businessUnit` | `profiles → departments → business_units` |
| `department` | `profiles → departments` |
| `subBranch` | `sub_branches` (matched by department_id) |
| `frequencyCycleStart` | `kpis.frequency_cycle_start` |
| `kpiStatus` | `kpis.status` |
| `isOrgLevel` | `kpis.is_org_level` (exported as "Yes" or blank) |
| `employeeTargetAchieved` | `review_submissions.achieved_value` |
| `managerTargetAchieved` | `review_submissions.manager_achieved_value` |
| `auditTargetAchieved` | `review_submissions.auditor_achieved_value` |
| `achievedWeight` | Placeholder (calculated field, exported blank) |
| `rating` | Raw achievement score (1-5): `final_score ?? management_score ?? auditor_score ?? manager_score ?? self_score` |
| `kpiWeightageScore` | Calculated: `rating × (weightage / 100)` |

---

### Access Restrictions

- **PMS Policy page** (`/pms-policy`): Currently restricted to **admin** users only. Non-admin users will not see the sidebar link and will be redirected to `/dashboard` if they navigate to the URL directly.

---

### 4.21 Password Policy & Credential Rollout

**Purpose:** Allows admins to generate secure passwords in bulk for eligible users and optionally email credentials.

**Eligibility Criteria (computed via `eligible_login_users` SQL view):**
- **has_kras** — Users with at least one KPI in the `kpis` table
- **reporting_manager** — Users who are `reporting_manager_id` of employees with KPIs
- **auditor** — Users with the `auditor` role in `user_roles`
- **both** — Users matching both has_kras and reporting_manager criteria

**Database:**
| Table/View | Purpose |
|---|---|
| `eligible_login_users` (view) | Auto-computes eligible users from `profiles` + `kpis` + `user_roles` |
| `password_rollout_logs` | Audit trail for every password generation event |

**Edge Function:** `password-rollout`
- Admin-only (role verified server-side)
- Generates 14-char cryptographically secure passwords (upper, lower, digits, symbols)
- Updates auth via `supabaseAdmin.auth.admin.updateUserById`
- Optionally sends credentials via `send-email-notification` (`password_rollout` event type)
- **Batched parallel processing:** Users are processed in chunks of 5 using `Promise.allSettled` to avoid edge function timeouts on large batches (60+ users). Each user's password generation, auth update, email dispatch, and audit log insert are encapsulated in a `processOneUser` helper.
- Logs each result to `password_rollout_logs` immediately per user (not deferred to end)
- **No plaintext password storage**

**Frontend:**
| File | Purpose |
|---|---|
| `src/components/admin/PasswordPolicyTab.tsx` | Main tab UI: filter bar, user selection table, action bar, confirmation dialog, rollout history |
| `src/hooks/usePasswordRollout.ts` | `useEligibleUsers`, `usePasswordRolloutLogs`, `usePasswordRolloutMutation` hooks |
| `src/pages/admin/SystemSettings.tsx` | 9th tab ("Passwords") added with KeyRound icon |

**Email Template:** `password_rollout` event type with placeholders: `{{recipient_name}}`, `{{login_email}}`, `{{generated_password}}`, `{{app_name}}`

### 8.11 KRA Issuance Confirmation Workflow

KRA assignment and notification are now **decoupled**. When KRAs are assigned via any method (Smart Assign, Bundle Assign, Copy KRAs, Bulk Template Assign), the KPIs are inserted into the database but **no notification email is sent**. Instead:

1. Admin navigates to **Admin KPI Dashboard** (`/admin/all-kpis`)
2. Expands an employee row → sees an **"Issue KRAs"** button and an **Issued / Not Issued** badge
3. Clicking "Issue KRAs" opens the **KRA Issuance Confirmation Dialog** (`KraIssuanceConfirmDialog.tsx`)
4. The dialog displays:
   - A detailed table of ALL assigned KPIs (Category, KRA, KPI, UOM, Target, Weightage, Frequency)
   - **Checkbox selection column** — each row has a checkbox for multi-select; a "Select All" checkbox in the header. Selected count is shown as a badge in the dialog title.
   - **Inline editable weightage inputs** — each KPI's weightage is shown as a compact number input. Admins can adjust values on-the-fly; the total weightage card updates in real-time. Modified fields show a blue dot indicator. Changed weightages are saved to the database on confirmation.
   - A prominent **total weightage indicator** (green = 100%, amber = under, red = over)
   - An "Allow non-100% weightage" override toggle for intentional exceptions
   - A warning banner if KPIs have already been issued (re-issuance)
   - **Action toolbar** with:
     - **"+ Add KRA"** button — opens the full `AdminKpiCreateDialog` pre-filled with the current employee, review period, and year. Employee selector is hidden when pre-filled. On close, the KPI list auto-refreshes.
     - **"Remove Selected (N)"** button (destructive, appears when checkboxes are checked) — shows a confirmation dialog listing KPI names, then permanently deletes the selected KPIs from the database.
5. **Save Draft** — A "Save Draft" button (`variant="secondary"`) in the footer persists weightage overrides to the database **without** issuing or sending notifications. Disabled when no changes are pending. Does not close the dialog.
6. **Unsaved Changes Guard** — If the admin closes the dialog with pending weightage overrides, an alert dialog asks "Discard changes?" before closing.
7. Admin clicks **"Confirm & Issue KRAs"** → any modified weightages are batch-saved, all KPIs are marked `is_issued = true`, and a consolidated notification (in-app + email) is sent to the employee and their reporting manager
8. **Scroll to Top**: After successful issuance, the All KPIs page automatically scrolls to the top for a clean return to the employee list
9. **Persistent Scroll-to-Top Button**: A floating button (bottom-right corner) appears whenever the user scrolls down past 300px, allowing quick return to the top at any time — not just after issuance
10. **Empty State**: When no KPIs exist, a helpful message is shown with a direct "Add KRA" call-to-action.

**Database:** `kpis.is_issued` (boolean, default `false`) — separates "assigned" from "officially issued" states.

**Event Type:** `kra_batch_assigned`

**Email Placeholders:** `{{recipient_name}}`, `{{employee_name}}`, `{{kra_count}}`, `{{kra_table}}` (auto-generated HTML table), `{{total_weightage}}`, `{{review_period}}`, `{{review_year}}`

**Files:**
| File | Purpose |
|---|---|
| `src/lib/kraNotifications.ts` | Shared utility: fetches profiles, inserts notifications, triggers emails |
| `src/components/admin/KraIssuanceConfirmDialog.tsx` | Confirmation dialog with Save Draft, Add KRA, Remove KPI, weightage validation and issue button |
| `src/components/admin/AdminKpiCreateDialog.tsx` | KRA creation dialog; accepts `defaultReviewPeriod` and `defaultReviewYear` props for pre-filling |
| `src/pages/admin/AllKpis.tsx` | "Issue KRAs" button and issued/not-issued badges in expanded employee rows |

---

## 9. Coding Standards

### Zero-Value Preservation

All numeric fields (scores, ratings, achieved values, weightages) **must** use null-safe checks to preserve `0` as a valid value. JavaScript treats `0` as falsy, so the logical OR operator (`||`) silently discards legitimate zeros.

| Pattern | Use Case | Example |
|---------|----------|---------|
| `value ?? defaultValue` | Score fallback chains | `submission?.final_score ?? submission?.manager_score ?? 0` |
| `value != null ? value : '-'` | Display formatting | `achieved_value != null ? achieved_value : '-'` |
| `safeParseFloat(value)` | Parsing user/import input | `safeParseFloat(achievedValue)` (from `@/lib/utils`) |

**Banned patterns for numeric fields:**
- ❌ `value || '-'` — displays "-" when value is 0
- ❌ `value || 0` — masks null vs 0 distinction
- ❌ `parseFloat(v) || null` — converts 0 to null
- ❌ `value?.toString() || ''` — converts 0 to empty string

The `safeParseFloat` utility in `src/lib/utils.ts` correctly returns `null` for empty/invalid input and preserves `0` as a number.

### Auth-Guarded Query Pattern

All React Query hooks fetching RLS-protected data **must** include an `enabled: !!user` guard to prevent race conditions after login. The `useModules()` hook is the canonical example. Additionally, the `AuthContext` invalidates the `['modules']` query cache on login to clear any stale empty results.

---

### Email Logs

The system logs every email sent by the `send-email-notification` edge function into the `email_logs` table. This provides admins with full visibility into what emails were sent, to whom, when, and with what outcome. **All 29 email event types are fully covered with logging**, including:
- Workflow notification emails (KPI submitted, manager approved, query raised, etc.)
- Test emails sent from System Settings (event_type: `test`)
- SMTP connection test emails (event_type: `test`, metadata includes `smtp_test: true`)
- Password rollout emails
- KRA batch assignment emails (sent via `kraNotifications.ts`)
- Observation lifecycle emails (raised, reply, resolved)
- Rollback workflow emails (requested, approved, dismissed)
- Admin step-back emails

Both successful sends and failures are logged for all email types, ensuring complete audit coverage.

**Log Statuses:**
- `sent` — Email delivered successfully
- `failed` — Email send attempt failed (error captured in `error_message`)
- `skipped` — Email not sent because notifications were disabled or the event type was toggled off

**Admin UI:** Available at `/admin/email-logs` (sidebar → Administration → Email Logs). Features:
- Stats cards: Total, Sent, Failed, Skipped, Today's count
- Filters: Search by recipient/subject, filter by event type and status
- Expandable rows: Click any row to see full metadata (review period, KRA count, error details, etc.)

**RLS:** Admin-only SELECT. The edge function inserts via service role key (bypasses RLS). Logging is fire-and-forget — a failed log insert never blocks email delivery.

---

### 4.22 Dynamic Workflow Engine

**File:** `src/lib/workflowEngine.ts`

The workflow engine provides pure utility functions that resolve status transitions dynamically based on an employee's assigned workflow template. This replaces all hardcoded 6-stage pipeline logic.

**Status Convention:** Each status name means "this stage is complete, KPI is waiting for the next reviewer":

| Status | Meaning |
|---|---|
| `self_review` | Employee submitted → waiting for **manager** |
| `manager_check` | Manager checked → waiting for **skip-level** (or auditor in 6-stage) |
| `skip_level_check` | Skip-level checked → waiting for **HR PMS** |
| `hr_pms_review` | HR PMS reviewed → waiting for **auditor** |
| `audit` | Auditor reviewed → waiting for **management** |
| `management_review` | Management reviewed → waiting for **final approval** |

**Critical Pattern:** Each reviewer sees KPIs at the **preceding** stage's status and forwards to their **own** stage:
- Manager sees `self_review` → forwards to `manager_check`
- Skip-level sees `manager_check` → forwards to `skip_level_check`
- HR PMS sees `skip_level_check` → forwards to `hr_pms_review`
- Auditor sees `hr_pms_review` (or `manager_check` in 6-stage) → forwards to next stage after `audit`

**Key Functions:**

| Function | Purpose |
|---|---|
| `resolveNextStatus(current, stages)` | Returns the next status in the employee's workflow |
| `resolvePreviousStatus(current, stages)` | Returns the previous status (for send-back) |
| `resolveSendBackTargets(viewLevel, stages)` | Returns valid send-back options filtered by workflow |
| `resolveSendBackStatus(target, viewLevel, stages)` | Returns the correct status to set when sending back |
| `resolvePendingStatuses(viewLevel, stages)` | Returns statuses a reviewer should see as "pending" — dynamically resolved from preceding stage |
| `resolveForwardStatus(viewLevel, stages)` | Returns the status to set after approval — the reviewer's own stage name |
| `resolveReviewableStatuses(viewLevel, stages)` | Returns which statuses a reviewer can act on — same as pending statuses |
| `getVisibleJourneyStages(stages)` | Returns journey stage keys for UI display |
| `canReviewKpi(status, viewType, stages)` | Determines if a KPI is reviewable — uses dynamic preceding-stage resolution |
| `hasStage(stage, stages)` | Checks if a stage exists in the workflow |

**Workflow Configuration:**
- Templates stored in `workflow_templates` table (e.g., "Full 6-Stage Review", "Full 5-Stage Review")
- Employee assignments stored in `workflow_config` table (by employee, department, or PMS grade)
- Resolved via `useEmployeeWorkflowStages(employeeId)` hook which calls `get_employee_workflow` RPC
- Default fallback: full 6-stage pipeline `['kra_set', 'self_review', 'manager_check', 'audit', 'management_review', 'approved']`

**Example — Skip Manager Workflow:**
- Stages: `['kra_set', 'self_review', 'audit', 'management_review', 'approved']`
- After self-review submission, auditor sees KPI as pending (status `self_review`)
- Auditor's send-back targets exclude "Manager" option
- WorkflowProgressTracker shows 5 cards instead of 6
- KpiJourneySection shows 3 review stages (Self, Auditor, Management)

**Example — 8-Stage Workflow:**
- Stages: `['kra_set', 'self_review', 'manager_check', 'skip_level_check', 'hr_pms_review', 'audit', 'management_review', 'approved']`
- Manager approves → status becomes `manager_check` → skip-level sees it as pending
- Skip-level approves → status becomes `skip_level_check` → HR PMS sees it as pending
- HR PMS approves → status becomes `hr_pms_review` → auditor sees it as pending
- Auditor's send-back targets include HR PMS, Skip-Level, Manager, and Employee

**Components Using Workflow Engine (MUST pass `workflowStages` prop):**
- `UnifiedScorecard.tsx` — Dynamic forward/send-back status resolution; passes `workflowStages={effectiveStages}` to `KpiDetailsTable`, `WorkflowProgressTracker`
- `AuditScorecard.tsx` — Legacy audit page; uses `useEmployeeWorkflowStages` for dynamic transitions, pending counts, send-back targets; passes `workflowStages` to `KpiDetailsTable`, `WorkflowProgressTracker`
- `AuditPanel.tsx` — Legacy audit list; includes `self_review` in pending audit counts for skip-manager workflows

**v1.45.15 — Comprehensive Stage-Absence Guards (all levels, all pipelines):**

Three functions — `resolvePendingStatuses`, `resolveReviewableStatuses`, and `canReviewKpi` — previously had hardcoded fallback values when a reviewer stage was absent from an employee's pipeline. For example, if a pipeline had no `audit` stage, the auditor case would fall back to returning `['manager_check', 'audit']`, causing those employees to incorrectly appear in the Audit panel (root cause of Avinash Kumar appearing in the Audit list). All four reviewer cases now return `[]` / `false` immediately if the stage is absent: `auditor` (guards `audit`), `management` (guards `management_review`), `skip_level` (guards `skip_level_check`), `hr_pms` (guards `hr_pms_review`). 56 unit tests (30 new guard tests) all pass.
- `EmployeeScorecard.tsx` — Dynamic manager approval target status
- `useKpis.ts` (`useApproveKpi`) — Accepts optional `forwardStatus` parameter
- `WorkflowProgressTracker.tsx` — Accepts optional `workflowStages` prop to filter displayed stages. Supports clickable stage cards via `activeFilter`/`onFilterChange` props — wired in all scorecards (UnifiedScorecard, AuditScorecard, ManagementScorecard, EmployeeScorecard) and Dashboard to filter KPI lists by status.
- `KpiJourneySection.tsx` — Accepts optional `workflowStages` prop to filter journey cards
- `KpiDetailsTable.tsx` — Accepts optional `workflowStages` prop; dynamically builds score columns mapped to workflow stages (Self, Manager, Skip-Level, HR PMS, Auditor, Mgmt) + Final. Also uses stages for `canReviewKpi` checks.
- `EmployeeSelectorGrid.tsx` — Uses `useBulkEmployeeWorkflows` hook to batch-fetch per-employee workflow stages, then calls `resolveReviewableStatuses()` for dynamic pending/reviewed filtering and stats. Eliminates all hardcoded status checks.

**⚠️ Critical:** Every component rendering `KpiDetailsTable`, `WorkflowProgressTracker`, or `KpiReviewPanel` MUST pass the `workflowStages` prop. Omitting it causes fallback to the default 6-stage pipeline, which breaks skip-manager workflows.

**Callers passing `workflowStages` (v1.19.0):**
| Caller Component | Passes to |
|---|---|
| `UnifiedScorecard` | `WorkflowProgressTracker`, `KpiDetailsTable`, `KpiReviewPanel` |
| `AuditScorecard` | `WorkflowProgressTracker`, `KpiDetailsTable`, `KpiReviewPanel` |
| `EmployeeScorecard` | `WorkflowProgressTracker`, `KpiDetailsTable`, `KpiReviewPanel` |
| `ManagementScorecard` | `WorkflowProgressTracker`, `KpiDetailsTable`, `KpiReviewPanel` |
| `Dashboard` (self view) | `WorkflowProgressTracker` |
| `KpiTimeline` | Filters internal stage array via optional `workflowStages` prop |

---

### 4.X Custom Workflow Builder

Admins can create, edit, and delete custom workflow templates from the **Templates** tab on the Workflow Configuration page (`/admin/system-settings` → Workflow tab).

**How it works:**
- Click **"Create Custom Template"** to open a dialog.
- Enter a template name and optional description.
- Toggle optional review stages ON/OFF from a fixed-order checklist:
  - **Fixed (always included):** KRA Set, Self Review, Approved
  - **Optional (toggleable):** Manager Review, Skip-Level Review, HR PMS Review, Audit Review, Management Review
- A live arrow-chain preview updates as stages are toggled.
- At least one optional stage must be selected.
- Template names must be unique.

**Edit / Archive / Set as Default:**
- All templates (including the current default) show an Edit (pencil) icon.
- Non-default templates show a **Set as Default** (star) button and an **Archive** (archive) icon.
- Clicking "Set as Default" swaps the `is_default` flag. This **only affects the inherit/fallback cascade** (Employee > Department > PMS Grade > Default). Explicitly assigned workflows are never touched.
- **Archiving** sets `is_active = false` instead of hard-deleting. Archived templates are hidden from assignment dropdowns but preserved for audit history. A collapsible "Archived Templates" section shows them with **Restore** and **Permanently Delete** options.
- **Active KPI safety check**: Before archiving or deleting, the system calls `check_template_has_active_kpis(template_uuid)` — an RPC that checks if any employee whose workflow resolves to this template has non-approved KPIs. If so, the action is blocked with a descriptive error.
- **Permanent deletion** is only available for archived templates that have no active KPIs and no `workflow_config` references.
- The `get_employee_workflow`, `get_employee_workflow_info`, and `get_bulk_employee_workflows` functions all filter by `is_active = true`, so archived templates are automatically excluded from workflow resolution.

**Files:**
- `src/components/admin/CustomWorkflowDialog.tsx` — Dialog component with stage selector
- `src/hooks/useWorkflowConfig.ts` — `useCreateWorkflowTemplate`, `useUpdateWorkflowTemplate`, `useDeleteWorkflowTemplate`, `useSetDefaultWorkflowTemplate`, `useArchiveWorkflowTemplate`, `useRestoreWorkflowTemplate` mutations
- `src/pages/admin/WorkflowConfig.tsx` — Templates tab with create/edit/archive/restore/delete/set-default actions

---

## Codebase Hygiene Log

### 2026-02-14 — Dead Code Deletion (~2,053 lines removed)

**Deleted files (confirmed unreachable — no imports, no active routes):**

| File | Reason |
|---|---|
| `src/pages/SelfReview.tsx` | Replaced by unified `/dashboard` with `SelfReviewSheet` |
| `src/pages/TeamReview.tsx` | Replaced by unified `/dashboard?view=team` |
| `src/pages/ManagementReview.tsx` | Replaced by unified `/dashboard?view=management` |
| `src/pages/AuditPanel.tsx` | Replaced by unified `/dashboard?view=audit` |
| `src/pages/Index.tsx` | Unused fallback page — never routed |
| `tmp/reference/*` (6 files) | Development artifacts — never imported |
| `src/components/ui/use-toast.ts` | Redundant 3-line shim — all consumers use `@/hooks/use-toast` |

**What was NOT changed:**
- All `<Navigate>` redirect routes in `App.tsx` remain intact
- `useReviewPageState.ts` retained (shared hook for unified dashboard)
- `MobileSelfReviewCard.tsx` retained (used by `SelfReviewSheet`)

---

### In-App PMS Policy Document (v1.22.0)

**What changed:**

The PMS Policy page was converted from an external iframe-based viewer to a fully in-app document stored in the database.

**Database:**
- Added `pms_policy_content` (text) column to `app_settings` table
- Seeded with the full 18-section PMS Policy document in markdown format

**Access Control:**
- PMS Policy route (`/pms-policy`) now accessible to all authenticated roles (was admin-only)
- Sidebar entry visible to all roles: admin, manager, employee, auditor, management, hr_pms

**Components Created:**
| Component | Purpose |
|---|---|
| `src/components/policy/PolicyRenderer.tsx` | Parses markdown content and renders as structured HTML with auto-generated Table of Contents sidebar, styled tables, headings, lists, code blocks. **XSS-safe:** All user content is passed through `escapeHtml()` before `dangerouslySetInnerHTML` rendering (added in v1.48.0). |
| `src/components/policy/PolicyEditorDialog.tsx` | Full-screen dialog with textarea for admins to edit policy content |

**Page Behavior:**
- **All roles**: See formatted policy document with clickable Table of Contents
- **Admin only**: "Edit Policy" button opens editor dialog to modify content
- **Fallback**: If only `pms_policy_url` is set (no content), falls back to iframe viewer for backward compatibility

**Files Modified:**
| File | Change |
|---|---|
| `src/pages/PMSPolicy.tsx` | Rewritten to render stored content via PolicyRenderer |
| `src/hooks/useAppSettings.ts` | Added `pms_policy_content` to AppSettings interface and mutation |
| `src/components/layout/AppSidebar.tsx` | PMS Policy roles expanded to all roles |
| `src/App.tsx` | Route allowedRoles expanded to all authenticated roles |

---

### v1.26.0 — Admin Send-Back RLS Fix

**Problem:** Admin users could not successfully send back KPIs because the `kpis` and `review_submissions` tables lacked UPDATE RLS policies for the `admin` role. The update was silently blocked (zero rows affected, no error), so the UI showed stale status.

**Fix:**
1. Added RLS policies: `"Admin can update KPI status"` (kpis UPDATE), `"Admin can update submissions"` (review_submissions UPDATE), `"Admin can insert audit logs"` (kpi_audit_logs INSERT)
2. Added row-count verification in `UnifiedScorecard.tsx` send-back mutation — throws explicit error if zero rows updated

---

### v1.28.1 — Send-Back Data Correction (Tanaaz KPI 9f08d421)

**Problem:** The `resolveSendBackStatus` fix from v1.28.0 was not yet published to the live site. Jaspal's send-back attempts ran the old code, setting the KPI status to `manager_check` (no-op) instead of `self_review`, and leaving manager scores uncleaned.

**Fix:**
1. Manual SQL data correction: set KPI status to `self_review`, cleared `manager_score`, `manager_rating`, `manager_remarks`, `manager_evidence_url`, `manager_achieved_value`, and all `skip_level_*` fields
2. Confirmed audit log ordering is already correct (insert occurs after both KPI and submission updates succeed)
3. **Action required:** Publish latest code to live site so the v1.28.0 logic fix takes effect for all users

---

### v1.28.3 — Approve Button Auto-Activation Fix (RCA/CAPA)

**Problem:** When a reviewer opened a KPI for assessment, the Approve/Forward button stayed disabled even though the Achieved Value was pre-populated from the previous stage. The user had to re-enter the value to activate the button. Additionally, a score of `0` ("Not Achieved") was silently dropped due to falsy coercion.

**Root Cause:**
1. `AchievedValueScoreInput` only calculated scores inside `onChange` — no calculation ran on mount with pre-populated values
2. Score initialization used `||` operator which treats `0` as falsy, discarding legitimate zero scores

**Fix:**
1. Added `useEffect` in `AchievedValueScoreInput.tsx` to auto-calculate score on mount when `achievedValue` is pre-populated but `score` is `null`
2. Replaced `||` with `??` (nullish coalescing) for all score/achievedValue initialization across all scorecards

**Files Modified:**
| File | Change |
|---|---|
| `src/components/review/AchievedValueScoreInput.tsx` | Added auto-calculate `useEffect` on mount |
| `src/components/review/EmployeeScorecard.tsx` | `||` → `??` for `managerScore` and `managerAchievedValue` init |
| `src/components/review/AuditScorecard.tsx` | `||` → `??` for `auditorScore` init and `previousLevelScore` |
| `src/components/review/ManagementScorecard.tsx` | `||` → `??` for `managementScore` init and `previousLevelScore` |
| `src/components/review/UnifiedScorecard.tsx` | `||` → `??` for `prevScore` init |
| `src/hooks/useReviewPageState.ts` | `||` → `??` for `initialScore` init |

---

### Dashboard Score Badge Fix (2026-02-15)

**Problem:** Dashboard and MobileKpiCard rendered score badge colors using the DB-stored `rating_level` string (`ratingColors[rating]`). Historical submissions had `rating_level = 'blue'` for score 4 (a bug in the old `ratingToLevel()` function), causing scores 4 and 5 to display identically as blue.

**Fix:**
1. Replaced `ratingColors[rating]` with `getScoreBadgeClass(score)` in both `Dashboard.tsx` and `MobileKpiCard.tsx` so colors are always derived from the numeric score, not the stored rating level.
2. Corrected historical DB records: updated all `review_submissions` rows where score ≥ 4 and < 5 had `rating = 'blue'` to `'green'` (for self, manager, auditor, management, final, hr_pms, skip_level columns).

| File | Change |
|---|---|
| `src/pages/Dashboard.tsx` | Use `getScoreBadgeClass(score)` instead of `ratingColors[rating]` |
| `src/components/dashboard/MobileKpiCard.tsx` | Same; replaced `ratingColors` prop with internal score derivation |

---

### DB Trigger Email 401 Fix (2026-02-15)

**Problem:** All trigger-based emails (KPI review actions) were failing with HTTP 401. The `send_email_on_notification` trigger constructed an Authorization header using `app.settings.service_role_key`, which was NULL in the database, resulting in `Bearer null`.

**Root Cause:** `current_setting('app.settings.service_role_key', true)` returns NULL in a trigger context, and `request.jwt.claim.sub` is also NULL. The edge function rejected the request.

**Fix:**
1. Updated `send_email_on_notification()` trigger to use the **anon key** (publishable, safe to store) instead of the service role key
2. Stored the anon key in `system_settings` table (key: `supabase_anon_key`) with a hardcoded fallback
3. Updated `send-email-notification` edge function's `validateCaller` to accept the anon key as a valid authorization token (in addition to service role key and user JWTs)

**Important:** The `supabase_anon_key` row in `system_settings` must contain the correct publishable key for trigger-based emails to work. This is a public key and poses no security risk.

**Dual-Header Auth Pattern (v1.30.0):** The `validateCaller` function now checks authentication via multiple paths:
1. **`apikey` header** — checked first against env vars (`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`) and then against the stored key in `system_settings.supabase_anon_key`
2. **`Authorization: Bearer` header** — same check order as above, plus falls back to `supabase.auth.getUser()` for user JWT validation
3. **System settings fallback** — critical for DB triggers where `SUPABASE_ANON_KEY` env var (raw 46-char key) differs from the publishable JWT (208-char token) stored in `system_settings`

This ensures DB triggers using `net.http_post` (which send the 208-char JWT) can authenticate even when edge function env vars contain a shorter raw key format.

| File | Change |
|---|---|
| DB migration | Updated `send_email_on_notification()` to read anon key from `system_settings` and use it in Authorization header |
| `supabase/functions/send-email-notification/index.ts` | Multi-path auth: apikey header + Bearer token + system_settings fallback + user JWT |

---

### N/A Display Fix in KPI Details Table (2026-02-15)

**Problem:** When a reviewer (e.g., skip-level) marked a KPI as N/A, the corresponding score column in the KPI Details Table showed "—" instead of "N/A".

**Root Cause:** `isStageCompleted()` used `statusIdx > stageIdx`. Per workflow convention, a status like `skip_level_check` means that stage is **already completed**. Since `statusIdx === stageIdx`, the strict `>` returned false, preventing the N/A badge from rendering.

**Fix:** Changed to `statusIdx >= stageIdx` in `KpiDetailsTable.tsx` (line 50).

| File | Change |
|---|---|
| `src/components/review/KpiDetailsTable.tsx` | `isStageCompleted`: `>` → `>=` |

---

### Evidence File Download via Blob URLs (v1.36.0)

**Problem:** Browser extensions (ad blockers, privacy tools) block direct navigation to `*.supabase.co` storage URLs, showing `ERR_BLOCKED_BY_CLIENT`.

**Solution:** Created `src/lib/storageDownload.ts` with `openStorageFile()` that downloads files via the SDK's `fetch`-based `.download()` method (not blocked by extensions) and opens the result as a blob URL. Falls back to direct URL on failure.

**Updated Components:**
| Component | Change |
|---|---|
| `src/lib/storageDownload.ts` | New utility — parses storage URL, downloads via SDK, opens blob |
| `ReviewStageCard.tsx` | `<a href>` → `<button onClick={openStorageFile}>` |
| `ReviewTrailCard.tsx` | Same change for all 4 evidence sections |
| `ReviewTrailCardCompact.tsx` | Same change |
| `EvidenceUpload.tsx` | Preview link uses blob download |
| `MultiFileUpload.tsx` | File preview links use blob download |
| `SelfReviewSheet.tsx` | Read-only evidence links use blob download |

---

### Admin-Only Org KPI Management Features (v1.38.0)

**Added three admin-only capabilities to the Org KPI Data Entry page:**

1. **Remove KPI from Org KPI** (admin only): Each non-propagated KPI card shows a "Remove" button that unmarks the KPI as organization-level, deletes associated `org_kpi_values` and `org_kpi_data_owners` records. Propagated KPIs must be rolled back first. Uses `useUnmarkAsOrgLevel` hook in `src/hooks/useMarkAsOrgLevel.ts`.

2. **Restrict bulk actions to admin only**: The "Copy from Last Period", "Export Template", and "Import Excel" buttons are now only visible to admin users. Data owners can still perform individual data entry but cannot use bulk management tools.

**Files changed:** `src/hooks/useMarkAsOrgLevel.ts`, `src/components/admin/OrgKpiEntryCard.tsx`, `src/pages/admin/OrgKpiDataEntry.tsx`

---

### Org KPI Data Entry Overhaul (v1.37.0)

**Problem:** The Org KPI data entry page was a dense flat table with 11 columns, making it overwhelming for designated data entry users. No progress tracking, no bulk import, no audit trail, and per-KPI owner assignment only.

**Solution:** Complete 5-phase overhaul:

**Phase 1 — Card-Based UI + Progress Tracking:**
- Replaced flat table with KPI-focused cards grouped by category
- Each card shows KPI metadata, inline inputs (achieved value, remark, evidence), previous period reference, and status badge (Pending/Entered/Propagated)
- Progress bar at top showing X/Y KPIs entered with per-category breakdown
- Category pill tabs for quick filtering + search bar
- Department/employee-scoped KPIs render as collapsible mini-tables inside cards, filtered to only show departments/employees that have at least one employee mapped to the KPI in the selected period (not all system departments/employees)

**Phase 2 — Copy from Last Period + Auto-Save:**
- "Copy from Last Period" button pre-fills current period with previous period values (only where current is null)
- 2-second debounced auto-save per card with "Saving..."/"Saved" indicators
- Individual "Save" and "Save & Propagate" buttons per card

**Phase 3 — Bulk Excel Import/Export:**
- Export Template: Downloads pre-filled Excel with Category, KRA, KPI, Target, UOM columns
- Import: Upload Excel, validate against known KPIs, preview with valid/error indicators, import valid rows
- Uses existing `xlsx` library

**Phase 4 — Audit Trail:**
- New `org_kpi_data_entry_logs` table tracks every save action (created, updated, imported, copied_from_previous)
- "History" popover on each card shows timeline of value changes with performer names
- RLS: admins, performers, and data owners can view; authenticated users can insert own logs

**Phase 5 — Enhanced Owner Management:**
- New "Data Owners" tab (admin only) on the data entry page
- **Shows ALL org-level KPIs** regardless of employee mapping (uses `useOrgLevelKpis` hook instead of the employee-filtered `useOrgLevelKpisWithEmployees`), so admins can assign data owners even before KPIs are assigned to employees
- Bulk assign: assign a user to ALL KPIs in a category at once
- Per-category collapsible panels showing owner avatars and assignment counts (no nested scroll constraints — all KPIs in a category are fully visible when expanded)
- Uses existing `org_kpi_data_owners` table (no new tables)

| File | Action |
|---|---|
| `src/pages/admin/OrgKpiDataEntry.tsx` | REWRITE: Card layout, progress, copy, import/export, owner tab |
| `src/components/admin/OrgKpiEntryCard.tsx` | NEW: Individual KPI entry card with ref-based auto-save (uses `useRef` to avoid stale closures in debounced saves). Uses a two-column `grid grid-cols-1 md:grid-cols-5` layout (2:3 ratio like KpiReviewPanel): left column shows KPI info (name, KRA, scope, target, UOM, previous value, status badge), right column contains input fields and action buttons. Scoped entry tables span full width below. |
| `src/components/admin/OrgKpiProgressBar.tsx` | NEW: Progress bar with category breakdown |
| `src/components/admin/OrgKpiScopedEntryTable.tsx` | NEW: Collapsible mini-table for dept/employee scope. Department rows show mapped employee first names as muted sub-text below the department name via the `scopeSubText` field on `ScopedRow`. |
| `src/components/admin/OrgKpiAuditLog.tsx` | NEW: History popover timeline |
| `src/components/admin/OrgKpiBulkImport.tsx` | NEW: Excel import dialog with validation |
| `src/components/admin/OrgKpiBulkExport.tsx` | NEW: Excel template export |
| `src/components/admin/OrgKpiOwnerManagement.tsx` | NEW: Bulk owner assignment panel |
| `src/hooks/useOrgKpiAuditLog.ts` | NEW: Hooks for audit log CRUD |
| DB migration | NEW TABLE: `org_kpi_data_entry_logs` with RLS |

---

**Phase 6 — Smart Filtering & Suggestions:**
- **Employee-Mapped Filtering**: Data Entry tab only shows org-level KPIs that have at least one employee record mapped (matching `category_id + kra_name + kpi_name`). Unmapped KPIs are hidden with an info banner showing how many are excluded.
- **Employee Count Badge**: Each KPI card displays an "X employees" badge in the left info column showing how many employees have this KPI assigned.
- **Suggestions Tab**: Admin-only tab with smart prioritization engine that surfaces org-level KPI candidates. Suggestions are categorized and sorted by priority: (1) **Already Org** — KPIs already marked org-level, shown for scope editing; (2) **Matches Org KPI** — non-org KPIs whose KRA+KPI name exactly matches an existing org KPI (no minimum employee threshold); (3) **Similar to Org KPI** — non-org KPIs with 2+ shared significant words with an existing org KPI name (word-level similarity matching, excludes stop words); (4) **3+ Employees** — non-org KPIs shared by 3+ employees. Each suggestion shows a color-coded "Reason" badge. Within each priority tier, items sort by employee count descending. Table shows KRA, KPI, Category, Reason, Employee Count, and action buttons.
- **Mark as Org-Level**: Single-click action opens a confirmation dialog with scope selector (Organization/Department/Employee) and similar KPI detection across categories. KPIs already marked as org-level show an "Edit Scope" button that opens the same dialog in edit mode with the current scope pre-populated, allowing admins to update the scope without navigating away.
- **Bulk Mark**: Multi-select checkboxes in the suggestions table with "Bulk Mark Selected" button to convert multiple KPI groups at once.

| File | Action |
|---|---|
| `src/hooks/useOrgLevelKpis.ts` | MODIFIED: Added `useOrgLevelKpisWithEmployees` hook that filters by employee mapping and returns counts |
| `src/hooks/useOrgKpiSuggestions.ts` | NEW: Queries non-org KPIs grouped by name with employee counts (3+ threshold) |
| `src/hooks/useMarkAsOrgLevel.ts` | NEW: Mutations to bulk-update `is_org_level` flag on matching KPI records |
| `src/components/admin/OrgKpiSuggestionsPanel.tsx` | NEW: Suggestions table with multi-select and bulk actions |
| `src/components/admin/MarkOrgLevelDialog.tsx` | NEW: Confirmation dialog with scope selector and cross-category detection |
| `src/pages/admin/OrgKpiDataEntry.tsx` | MODIFIED: Uses `useOrgLevelKpisWithEmployees`; added Suggestions tab; unmapped KPI info banner |
| `src/components/admin/OrgKpiEntryCard.tsx` | MODIFIED: Added `employeeCount` to `OrgKpiCardData`; displays employee badge |

---

### Post-Propagation Edit Lock (v1.38.0)

**Problem:** After a data owner clicked "Save & Propagate", values were pushed to employee scorecards but the org KPI entry card remained fully editable. No lock prevented further edits, no confirmation was shown before propagation, and the `org_kpi_values.status` column was never set to `'propagated'`.

**Solution:**

1. **Status Update on Propagation**: After successful propagation, `org_kpi_values.status` is set to `'propagated'` for all matching rows. The `org-kpi-values` query cache is invalidated so the UI reflects the new status immediately.

2. **Post-Propagation Edit Lock**: Once a KPI's status is `'propagated'`:
   - **Data owners (non-admin)**: All input fields (achieved value, remarks, evidence) become disabled/read-only. A lock banner displays: "Locked after propagation. Contact admin to unlock." Save and Save & Propagate buttons are hidden.
   - **Admins**: See an "Unlock" button that resets the status to `'entered'`, allowing data owners to edit and re-propagate. Unlock actions are logged in the audit trail.

3. **Confirmation Dialog Before Propagation**: An `AlertDialog` warns: "This will update scores for X employee scorecards. The entry will be locked for editing afterward." Users must click "Confirm & Propagate" to proceed.

**User Experience Flow:**
```
Data Owner clicks "Save & Propagate"
  → Confirmation dialog shows affected employee count + lock warning
  → [Confirm & Propagate]
  → Values propagated → status set to 'propagated' → inputs locked
  → Data Owner sees lock banner with read-only fields
  → Admin clicks "Unlock" → status reset to 'entered' → inputs enabled
```

| File | Action |
|---|---|
| `src/hooks/usePropagateOrgKpiValue.ts` | MODIFIED: Added `org-kpi-values` cache invalidation |
| `src/components/admin/OrgKpiEntryCard.tsx` | MODIFIED: Added `isAdmin`, `onUnlock` props; locked state UI; `AlertDialog` confirmation before propagation; admin unlock button |
| `src/pages/admin/OrgKpiDataEntry.tsx` | MODIFIED: Sets `org_kpi_values.status` to `'propagated'` after propagation; passes `isAdmin` and `onUnlock` handler to cards; unlock resets status to `'entered'` with audit log |

---

### Org KPI + Data Owner Badge for Reviewers (v1.39.0)

**Problem:** Org-level KPIs were only indicated by a tiny scope icon with a tooltip. Reviewers had no clear, at-a-glance indicator that a KPI's data was entered by a designated Data Owner, nor who that person was.

**Solution:** Added visible, colored badges on org-level KPIs across the KPI table, review panels, and mobile cards:

1. **KPI Details Table** (`KpiDetailsTable.tsx`): Below the KRA/KPI name column, org-level KPIs now display:
   - A `secondary` badge: `[Building2 icon] Org KPI — Organization` (or Department/Individual based on scope)
   - An `outline` badge: `Data by: [Owner Name]` when the `entered_by` profile name is available

2. **Review Panel Header** (`KpiHeaderSection.tsx`): When a reviewer opens a KPI for detailed review, a prominent badge row appears below the existing status badges showing the organization KPI scope and data owner name.

3. **Mobile KPI Card** (`MobileKpiCard.tsx`): Compact badge row below the category/status row for org-level KPIs.

4. **Data Source**: The `entered_by` field on `org_kpi_values` (a FK to `profiles`) is joined to retrieve the data owner's `full_name`. The `useOrgKpiValues` hook now includes `entered_by_name` in its return type via a profile join.

5. **Scorecard Integration**: All five scorecard components (`Dashboard.tsx`, `EmployeeScorecard.tsx`, `UnifiedScorecard.tsx`, `AuditScorecard.tsx`, `ManagementScorecard.tsx`) include `entered_by_name` in their `orgKpiValuesMap` and pass it through `getOrgKpiValue` → `KpiReviewPanel` → `KpiHeaderSection`.

| File | Action |
|---|---|
| `src/hooks/useOrgKpiValues.ts` | MODIFIED: Added `entered_by_name` field; joined profiles for entered_by name |
| `src/pages/Dashboard.tsx` | MODIFIED: Include `entered_by_name` in orgKpiValuesMap |
| `src/components/review/EmployeeScorecard.tsx` | MODIFIED: Include `entered_by_name` in orgKpiValuesMap; pass to KpiReviewPanel |
| `src/components/review/UnifiedScorecard.tsx` | MODIFIED: Include `entered_by_name` in orgKpiValuesMap; pass to KpiReviewPanel |
| `src/components/review/AuditScorecard.tsx` | MODIFIED: Include `entered_by_name` in orgKpiValuesMap; pass to KpiReviewPanel |
| `src/components/review/ManagementScorecard.tsx` | MODIFIED: Include `entered_by_name` in orgKpiValuesMap; pass to KpiReviewPanel |
| `src/components/review/KpiReviewPanel.tsx` | MODIFIED: Added `orgKpiEnteredByName` prop, passed to KpiHeaderSection |
| `src/components/review/KpiHeaderSection.tsx` | MODIFIED: Added org KPI badge row with scope and data owner name |
| `src/components/review/KpiDetailsTable.tsx` | MODIFIED: Updated prop type; added org KPI + data owner badges in KRA/KPI column |
| `src/components/review/MobileKpiCard.tsx` | MODIFIED: Updated prop type; added org KPI badge row |

---

### Admin Rollback to Data Entry (v1.40.0)

**Problem:** The existing "Unlock" action only re-enabled editing on the org KPI card but kept the old propagated values in employee scorecards. Admins needed a way to fully reverse propagation — clearing all pushed values from employee scorecards and resetting the org KPI for fresh data entry.

**Solution:**

1. **New Hook: `useRollbackOrgKpiPropagation`** (`src/hooks/useRollbackOrgKpiPropagation.ts`):
   - Finds all employee KPIs matching the org KPI identity (category, KRA, KPI, period, year, `is_org_level = true`)
   - Clears `achieved_value`, `self_score`, `self_rating` from their `review_submissions`
   - Resets KPI status back to `kra_set` (only if currently at `self_review` — won't touch KPIs that have progressed further)
   - Resets `org_kpi_values` status to `pending` and clears achieved value, remarks, and evidence
   - Logs the rollback in `org_kpi_data_entry_logs` with the admin's identity and mandatory reason
   - Notifies data owners via the notifications table

2. **UI: Rollback Button on `OrgKpiEntryCard`**:
   - Visible only to admins when status is `propagated`, alongside the existing "Unlock" button
   - Uses `RotateCcw` icon with destructive styling to distinguish from Unlock
   - Confirmation dialog warns: "This will clear propagated values from X employee scorecards and reset this KPI for fresh data entry. This action cannot be undone."
   - **Mandatory reason field** (textarea) — the Confirm button is disabled until a reason is entered

| Comparison | Unlock | Rollback to Data Entry |
|---|---|---|
| Org KPI status | → `entered` | → `pending` |
| Org KPI values | Kept | Cleared (value, remarks, evidence) |
| Employee review_submissions | Kept | Cleared (achieved_value, self_score, self_rating) |
| Employee KPI status | Unchanged | Reset to `kra_set` (if at `self_review`) |
| Use case | Minor correction | Full re-entry from scratch |

**User Experience Flow:**
```
Admin clicks "Rollback" on propagated card
  → Confirmation dialog shows affected employee count + warning
  → Admin enters mandatory reason
  → [Confirm Rollback]
  → Employee submissions cleared → KPI statuses reset → org values cleared
  → Card resets to "Pending" state → data owner can re-enter from scratch
  → Data owners receive notification about the rollback
```

| File | Action |
|---|---|
| `src/hooks/useRollbackOrgKpiPropagation.ts` | CREATED: New mutation hook for full rollback |
| `src/components/admin/OrgKpiEntryCard.tsx` | MODIFIED: Added `onRollback` prop; rollback button with confirmation dialog and mandatory reason |
| `src/pages/admin/OrgKpiDataEntry.tsx` | MODIFIED: Imported rollback hook; wired `onRollback` handler to each card |

---

### Org KPI Data Entry Fixes (v1.36.0)

**Three issues fixed:**

1. **Propagation unique constraint error**: Replaced non-atomic check-then-insert pattern in `usePropagateOrgKpiValue.ts` with Supabase `.upsert({ onConflict: 'kpi_id' })`. Prevents "duplicate key value violates unique constraint review_submissions_kpi_id_unique" errors during concurrent or repeated propagations.

2. **Frequency-based filtering**: Bi-Monthly, Quarterly, Half-Yearly, and Yearly KPIs are now hidden from the Org KPI Data Entry page when the selected month is not their active/due month. Uses `isKpiLockedForPeriod` from `frequencyUtils.ts`. Progress counts and category pills also reflect frequency-filtered results.

3. **Clipboard paste hint**: Added "or Ctrl+V" hint text next to the Upload button in `OrgKpiFileUpload` to make the existing clipboard paste feature discoverable.

| File | Change |
|---|---|
| `src/hooks/usePropagateOrgKpiValue.ts` | Both single and bulk propagation now use atomic upsert |
| `src/pages/admin/OrgKpiDataEntry.tsx` | Added `frequencyFilteredKpis` memo; all counts/filters use it |
| `src/components/admin/OrgKpiFileUpload.tsx` | Added "or Ctrl+V" hint span |

---

### Bug Fix: Forward Button Not Activating for Daily KPI at Reviewer Level

**Problem:** At skip-level and HR PMS review stages, the Forward/Submit button remained disabled until the reviewer deleted and re-entered the achieved value. This was caused by incorrect score initialization in `openReviewSheet` — the fallback branch read `management_score ?? auditor_score`, which are always `null` at those stages.

**Fix:**
1. Replaced hardcoded if/else score initialization with a per-level lookup map (`scoreFieldMap`) that correctly resolves: `skip_level` → `skip_level_score ?? manager_score`, `hr_pms` → `hr_pms_score ?? skip_level_score`.
2. Made auto-calculate-on-mount in `AchievedValueScoreInput` more robust by deferring the calculation via microtask to avoid React state batching timing issues.

| File | Change |
|---|---|
| `src/components/review/UnifiedScorecard.tsx` | Per-level score initialization via `scoreFieldMap` |
| `src/components/review/AchievedValueScoreInput.tsx` | Microtask-deferred auto-calculate on mount |

---

### Bug Fix: Performance by Category Chart Not Updating with Status Filter

**Problem:** In all reviewer dashboards (Team/Manager, Audit, Management, Employee), clicking a workflow stage in the WorkflowProgressTracker (e.g., "KRA Set", "Self Review") correctly filtered the KPI table but did NOT update the Performance by Category chart or Overall Score donut. The charts always showed data for all KPIs regardless of filter state.

**Root Cause:** The `scoreData` useMemo in each scorecard computed category scores from the raw unfiltered `kpis` array. The `statusFilter` was only applied to the KPI table/list rendering, not to the scoring calculations.

**Fix:** Added a `displayKpis` memoized variable in each scorecard that filters KPIs by the active `statusFilter`. Updated `scoreData` to iterate over `displayKpis` instead of raw `kpis`, so both the category chart and overall score donut dynamically reflect the selected workflow stage. The `WorkflowProgressTracker` still receives the full unfiltered `kpis` array to keep stage count badges accurate.

| File | Change |
|---|---|
| `src/components/review/UnifiedScorecard.tsx` | Added `displayKpis` memo; `scoreData` uses `displayKpis` |
| `src/components/review/AuditScorecard.tsx` | Same pattern |
| `src/components/review/ManagementScorecard.tsx` | Same pattern |
| `src/components/review/EmployeeScorecard.tsx` | Same pattern |

---

**v1.45.30 — Inbox Access CAPA: hr_pms and skip_level Full Fix**

All Inbox access gaps for `hr_pms` and `skip_level` roles have been closed:

- `src/lib/roles.ts` (new) — Single source of truth for `ALL_APP_ROLES` and `AppRole` type. `skip_level` now officially recognized as a frontend role.
- `src/contexts/AuthContext.tsx` — Imports `AppRole` from centralized `roles.ts`.
- `src/components/layout/ProtectedRoute.tsx` — Imports `AppRole` from centralized `roles.ts`.
- `src/components/layout/AppSidebar.tsx` — Added `hr_pms` and `skip_level` to Inbox and My Dashboard menu item roles. Manager section (Team Reviews) now also visible to `skip_level` users.
- `src/App.tsx` — Added `skip_level` to `/profile` and `/pms-policy` ProtectedRoute `allowedRoles` arrays.
- `src/hooks/useQueryWorkflow.ts` — `useSubordinateQueries` now fetches both direct reports and skip-level (indirect) subordinates so the Team tab shows the full reporting chain for skip-level managers.

**Preventive Action:** `src/lib/roles.ts` is the single file to update when a new database role is added. All downstream files import from it.

---

### Bug Fix: Step Back Dialog Not Using Employee's Actual Workflow Stages (v1.45.59)

**Problem:** The `AdminStatusStepBackDialog` called `getPreviousStatus(currentStatus)` without passing the employee's actual workflow stages. It always resolved against the full 8-stage pipeline, which could target a non-existent stage (e.g., `hr_pms_review` for an employee whose workflow skips that stage), orphaning the KPI.

**Fix:** The dialog now fetches the employee's actual workflow stages via the `get_employee_workflow` RPC and passes them to `getPreviousStatus(currentStatus, workflowStages)`. Also accepts an optional `workflowStages` prop for callers that already have the data.

| File | Change |
|---|---|
| `src/components/admin/AdminStatusStepBackDialog.tsx` | Fetch employee workflow via RPC; pass stages to `getPreviousStatus` |

---

### Feature: Daily/Weekly KPI Evidence Upload (v1.45.76)

**Summary:** Employees can now upload supporting evidence (JPEG, PNG, PDF, Excel — up to 5 files) for each daily or weekly KPI submission. Uploaded documents are visible to all reviewer levels (Manager, Skip-Level, HR PMS, Auditor, Management) in the Daily Submission Summary table via a paperclip icon with file count badge.

| File | Change |
|---|---|
| `sub_period_submissions` (migration) | Added `evidence_urls JSONB DEFAULT '[]'` column |
| `src/hooks/useSubPeriodSubmissions.ts` | Added `evidence_urls` to interface and mutation; syncs legacy `evidence_url` column |
| `src/components/review/DailySubmissionGrid.tsx` | Integrated `MultiFileUpload` in edit mode; shows paperclip badge on submitted rows |
| `src/components/review/WeeklySubmissionTable.tsx` | Same treatment as daily grid for consistency |
| `src/components/review/DailySubmissionSummary.tsx` | Added "Files" column with clickable paperclip icon + count badge |

---

### Feature: Org KPI Rating Override Warning (v1.45.83)

**Summary:** When a reviewer (Manager, Auditor, Skip-Level, HR PMS, or Management) changes the rating of an Organization KPI that was originally propagated by a Data Owner, a warning AlertDialog appears before submission. The dialog displays the original rating, the data owner's name, and the proposed new rating, requiring explicit confirmation to proceed. This ensures reviewers are consciously aware they are overriding a centrally-entered score.

| File | Change |
|---|---|
| `src/components/review/OrgKpiRatingOverrideWarning.tsx` | **New** — Reusable AlertDialog warning component |
| `src/components/review/UnifiedScorecard.tsx` | Added override detection before submit; shows warning dialog for org-level KPIs with score mismatch |
| `src/components/review/ManagementScorecard.tsx` | Same override detection pattern for management review |
| `src/components/review/AuditScorecard.tsx` | Same override detection pattern for audit review |

---

### Feature: Workflow Bottleneck Report (v1.45.84)

**Summary:** A new report page (`/reports/bottleneck`) that answers "Where is it stuck?" — showing all non-approved KPIs grouped by workflow stage, the responsible reviewer, and color-coded days pending (Green ≤7d, Amber 8–14d, Red 15+d). Includes summary stat cards, a horizontal stacked bar chart by department, comprehensive filters (year, period, department, division, BU, stage, search), a paginated detail table, and Excel export.

| File | Change |
|---|---|
| `src/hooks/useBottleneckReport.ts` | **New** — Data hook with filtering, pagination, chart data, and stage mapping |
| `src/pages/reports/BottleneckReport.tsx` | **New** — Full report page with cards, chart, filters, table, and export |
| `src/App.tsx` | Added lazy import and `/reports/bottleneck` route |
| `src/pages/reports/ReportsHub.tsx` | Added Workflow Bottleneck Report card |

---

### Enhancement: Workflow Bottleneck Report v2 (v1.45.85)

**Summary:** Enhanced the bottleneck report with three new analytical dimensions: (1) **Urgency Distribution** donut chart showing Green/Amber/Red zone counts, (2) **Top Bottleneck Holders** table aggregating pending KPIs per responsible person sorted by critical (15+d) count, (3) **Expanded Summary Cards** (7 clickable cards including Skip-Level, HR PMS, and Not-Issued) that auto-filter the detail table. Also added "Not Issued" vs "KRA Set" distinction using `is_issued` flag, critical row highlighting (red tint for 15+d rows), and `responsibleRole` field for clearer accountability.

| File | Change |
|---|---|
| `src/hooks/useBottleneckReport.ts` | Added `not_issued` stage, `urgencyStats`, `topHolders`, `responsibleRole`; expanded stats |
| `src/pages/reports/BottleneckReport.tsx` | 7 clickable summary cards, urgency donut chart, top holders table, critical row highlights, Not Issued badge |

---

### Fix: Dashboard Inflated Counts from Non-Issued KPIs (v1.45.94) — REVERTED in v1.45.95

**Summary:** This change was reverted. The `is_issued` column defaults to `false` in the database and was only set to `true` for 18/83 employees. The filter removed 77% of KPIs and made 65 employees invisible on the dashboard.

---

### Revert: Remove Incorrect is_issued Filter (v1.45.95)

**Summary:** Removed the `is_issued !== false` filter from all four dashboard components and the Bottleneck Report hook. The `is_issued` flag defaults to `false` and is NOT a reliable indicator of draft vs. active KPIs — it must not be used for filtering without first running a data migration to set `is_issued = true` for all legitimate KPIs.

**WARNING:** Do NOT re-apply `is_issued` filtering without first ensuring all legitimate KPIs have the flag set correctly via a database migration.

| File | Change |
|---|---|
| `src/components/review/EmployeeSelectorGrid.tsx` | Removed `issuedPeriodKpis` filter, reverted to direct `periodKpis` |
| `src/components/review/AuditScorecard.tsx` | Removed `is_issued !== false` from KPI filter |
| `src/components/review/UnifiedScorecard.tsx` | Removed `is_issued !== false` from KPI filter |
| `src/components/review/ManagementScorecard.tsx` | Removed `is_issued !== false` from KPI filter |
| `src/hooks/useBottleneckReport.ts` | Removed `is_issued !== false` from both filter calls |

---

### Mention-Based Read-Only KPI Access (v1.47.0)

**Summary:** When a user is @mentioned in an observation (title, description, or reply), they automatically receive read-only access to that specific KPI and its public observations. This is implemented via the `kpi_mention_access` junction table and additive SELECT policies on `kpis`, `kpi_observations`, and `kpi_observation_replies`.

| File | Change |
|---|---|
| DB migration | Created `kpi_mention_access` table with RLS + additive SELECT policies on `kpis`, `kpi_observations`, `kpi_observation_replies` |
| `src/hooks/useKpiObservations.ts` | Upserts `kpi_mention_access` rows when creating observations with mentions |
| `src/hooks/useObservationReplies.ts` | Upserts `kpi_mention_access` rows when creating replies with mentions |
| `docs/rls-policies.md` | Documented new `kpi_mention_access` table and three additive SELECT policies |

**Security:** Access is read-only (SELECT only), scoped to a single KPI, and observations are restricted to `visibility = 'public'`. The `granted_by` and `created_at` columns provide an audit trail. Admins can revoke access by deleting rows from `kpi_mention_access`.

---

### Bug Bounty Audit Fixes & Frequency Lock Correction (v1.48.0)

**Summary:** Comprehensive security/quality audit (BUG-001 through BUG-009) plus a data correction for frequency-locked KPIs.

**Bug Bounty Fixes:**

| Bug ID | File | Change |
|---|---|---|
| BUG-001 | `src/pages/admin/UserManagement.tsx` | Imported canonical `AppRole` from `@/lib/roles`; added `hr_pms` and `skip_level` role support (colors, filter dropdown, assignment). DB migration added `skip_level` to `app_role` enum. All 7 roles now fully supported. |
| BUG-002 | `src/pages/admin/UserManagement.tsx` | Added email regex validation and whitespace trimming to `handleCreateUser` |
| BUG-003 | `src/components/policy/PolicyRenderer.tsx` | Added `escapeHtml()` sanitization before `dangerouslySetInnerHTML` rendering to prevent XSS |
| BUG-004 | `src/components/review/SendBackDialog.tsx` | Added `maxLength={2000}` with character counter on reason textarea |
| BUG-005 | `src/components/admin/TieredOptionsBuilder.tsx` | Replaced array-index React keys with stable composite keys (`rating-label`) |
| BUG-007 | `src/pages/admin/UserManagement.tsx` | Pagination resets to page 1 on filter/search change |
| BUG-006 | `src/pages/QueryInbox.tsx` | Replaced local `useMemo` unread count with server-side `useUnreadNotificationCount()` hook for accurate count across all pages |
| BUG-009 | `src/pages/Dashboard.tsx` | Lazy-loads `allSubmissions` query — only fetches when KPI review panel is open (`selectedKpiReview ? allKpiIds : []`) |

**Tests:** Created `src/test/bugBountyFixes.test.ts` with 11 regression tests covering email validation, HTML escaping, send-back length limits, tiered key stability, and more.

**Frequency Lock Data Correction:**

| File | Change |
|---|---|
| DB migration | Corrected `review_period` for quarterly/bi-monthly KPIs stuck on locked months |
| `supabase/functions/import-kpis/index.ts` | Added `resolveToActiveMonth` logic to auto-resolve multi-month frequency periods to the cycle's active terminal month |
| `src/components/admin/AdminKpiCreateDialog.tsx` | Same `resolveToActiveMonth` logic applied at KPI creation time |
| DB trigger | Enhanced `enforce_frequency_lock` trigger to block INSERT of KPIs with locked-month `review_period` for non-admin users |

---

### Effective Month Selector in Assignment Dialogs (v1.49.0)

**Problem:** All three KRA assignment dialogs (`SmartAssignmentDialog`, `BundleAssignDialog`, `BulkTemplateAssignDialog`) derived `review_period` from a non-existent `current_review_period` system setting, defaulting to "January". KPIs were inserted successfully but were invisible in the current month's view.

**Solution:**

| File | Change |
|---|---|
| `src/components/admin/EffectiveMonthSelector.tsx` | New shared component — compact month/year selector defaulting to current calendar month |
| `src/components/admin/SmartAssignmentDialog.tsx` | Removed `useSystemSettings` lookup; added `EffectiveMonthSelector`; applies `getActiveMonthForCycle` per-template before insert |
| `src/components/admin/BundleAssignDialog.tsx` | Same — removed broken `system_settings` lookup, added selector and frequency resolution |
| `src/components/admin/BulkTemplateAssignDialog.tsx` | Same — removed broken `system_settings` lookup, added selector and frequency resolution |

**Frequency Auto-Resolution:** For multi-month KPIs (Quarterly, Bi-Monthly, etc.), the selected month is auto-resolved to the cycle's terminal month via `getActiveMonthForCycle` before insert, preventing DB trigger rejections.

**Admin UX — Multi-month KPI Cycle Banner (v2.x, 2026-04-29):** When the selected frequency is Bi-Monthly, Quarterly, Half-Yearly, or Yearly, the create/edit dialog now renders a richer banner that lists the **full cycle months** (e.g. *"Quarterly cycle covers April, May, June 2026"*) and the **review anchor month** (*"Reviewed once in June 2026 (cycle end); the approved score auto-applies to all months in the cycle"*). An info tooltip explains the percolation contract (POLICY §54 v3) so the cycle-end anchor is not perceived as a defect. Cycle math is provided by the pure helper `buildCycleScopeLabel()` in `src/lib/frequencyUtils.ts` (year-wrap aware, e.g. Quarterly Nov 2026 → anchor Jan 2027). Tests: `src/test/multiMonthBannerCopy.test.ts`.

---

### 4.23 Review Period Governance System (v1.51.0)

**Route:** `/admin/review-periods`

The Review Period Governance System provides centralized control over the review lifecycle with a three-layer enforcement architecture.

#### Three-Layer Architecture

| Layer | Scope | Mechanism | Purpose |
|-------|-------|-----------|---------|
| **RLS (Row Level Security)** | Database | PostgreSQL policies | Prevents unauthorized data access at the database level |
| **Workflow Engine** | Status transitions | `workflowEngine.ts` | Controls valid KPI status transitions (e.g., `self_review` → `manager_check`) |
| **Governance** | UI permission gating | `useReviewPeriodPermissions` hook | Controls what actions users can perform during a review period (edit, submit, approve) |

These layers are independent and complementary — RLS secures data access, Workflow controls status flow, and Governance gates UI actions based on admin-configured locks.

#### Lock Hierarchy

Locks are resolved in **most-specific-wins** order via the `check_review_period_permission` RPC:

```
Employee Lock (most specific) > Department Lock > Role Lock > Global Lock (broadest)
```

If an employee-level lock exists, it overrides any department, role, or global lock. If no employee lock exists, the system checks department, then role, then global. If no locks exist at all, all actions are permitted (fail-open).

#### 7-Tab Governance Center

| Tab | Component | Purpose |
|-----|-----------|---------|
| **Overview** | `ReviewPeriodOverview.tsx` | Period summary, current stage, completion percentage |
| **Stage Control** | `ReviewPeriodStageController.tsx` | Advance/revert lifecycle stages (Planning → Self Review → Manager Review → Calibration → Approval → Closed) |
| **Role Permissions** | `ReviewPeriodRolePermissions.tsx` | Matrix of 7 permissions × 7 roles. Admin role always has full access. A role is "Restricted" if any operational permission is disabled or `view_only` is enabled |
| **Department Locks** | `ReviewPeriodDepartmentLocks.tsx` | Per-department lock/unlock with granular permissions |
| **Employee Locks** | `ReviewPeriodEmployeeLocks.tsx` | Per-employee lock/unlock with granular permissions |
| **Auto Rules** | `ReviewPeriodAutoRules.tsx` | Configure event-driven auto-lock rules |
| **Audit Log** | `ReviewPeriodAuditLog.tsx` | Immutable trail of all governance actions |

#### Permission Keys

| Key | Label | Description |
|-----|-------|-------------|
| `edit_kpi` | Edit KPI | Modify KPI definitions |
| `submit_self_review` | Self Review | Submit self-assessment |
| `submit_manager_review` | Manager Review | Submit manager evaluation |
| `approve` | Approve | Approve/forward KPIs |
| `edit_scores` | Edit Scores | Modify achieved values and ratings |
| `add_comments` | Comments | Add remarks and observations |
| `view_only` | View Only | Read-only mode (overrides all above) |

#### Auto-Lock Rules

Four configurable rule types, managed per review period:

| Rule Type | Trigger | Scope | Behavior |
|-----------|---------|-------|----------|
| `deadline_passed` | Self-review stage active > `deadline_days` | Global | Checks `review_period_stages.started_at` for the `self_review` stage. If elapsed days exceed `deadline_days`, applies a global lock. Only triggers when `current_stage = 'self_review'`. |
| `review_submitted` | All employee KPIs past self-review | Per-employee | Groups KPIs by employee. If all statuses are `manager_check` or later, auto-locks that employee with `view_only` + `add_comments` permissions. |
| `approval_complete` | All employee KPIs approved | Per-employee | Groups KPIs by employee. If all statuses are `approved`, creates an employee-level lock. |
| `calibration_complete` | Stage advances past calibration | Global | Triggers when `current_stage` is `approval` or `closed`. |

#### Enforcement Hook

**File:** `src/hooks/useReviewPeriodPermissions.ts`

The `useReviewPeriodPermissions(periodName, reviewYear)` hook is the central enforcement point. It calls `check_review_period_permission` RPC for all 7 permission keys in parallel and returns a `ReviewPeriodPermissions` object consumed by:

| Component | What it gates |
|-----------|---------------|
| `SelfReviewSheet.tsx` | Self-review submission |
| `EmployeeScorecard.tsx` | Score editing, manager review submission |
| `ManagementScorecard.tsx` | Management approval |
| `AuditScorecard.tsx` | Audit forwarding |
| `KpiHeaderSection.tsx` | KPI edit actions |
| `GovernanceLockBanner.tsx` | Contextual warning banner showing restricted actions |

**Caching:** Results are cached for 30 seconds (`staleTime: 30_000`) to avoid excessive RPC calls. **Fail-open:** If any RPC call fails, that permission defaults to `true` (allowed).

#### GovernanceLockBanner Component

**File:** `src/components/review/GovernanceLockBanner.tsx`

Displays contextual banners based on permission state:
- **View-only mode:** Red destructive alert — "This review period is in view-only mode. No changes can be made."
- **Partial restrictions:** Yellow warning alert — lists specific disabled actions (e.g., "score editing, approval disabled by governance policy")
- **No restrictions:** Banner is hidden

#### Edge Function: auto-lock-review-periods

**File:** `supabase/functions/auto-lock-review-periods/index.ts`

A cron-invoked edge function that evaluates all active `review_period_auto_rules` and creates locks when conditions are met:

1. Fetches all active rules with their associated review periods
2. Evaluates each rule based on `rule_type` and `trigger_condition`
3. Creates `review_period_locks` entries for triggered rules (if not already locked)
4. Logs all actions to `review_period_audit_log`
5. Returns summary: `{ locksCreated, auditEntries, rulesEvaluated }`

**Security:** Validates `x-cron-secret` header. Uses service role key for database access.

#### Dashboard Widget: ReviewPeriodStatusWidget

**File:** `src/components/management/ReviewPeriodStatusWidget.tsx`

Displayed on the Management Dashboard, showing the current review period's governance status including stage, completion percentage, and lock summary.

#### Governance Hook

**File:** `src/hooks/useReviewPeriodGovernance.ts`

Admin-facing hook for managing locks, stages, and audit log. Provides:
- `locks` — all locks for the selected period
- `stageHistory` — stage lifecycle records
- `auditLog` — last 100 audit entries
- `advanceStage(newStage, reason)` — transition to next stage with audit trail
- `upsertLock(lock)` — create or update a lock with audit trail
- `deleteLock(lockId)` — remove a lock with audit trail

---

### Review Period Governance — `deadline_days` UI Fix (v1.51.0)

**Problem:** The `deadline_days` field in the Auto Rules tab used a generic `<Input>` element that was hard to discover and didn't validate input. The trigger condition JSON structure was not surfaced clearly in the UI.

**Fix:** Added a dedicated numeric input field with label "Days after stage starts" that maps directly to `trigger_condition.deadline_days`. Only shown when `rule_type = 'deadline_passed'`. Validates minimum value of 1.

---

### Governance Bypass Exceptions (v1.53.0)

The `SelfReviewSheet` implements two governance bypass exceptions where employees can edit KPIs even when their role's governance permissions (`submit_self_review`, `edit_kpi`) are disabled:

| Exception | Condition | Detection | UI |
|-----------|-----------|-----------|-----|
| **Sent-Back KPI** | `status === 'kra_set'` AND prior submission exists | `isSentBack = isKraSet && submissionMap.has(kpi.id)` | Amber banner: "This KPI was sent back for revision" |
| **Daily-Frequency KPI** | `status === 'kra_set'` AND `frequency === 'daily'` | `isDailyUnlocked = isKraSet && frequency === 'daily'` | Blue banner: "Daily data entry is permitted" |

Both exceptions set `isGovernanceLocked = false`, allowing the employee to enter data and submit. Security is maintained via RLS (employees can only edit their own KPIs).

---

### Pending Self-Reviews Admin Page

**Route:** `/admin/pending-reviews`  
**Files:** `src/pages/admin/PendingSelfReviews.tsx`, `src/hooks/usePendingSelfReviews.ts`

Admin-only page with two tabs for managing overdue KPIs:

**Tab 1 — Pending Self-Review (status = `kra_set`):**
- Lists KPIs where `status = kra_set`, `is_org_level = false`, frequency is Monthly/Daily/Weekly, past the configurable deadline day of the following month
- Bulk "Auto-Score" sets `final_score = 0`, `final_rating = red`, `status = approved` with a configurable system remark
- Inserts `kpi_audit_logs` with action `SYSTEM_AUTO_SCORED`

**Tab 2 — Pending Manager Review (status = `manager_check`):**
- Lists KPIs where `status = manager_check` (same exclusions as Tab 1)
- "Penalize Managers" finds the reporting manager's and skip-level manager's KPI with `kra_name = 'Implementation of common - policies / systems / processes'` for the same period
- Sets that penalty KPI to `final_score = 0`, `status = approved` with a configurable manager remark
- Inserts `kpi_audit_logs` with action `MANAGER_PENALTY_SCORED`

**Configurable Settings (system_settings table):**
- `pending_review_deadline_day` — default 10 (admin can change)
- `pending_review_auto_remark` — default "KPI not self reviewed by due date, score given by system"
- `manager_penalty_auto_remark` — default "KRA of team not reviewed by due date"

---

### Push to Next Level (System Forward)

Administrators can push pending KPIs to any subsequent workflow level without assigning a score. This is available on all three pending tabs (Self-Review, Manager Review, Skip-Level Review) via a "Forward To" dropdown and "Push Selected"/"Push All" buttons.

**Behavior:**
- Updates `kpis.status` to the chosen target level
- Sets `review_submissions.auto_advance_reason` to `"System-forwarded to {target} (skipped {current} review)"` — no scores are assigned
- Logs `SYSTEM_FORWARDED` action in `kpi_audit_logs`
- On employee dashboards, system-forwarded KPIs display a golden `FastForward` icon (distinct from the orange `Zap` for auto-scored KPIs)

**Target options per tab:**
- **Pending Self-Review**: Manager, Skip Manager, HR PMS, Audit, Management
- **Pending Manager Review**: Skip Manager, HR PMS, Audit, Management
- **Pending Skip-Level**: HR PMS, Audit, Management

### 4.XX.6 Workflow-Aware Pending Tab Filtering

The "Pending Manager Review" and "Pending Skip-Level Review" tabs now filter KPIs by the employee's actual workflow stages (fetched via `get_employee_workflow` RPC). A KPI at `self_review` status only appears in the Manager tab if `manager_check` is the immediate next stage in that employee's workflow. Similarly, a KPI at `manager_check` only appears in the Skip-Level tab if `skip_level_check` follows. This prevents employees with shorter workflows (e.g., `self_review → audit`) from incorrectly appearing in the Manager tab.

The "Pending With" column displays a static badge per tab (`Employee`, `Manager`, `Skip-Level Manager`) since all KPIs in a given tab are guaranteed to be pending at that level after filtering.

---

### 4.XX.7 Auto-Advance Zero — Sent-Back KPI Exclusion

The `auto_advance_zero` rule in `auto-lock-review-periods` edge function now excludes KPIs that were sent back by any reviewer. Detection checks **both** sources:

1. `kpi_queries` where `query_type = 'send_back'` — covers manager/employee send-backs
2. `kpi_audit_logs` where `action ILIKE '%SENT_BACK%'` — covers auditor, HR PMS, skip-level, and management send-backs

KPIs matching either source are excluded from auto-scoring, preventing false zero penalties on KPIs legitimately under revision.

**Rollback History:**
- 2026-03-23: Rolled back 16 KPIs across 8 employees (100012, 100426, 100840, 100856, 101680, 101773, 101902) that were incorrectly auto-scored zero despite being sent-back cases. Root cause: initial rollback only checked `kpi_queries`, missing auditor/management send-backs recorded only in `kpi_audit_logs`.

---

- 2026-03-25: v1.91.0 — Fixed `reconcile_workflow_statuses` DB function Branch 2b. The "scored not forwarded" logic now checks whether the current status is the expected "completed stage" resting state per system architecture convention. Statuses `manager_check`, `skip_level_check`, and `hr_pms_review` with their own score are skipped when a subsequent non-approved reviewer stage exists in the workflow. This prevents false-positive reconciliation of hundreds of correctly-waiting KPIs. Branches 1 (orphaned), 2a (terminal completed), and 2c (review-stage mismatch) remain unchanged.

---

- 2026-03-26: v1.93.0 — Fixed critical stage-parsing regression in `reconcile_workflow_statuses`. Recent migrations had introduced object-based parsing (`s->>'key'`) expecting `[{key, order, enabled}]` format, but workflow templates store stages as plain string arrays (`["kra_set","self_review",...]`). This caused `v_stage_keys` to always be NULL, silently skipping every KPI. Fixed by using `jsonb_array_elements_text()` to correctly parse string arrays. All branch logic (1-orphaned, 2a-terminal, 2b-scored-not-forwarded, 3-mismatch) and normal resting state exclusions (`self_review`, `manager_check`, `skip_level_check`, `hr_pms_review`, `audit`) remain intact.

---

- 2026-03-26: v2.0.0 — Added Variance Report (`/reports/variance`). Shows KPIs where Auditor and Management scores differ. Columns: Employee Code, Name, Department, Category, KRA, KPI, Month, Auditor Score, Management Score, Variance. Filters: Month + Year + search. Summary cards: Total Variance KPIs, Avg Variance, Max Variance. Excel export supported. Route guarded by `ReportRoute` with `reportKey="variance"`.

---

- 2026-03-27: v2.4.0 — Added Monthly Self-Review & Team KRA Review Reminder. New edge function `send-monthly-review-reminder` runs on 1st of every month at 8 AM UTC via pg_cron. Sends common reminder email to all employees with active KRAs for the previous month. Review period = last month, year = current calendar year. New event type `monthly_review_reminder` added to email notification settings with admin toggle. Template added to `send-email-notification` DEFAULT_TEMPLATES.

---

- 2026-03-27: v2.4.3 — Made incentive program name & details (type, description, effective dates, active status) editable via Edit Program dialog. Pencil icon now opens edit form instead of toggling active status.
- 2026-03-27: v2.4.2 — Added binary polarity (Standard/Inverted) toggle to Assign New KRA dialog; inverted scoring auto-detected from library selection.
- 2026-03-27: v2.4.1 — Updated monthly review reminder email disregard notice to: "If you have already completed your review and team's review (if applicable), please disregard this reminder."

---

- 2026-03-27: v2.5.0 — Production Incentive Configuration Phase 2:
  - **New tables:** `business_unit_sub_units` (furnaces, lines), `production_targets` (monthly target/achieved data), `incentive_allocation_rules` (weighted splits for common employees)
  - **Altered tables:** `incentive_programs` (+incentive_base, min_kra_score, no_kra_eligible), `incentive_slabs` (+department_id, applicable_designations), `employee_incentive_records` (+incentive_status, status_override_reason, status_overridden_by, status_overridden_at)
  - **New components:** `ProductionTargetGrid` (flat filter-driven data entry), `BusinessUnitManager` (inline sub-unit CRUD), `AllocationRulesEditor` (weighted % distribution with 100% validation), `IncentiveStatusOverride` (manual status change with reason)
  - **Updated:** `IncentiveConfig` page with Production Data tab and BU/Allocation sub-tabs; `IncentiveSlabEditor` with department filter; `MonthlyIncentiveTable` with Incentive Status column and manual override popover; Edit Program dialog with incentive_base, min_kra_score, no_kra_eligible fields
  - **Edge function:** `compute-monthly-incentives` now auto-determines incentive_status (hold/finalised/forfeited) based on DQ rules and KRA approval; respects manual overrides (won't revert status_overridden_by records)
  - **Status logic:** hold (KRA pending), finalised (KRA approved/no-KRA eligible), forfeited (DQ triggered), released (manual override from hold)

- 2026-03-28: v2.5.1 — Bugfix: Audit stat card overcounting
  - **Root cause:** `getStages()` fallback to `DEFAULT_WORKFLOW_STAGES` (6-stage pipeline including `audit`) caused `manager_check` KPIs from employees whose real workflow has NO audit stage to be counted as "Pending Audit"
  - **Fix:** Added `hasResolvedWorkflow()` guard in stat card, displayMembers filter, and auditor workload stats — employees without RPC-resolved workflows are skipped in all audit-related computations
  - **Impact:** Stat card, filter, and auditor workload bar now show consistent, accurate numbers

- 2026-03-28: v2.6.0 — Feature: DB-driven Menu Access Rights
  - **New table:** `menu_access_config` — stores per-menu-item role visibility with RLS (admin CRUD, authenticated read)
  - **New hook:** `useMenuAccess` — fetches menu configs, provides `canAccess(menuKey)` check with hardcoded fallback
  - **New component:** `MenuAccessTab` — checkbox grid in System Settings for admins to toggle role visibility per sidebar menu item
  - **Updated:** `SystemSettings` (new "Menu Access" section), `AppSidebar` (DB-driven `filterByRole`), `CollapsibleSidebarGroup` (added `menuKey` to MenuItem type)
  - **Safety guard:** Admin always retains access to System Settings regardless of config

- 2026-03-28: v2.6.1 — Feature: Employee-level Menu Access Overrides
  - **New table:** `menu_access_user_overrides` — per-user menu grants with RLS (admin write, authenticated read)
  - **Updated hook:** `useMenuAccess` — now fetches user overrides, checks them first in `canAccess()`, adds `grantUserMenuAccess` and `revokeUserMenuAccess` mutations
  - **Updated component:** `MenuAccessTab` — added employee override section with search, grant, and revoke UI below role grid
  - **Pattern:** Mirrors `report_access_user_overrides` from Report Access system

- 2026-03-28: v2.6.3 — Fix: Menu Override RLS for Incentive Tables
  - **New function:** `has_menu_access_override(uuid, text)` — SECURITY DEFINER helper checking `menu_access_user_overrides`
  - **New RLS policies:** Additive INSERT/UPDATE/DELETE policies on 12 incentive-related tables allowing users with `admin-incentive` menu override
  - **Affected tables:** `incentive_vessel_rates`, `incentive_programs`, `incentive_slabs`, `incentive_program_mappings`, `employee_incentive_records`, `incentive_eligibility_fields`, `employee_incentive_eligibility`, `incentive_disqualification_rules`, `incentive_allocation_rules`, `incentive_program_types`, `incentive_score_revisions`, `production_targets`, `business_unit_sub_units`

- 2026-03-28: v2.6.5 — Employee Import Validation Guards
  - **Duplicate code check:** Import blocks rows whose `employeeCode` already exists in the system (prevents silent overwrites)
  - **Entity existence validation:** Department, Division, Business Unit, and Designation values in the upload are validated against system master data; non-existent entities produce clear error messages

- 2026-03-28: v2.6.6 — Partial Employee Import with Error Report Download
  - **Partial import:** Valid rows are imported even when some rows have validation errors (no longer all-or-nothing blocking)
  - **Per-row error tagging:** Each row is independently validated; errored rows are skipped with status 'skipped' in results
  - **Error report download:** Downloadable Excel report of errored rows with Row Number, Employee Code, Name, Department, Designation, Division, BU, and Error columns
  - **Updated button label:** Import button shows "Import X of Y Employees" when some rows have errors
  - **Preview table status column:** Errored rows highlighted in red with Error/Valid badges
  - **Update toggle:** "Allow updating existing employees" checkbox lets admin opt-in to update mode when re-importing
  - **Validation runs at parse time** (before Import button) so all errors are visible upfront in the preview

---

### v2.6.7 — Fix Team Vs Manager Score Report Query (2026-03-28)

- **Bug fix:** Report query referenced invalid `designations(name)` relation on `profiles` table, causing PGRST200 error and blank report
- **Root cause:** `profiles.designation` is a plain text field, not a FK to a `designations` table
- **Fix:** Removed relational lookup, read `designation` directly from profile row
- **Batched fetching retained:** `.range()` pagination ensures all KPIs load for months with 1,000+ records

---

### v2.7.0 — Fix: Approved KPI final_score drift from admin data entry (2026-03-28)

- **Bug fix:** Admin data entry on already-approved KPIs was overwriting `final_score` with the newly entered role-level score (e.g., auditor score of 2 replacing HR PMS approval score of 1)
- **Root cause:** `useAdminDataEntry.ts` did not check current KPI status before advancing workflow. `resolveForwardStatus()` returned `'approved'` for roles past the terminal stage, triggering `final_score` sync with the wrong reviewer's score
- **Fix:** Added guard — if KPI is already `approved`, skip status advancement and `final_score` sync entirely. Admin edits on approved KPIs now only update role-specific fields
- **Data correction:** Fixed 5 affected KPIs (employees 100801, 101178, 200570) where `final_score` had drifted from the terminal workflow reviewer (HR PMS) score
- **Invariant established:** `final_score` on approved KPIs is immutable from unrelated admin data entry. Only the approval transition itself (or explicit recompute) may set `final_score`

---

### v2.8.0 — Fix: Out-of-workflow admin data entry no longer auto-approves KPIs (2026-03-28)

- **Bug fix:** Admin entering data for a role not in the employee's workflow (e.g., auditor on a workflow without `audit` stage) caused `resolveForwardStatus` to fall back to `'approved'`, incorrectly finalizing the KPI with the wrong score
- **Root cause:** `resolveForwardStatus()` returned `'approved'` as fallback when a role's stage was missing from the workflow stages array. No upstream validation checked whether the role existed in the employee's workflow before advancing status
- **Fix 1 — Workflow membership guard in `useAdminDataEntry.ts`:** Before calling `resolveForwardStatus`, validates that the admin-entered role maps to a stage present in the employee's workflow. If absent, sets `newStatus = null` — saving role-specific fields without status advancement or `final_score` sync
- **Fix 2 — Hardened `resolveForwardStatus` in `workflowEngine.ts`:** Now returns `null` (instead of `'approved'` fallback) when the role's owned stage is not in the workflow stages array. Defense-in-depth so no caller can accidentally auto-approve via a non-workflow role
- **Data correction (Jan 2026 only):** Reverted 3 incorrectly approved KPIs (employees 100801, 100316, 100860) back to `manager_check` status with `final_score`/`final_rating` cleared. These KPIs re-enter the HR PMS review stage. December 2025 and earlier months are untouched
- **Invariant:** Admin data entry for a role whose stage is absent from the employee's workflow MUST NOT advance status or sync `final_score`

---

### v2.9.0 — Data repair: Corrected final_score for 100750 Jan 2026 (2026-03-28)

- **Bug fix:** Employee 100750 (Gaurav Tiwari) — "Adherence to Critical Mechanical Spares Inventory Levels" had `final_score = 5` (from `skip_level_score`) instead of terminal reviewer `hr_pms_score = 0`
- **Root cause:** Approval logic used generic COALESCE fallback chain instead of resolving the employee's month-specific workflow (`self_l1_l2_hr_pms`) to identify HR PMS as the terminal reviewer
- **Data correction:** Set `final_score = 0`, `final_rating = 'red'` for this single KPI. No other employees or months affected. December 2025 and earlier untouched
- **Scope:** January 2026 only, 1 row

---

### v2.10.0 — KPI Detail Report: workflow-aware score column filtering (2026-03-28)

- **Bug fix:** KPI Detail Report displayed scores for roles not in the employee's month-specific workflow (e.g., auditor score shown when `audit` stage absent from workflow)
- **Root cause:** `enrichedRows` memo only used workflow map for orphan detection, not for filtering out-of-workflow score columns
- **Fix:** Extended `enrichedRows` to blank `skipLevelScore`, `hrPmsScore`, `auditorScore`, `managementScore` when their corresponding stage is absent from the employee's workflow. For non-approved KPIs, `finalScore` is recalculated using only in-workflow scores. Derived values (`totalScore`, `percentage`, `overallRating`) are recomputed accordingly
- **Export consistency:** Excel export uses `filteredRows` derived from `enrichedRows`, so exported data matches the UI
- **Dependency fix:** `filteredRows` memo now correctly depends on `enrichedRows` instead of raw `rows`
- **Invariant:** Reports must not display scores for workflow stages that do not exist in the employee's resolved workflow

---

### v2.13.4 — Scoring Health Check: description-vs-threshold mismatch detection (2026-03-30)

- **Enhancement:** Added `DESCRIPTION_THRESHOLD_MISMATCH` detection to Scoring Health Check
- **Logic:** Parses `kpi_name` for embedded scoring logic patterns (e.g., "Rating 5: 140%", "R4: 120%") using regex, computes expected threshold values as percentages of target, and flags mismatches exceeding 5% tolerance
- **Suggested fix:** Shows computed correct values based on description percentages, advising admin to update thresholds or correct description text
- **Severity:** Medium — data entry inconsistency, not a structural misconfiguration
- **Regression risk:** Zero — additive detection only, no scoring logic changes

---

### v2.13.0 — Scoring Health Check: threshold-vs-target sanity detection (2026-03-30)

- **Enhancement:** Added `THRESHOLD_TARGET_MISMATCH` detection to Scoring Health Check for numeric KPIs
- **Logic:** For "Higher is Better" KPIs, flags R5 ≤ target as Medium severity; for "Lower is Better", flags R5 ≥ target
- **Scope:** All numeric KPIs with both target and R5 thresholds defined
- **Regression risk:** Zero — additive detection only, no scoring logic changes

---

### v2.12.0 — Cycle-aware reconciliation: workflow-aware final_score sync + rollback-awareness (2026-03-30)

- **Bug fix:** `reconcile_workflow_statuses` re-approved KPIs with stale post-rollback downstream scores (e.g., management_score=5 from pre-rollback cycle)
- **Root cause (Branch 3):** Review-stage mismatch detection advanced KPIs based on stale downstream scores without checking if a rollback occurred after the score was entered
- **Root cause (Branch 2a):** Terminal-stage approval used generic `COALESCE(management_score, auditor_score, ...)` instead of the employee's actual terminal stage score
- **Fix (Rollback-awareness):** Branch 3 now checks `kpi_audit_logs` for rollback/send-back events targeting the current status that are newer than `review_submissions.updated_at`. If found, the downstream score is treated as stale and skipped.
- **Fix (Workflow-aware sync):** Approval final_score/final_rating now uses a `CASE v_terminal_stage` expression mapping to the correct terminal reviewer's score, with an `ELSE` fallback to the original COALESCE chain for safety
- **Invariant:** Reconciliation must be cycle-aware (POLICY.md §17.5)

---

### v2.13.6 — Fixed DESCRIPTION_THRESHOLD_MISMATCH false positives for raw-percentage KPIs (2026-03-30)

- **RCA:** Detection always computed `expected = target × (pct/100)`, but budget/percentage KPIs use raw percentage values as thresholds (e.g., R3=100 means "100% of budget", not target×100%)
- **Fix:** Dual-interpretation check — a threshold is valid if it matches EITHER `target × (pct/100)` OR the raw percentage value directly, within 5% tolerance of target
- **Result:** Eliminates false positives for KPIs like "Budget saving" where R3=100 and target=95


- **RCA:** Two overloads of `reconcile_workflow_statuses` existed with different parameter orders — `(boolean, text, integer, uuid[], uuid)` vs `(text, integer, boolean, uuid, uuid[])` — causing PostgREST to fail with "could not choose the best candidate function"
- **Root cause:** Migration `20260325182832` created overload #1 with `p_dry_run` first. Subsequent `DROP FUNCTION IF EXISTS` used the canonical signature which didn't match overload #1's param order, leaving it orphaned
- **Fix:** Migration drops ALL known historical signatures before recreating the single canonical function
- **Preventive:** POLICY.md §1.26.0 — invariant requiring all future migrations to drop all known signatures

---

### v2.13.1 — Scoring Health Check: smarter threshold-vs-target detection (2026-03-30)

- **Improvement:** `THRESHOLD_TARGET_MISMATCH` detection now skips KPIs with `threshold_mode = 'ratio'` (thresholds are relative to target by design)
- **Improvement:** Suppresses false positives for percentage UOM KPIs where target = 100 (R5 cannot logically exceed 100%)
- **Improvement:** Replaced prescriptive suggestions ("set R5 to 140% of target") with neutral guidance ("verify this is intentional, review threshold mode")
- **Improvement:** UOM label now included in diagnostic messages for admin context

---

### v2.11.0 — Rollback and re-submission clear downstream reviewer data (2026-03-30)

- **Bug fix:** After a rollback (e.g., Management → Audit), stale downstream scores (management_score, management_rating, etc.) remained in `review_submissions`, causing dashboard and review journey to display old data
- **Root cause (Gap 1):** `useApproveRollbackRequest` only reverted `kpis.status` without clearing downstream reviewer fields in `review_submissions`
- **Root cause (Gap 2):** `submitReview` in `UnifiedScorecard` only wrote the current reviewer's fields without clearing fields for stages after the current one — stale data persisted after rollback re-submissions
- **Fix (Rollback):** `useApproveRollbackRequest` now nulls out all reviewer fields (score, rating, remarks, evidence, achieved_value) for stages after `target_status`, plus `final_score`/`final_rating`
- **Fix (Re-submission):** `submitReview` mutation now clears all downstream stage fields based on the employee's `effectiveStages` array and current `activeReviewStage`
- **Invariant:** Rollbacks and re-submissions must clear all downstream reviewer data (POLICY.md §17.4)

---

### v2.13.7 — Admin data entry: atomic final_score sync on approval (2026-03-30)

- **Bug fix:** Admin data entry with "Advance workflow" advancing to `approved` did not reliably populate `final_score` — dashboards showed "—"
- **Root cause:** Workflow resolution happened AFTER the upsert, then a separate `.update()` call wrote `final_score`. If `score` param was null or the second call failed silently, `final_score` remained null while KPI was marked `approved`.
- **Fix:** Moved workflow resolution BEFORE the upsert. When `newStatus === 'approved'`, `final_score` and `final_rating` are included directly in the upsert payload — single atomic write.
- **Fallback:** After upsert, if `final_score` is still null on an approved KPI, the 8-stage fallback chain (Management → Auditor → HR PMS → Skip-Level → Manager → Self) computes and patches the score.
- **Invariant:** Admin data entry must write `final_score` atomically in the same upsert when advancing to `approved` (POLICY.md §28)

---

### v2.13.8 — Fix Propagate button disabled for scoped Org KPIs (2026-03-30)

- **Bug fix:** Propagate button was permanently disabled for department-scoped and employee-scoped Org KPIs, even after Unlock → Edit
- **Root cause:** The disabled check used top-level `achievedValue` which is always empty for scoped KPIs — actual values live in `scopedValues` array
- **Fix:** Replaced with scope-aware validation: org-scope checks `achievedValue`, department/employee scope checks if any `scopedValues` row has a value or is N/A
- **Invariant:** Propagate button must use scope-aware validation (POLICY.md §29)

---

### v2.13.9 — Fix blank-data guard blocking scoped Org KPI propagation (2026-03-30)

- **Bug fix:** "Cannot propagate blank data" toast fired for department/employee-scoped Org KPIs even when all scoped rows had values entered
- **Root cause:** The blank-data guard at line 547 checked only `values.achievedValue` (top-level), which is always `null` for scoped KPIs — same class of bug as v2.13.8
- **Fix:** Made the guard scope-aware: org-scope checks top-level value; department/employee scope checks if any `scopedValues` row has data or is N/A
- **Invariant:** Blank-data propagation guard must be scope-aware (POLICY.md §29)

---

### v2.14.0 — Sent-back indicator + individual/multi-select propagation for Org KPI scoped table (2026-03-30)

- **Feature:** Amber left-border + Undo2 icon with tooltip on employee rows whose KPIs were sent back
- **Feature:** Checkbox column + per-row propagate button + "Propagate Selected" bulk action
- **Feature:** Sent-back warning in propagation confirmation dialogs

---

### v2.14.1 — Fix sent-back indicator wiring (2026-03-30)

- **Bug fix:** Sent-back indicator never appeared because `useSentBackOrgKpiEmployees` was imported but never called
- **Fix:** Moved hook invocation inside `OrgKpiEntryCard` (self-contained — no parent wiring needed)

---

### v2.14.2 — Fix sent-back indicator detection + expand value history audit logging (2026-03-30)

- **Bug fix (Issue 1):** Sent-back indicator never appeared because the hook filtered `kpi_queries` by `status = 'open'`, but send-back records are auto-resolved to `'resolved'` when KPI status changes
- **Fix:** Removed `status = 'open'` filter. Now detects sent-back state by checking if the KPI is still at `kra_set` AND has a `send_back` query record (any status). Indicator disappears once the employee re-progresses past `kra_set`.
- **Bug fix (Issue 2):** Value History popover showed very limited data — missing `propagated`, `rollback`, and many `updated` entries
- **Fix:** Added `propagated` audit log writes after successful propagation. Added `propagated`, `rollback`, `unlocked` to the `actionLabels` map in `OrgKpiAuditLog.tsx`.
- **Invariant:** Every org KPI value mutation must write an audit log entry (POLICY.md §30)

---

*This documentation is automatically maintained alongside the codebase.*

---

### v2.15.2 — Fix rollback cascade-clear off-by-one + Re-review badge (2026-03-30)

- **Bug fix:** Rollback from `approved` → `management_review` left stale `management_score` in DB because cascade-clear used `>` instead of `>=` (only cleared stages AFTER target, not the target itself)
- **Fix (useKpiRollbackRequests.ts):** Changed `idx > targetIdx` → `idx >= targetIdx` in cascade-clear loop so the target stage's own fields (score, rating, remarks, evidence, achieved_value) are also nulled
- **Fix (useAdminDataEntry.ts):** Changed `<` → `<=` in all 5 stage-clear conditions (manager, skip-level, HR PMS, audit, management) so admin step-back also clears the target stage
- **UI:** Added amber "Re-review" badge in `KpiDetailsTable` score columns when score is null AND KPI status matches that stage (indicates rolled-back stage awaiting re-review)
- **Invariant:** Rollback target stage fields must be cleared on rollback/step-back (POLICY.md §33)

---

### v2.15.3 — Fix observation edit mentionedUserIds error (2026-03-30)

- **Bug fix:** Editing observations failed because `mentionedUserIds` was passed to the DB update call but is not a database column
- **Fix (useKpiObservations.ts):** Strip `mentionedUserIds` from update payload before sending to database

---

### v2.15.4 — Sortable column headers in KPI Details Table (2026-03-30)

- **Feature:** Added clickable sort headers for Category, Weightage, Score columns, and Status in `KpiDetailsTable`
- **Scope:** Automatically available across all 6 dashboards (My KPIs, Team Review, Audit, Management, Skip-Level, HR PMS)

---

### v2.15.6 — Decouple final_score recompute from advance_status toggle (2026-03-30)

- **Bug fix:** v2.15.5 recompute was still gated by `advance_status !== false`, causing final_score to remain stale when the toggle was off for already-approved KPIs
- **Fix (useAdminDataEntry.ts):** Hoisted `currentKpiStatus` out of the `advance_status` block; new condition `kpiWasAlreadyApproved = !newStatus && currentKpiStatus === 'approved'` fires independently of the advance toggle
- **Data fix:** Repaired all approved KPIs from Jan 2026+ where `final_score` didn't match `management_score` (4 records)
- **Zero regression risk:** Non-approved KPIs unaffected; normal forward flow unchanged; N/A KPIs unaffected

---

### v2.15.5 — Fix final_score recomputation on already-approved KPIs (2026-03-30)

- **Bug fix:** Admin editing management_score on already-approved KPI left final_score at old value (e.g., auditor_score=0) because status advancement was skipped for approved KPIs, which also skipped final_score sync
- **Fix (useAdminDataEntry.ts):** After upsert, if KPI is already approved, re-fetch submission and recompute final_score using 8-stage fallback chain; patch if it differs from current value
- **Data fix:** Corrected stale final_score for Abhas Jan 2026 "Budgetary Preparation" KPI (management_score=5, final_score was 0→5)
- **Invariant:** Admin edits on approved KPIs must always trigger final_score recomputation (POLICY.md §34)

---

### v2.15.7 — KPI Scorecard Detail report (2026-03-30)

- **Feature:** New report at `/reports/kpi-scorecard-detail` — flat table with one row per KPI
- **Columns:** Employee Code, Name, Designation, Department, Month, Category, KRA, KPI, Weightage, Self, Manager, Skip-Level, HR PMS, Auditor, Management, Final Score, Status
- **No row limit:** Uses batch-fetch loop (`range(offset, offset+999)`) to load all KPIs for the period
- **Sortable headers:** All columns support click-to-sort with ascending/descending toggle
- **Filters:** Month/year selector, department filter, text search (name/code/KPI/KRA)
- **Excel export:** Full filtered dataset exported via `xlsx` library
- **Access:** Controlled via `kpi-scorecard-detail` key in report access system; default: admin, manager, management, hr_pms, auditor
- **Files:** `src/pages/reports/KpiScorecardDetail.tsx` (new), `ReportsHub.tsx`, `App.tsx`, `useReportAccess.ts`

---

### v2.15.8 — Fix N/A blast-radius bug in admin data entry (2026-03-30)

- **Bug:** Admin toggling N/A for any role level (e.g., management) wiped scores across ALL levels (self, manager, auditor, etc.)
- **Root cause:** `useAdminDataEntry.ts` unconditionally cleared every scoring field when `is_na=true`, and the dialog always passed `is_na` even when unchanged
- **Fix (useAdminDataEntry.ts):** N/A clearing now scoped to current role's fields only; `is_na` flag only written when it actually changed from existing state
- **Fix (AdminDataEntryDialog.tsx):** Track `originalIsNa` state; only pass `is_na` to mutation when toggled by admin
- **Invariant:** N/A toggle must never clear scores for unrelated review levels (POLICY.md §35)

---

### v2.15.10 — Port Incentive detection via vessel rates query (2026-03-30)

- **Bug:** Port Incentive program showed ProductionTargetGrid (Sub-Unit/Category/Target fields) instead of VesselDataEntryGrid because detection used `incentive_base === 'fixed'` but the program uses `basic_salary`
- **Fix (UnifiedProductionDataTab.tsx):** Query `incentive_vessel_rates` count for selected program; if count > 0, render VesselDataEntryGrid; otherwise render ProductionTargetGrid
- **UX:** Added loading skeleton while vessel rate count query resolves
- **No schema changes**

---

### v2.15.11 — DB-driven slab categories (zero-hardcoding) (2026-03-30)

- **Problem:** Slab categories (PMS Score, Production, Availability, etc.) were hardcoded in `IncentiveSlabEditor.tsx` and `ProductionTargetGrid.tsx`
- **Fix:** Created `incentive_slab_categories` table with RLS, seeded with existing values
- **New hook:** `useIncentiveSlabCategories.ts` — CRUD for slab categories
- **New component:** `SlabCategorySelector.tsx` — reusable dropdown with inline "Add New" (mirrors `ProgramTypeSelector` pattern)
- **Updated:** `IncentiveSlabEditor.tsx` and `ProductionTargetGrid.tsx` now use DB-driven categories
- **POLICY.md §36:** Slab categories must be master-data driven, never hardcoded

---

### v2.15.12 — Unified employee mapping table with multi-select (2026-03-30)

- **Problem:** Employee mapping used 5 separate tabs (Division, Dept/BU, Designation, Grade, Individual) making it hard to see resolved employee list
- **Fix:** Replaced tabs with a single sortable table showing all active employees with columns: Employee (Code), Designation, Department, BU, Division, Level, PMS Grade
- **Features:** Multi-select checkboxes, "Select All Filtered", sortable columns, filter dropdowns for Division/BU/Dept/Designation/Grade, search bar, pagination (20/page)
- **New hooks:** `useBulkAddProgramMappings`, `useBulkRemoveProgramMappings` for batch operations
- **POLICY.md §37:** Employee mapping UI must show resolved employee list, not abstract entity pickers

---

### v2.15.13 — Edit & delete slab category dropdown options (2026-03-30)

- **Problem:** Slab categories could only be added via the dropdown; no way to edit or delete existing categories
- **Fix:** Added a "Manage" (⚙) button next to the dropdown that opens a popover with inline edit and delete actions for each category
- **New hook:** `useUpdateSlabCategory` — updates label and re-derives value
- **UI:** Popover lists all categories with pencil (edit) and trash (delete) icons; inline input for editing; "Add New" at bottom

---

### v2.15.14 — Monthly review reminder template visible in Email Templates UI (2026-03-31)

- **Problem:** `monthly_review_reminder` event existed in edge function and notification settings toggle but was missing from `DEFAULT_TEMPLATES` in `EmailTemplateEditor.tsx`, making it invisible in the templates list
- **Fix:** Added `monthly_review_reminder` entry to `DEFAULT_TEMPLATES` with default subject/body matching the edge function template
- **New placeholders:** `{{pending_kpis_count}}`, `{{pending_kpis_list}}` for monthly reminder context

---

### v2.15.15 — Observation counts visible on all dashboard KPI rows (2026-03-31)

- **Problem:** Observations were only visible inside the KPI review panel; dashboard KPI rows showed query badges but not observation counts
- **Fix:** Added a compact amber Eye icon + count indicator next to KPI status on all dashboard views (My KPIs, Team Review, Audit, Management, Skip-Level, HR PMS)
- **Components updated:** `KpiDetailsTable.tsx` (new `observationCounts` prop), `MobileKpiCard.tsx` (new `observationCount` prop)
- **Scorecards updated:** `UnifiedScorecard`, `EmployeeScorecard`, `AuditScorecard`, `ManagementScorecard` — all fetch batch observations via `useObservationsByKpis`
- **POLICY.md §38:** Observation counts must be visible on all dashboard KPI rows

---

### v2.15.16 — Query notifications use first-line KPI names and show query reason (2026-03-31)

- **Problem:** Query raised notifications included full KPI description with formula/scoring logic, making them unreadable; email notifications showed `Query: N/A` because `query_reason` was not passed in metadata
- **Fix (in-app):** `useKpis.ts` and `useQueryWorkflow.ts` now truncate KPI name to first line via `.split('\n')[0].substring(0, 100)` and pass `query_reason` in notification metadata
- **Fix (email):** DB trigger `send_email_on_notification` extended first-line truncation to query types (`query_raised`, `query_response_submitted`, `query_response_fyi`, `query_resolved`, `query_resolved_fyi`)
- **POLICY.md §39:** All notification messages must use first-line-only KPI names

### v2.15.18 — Enhanced Incentive Report with filters and Excel export (2026-03-31)

- **New hook:** `useIncentiveReportData` in `useIncentiveRecords.ts` — batched pagination (1000-row pages in a loop) to fetch ALL incentive records without hitting Supabase's default limit
- **New component:** `IncentiveReportExport.tsx` — Month/Year/Programme filters (all with "All" option), search, summary cards (Total, Eligible, DQ, Pro-rata, Total %), preview table, and comprehensive 28-column Excel export
- **Excel columns:** Employee Info (6), Period & Programme (3), Scores & Slabs (4), DQ Fields (3), Adjustments (4), Final (3), Analytical (5)
- **Updated:** `IncentiveReport.tsx` — new default "Incentive Report" tab alongside existing Monthly Report and Retroactive Adjustments tabs
- **POLICY.md §41:** Incentive report exports must include all DQ rule fields

### v2.15.21 — Fix Send Reminder Error (Org KPI Data Entry)
- **Fixed:** `OrgKpiDataEntry.tsx` — reordered error handling to check `data?.error` before SDK-level `error`, so the actual edge function error message (e.g., "Pending KPI reminder event is not enabled") is shown instead of a generic "non-2xx status code" message
- **Root cause:** The `org_kpi_pending_reminder` event toggle already exists in Email Notification Settings but may not be enabled; the fix ensures admins see the actionable error message

### v2.15.22 — Org KPI Audit Review Page
- **New page:** `/admin/org-kpi-audit-review` — dedicated audit review interface for organization-level KPIs
- **New hook:** `useOrgKpiAuditReview` — fetches org-level KPIs at audit stage with employee details, scores, and per-employee workflows
- **New component:** `OrgKpiAuditCard` — card per org KPI definition with employee grid, inline scoring, bulk approve
- **Features:** Month/Year filters, search, category pills, status tabs (All/Pending/Audited), progress bar, consistency indicator, bulk approve
- **Workflow:** Uses `resolveForwardStatus('auditor', stages)` for proper status advancement per employee's workflow
- **Sidebar:** Added under Audit section (auditor + admin roles), menu key: `admin-org-kpi-audit`
- **POLICY.md §43:** Org KPI audit review governance

### v2.15.24 — Daily Achievement Grid with Per-Ton Rate
- **New tables:** `incentive_production_rates` (per-employee rate/ton per program), `production_daily_entries` (JSONB daily values per employee/month/year)
- **New component:** `ProductionDailyGrid` — horizontal-scroll grid with dates 1-31 as columns, employees as rows, date range toggle (All, 1-10, 11-20, 21-31)
- **New component:** `ProductionRatesTab` — per-employee rate configuration in programme settings
- **New hook:** `useProductionDailyEntries` — CRUD for production rates + daily entries
- **Detection logic:** `UnifiedProductionDataTab` now detects production rates → renders daily grid; vessel rates → vessel grid; neither → slab grid
- **Programme config:** Added "Production Rates" tab alongside "Vessel Rates"
- **Calculation:** Total achievement × Rate/Ton = Amount; Grand Total shown at bottom
- **POLICY.md §44:** Production daily entry governance

### v2.15.27 — Org KPI Audit Review Redesign (Data Entry Style + Collapsible)
- **Redesigned:** `OrgKpiAuditCard.tsx` — always-expanded by default (collapsible), shows KPI metadata (name, description, formula, scoring logic, KRA, target, UOM, category badge)
- **Department grouping:** Employee table grouped by department with designation badges
- **Bulk fill controls:** "Fill all" and "Fill empty" buttons for auditor score input
- **Compact table:** Tightened padding, constrained column widths, removed `w-full`
- **Updated hook:** `useOrgKpiAuditReview.ts` — fetches `criteria`, `departmentName`, `designationName` via separate dept/desig lookups
- **Page cleanup:** Removed category sub-headers from `OrgKpiAuditReview.tsx` — cards are self-descriptive with category-colored borders

### v2.15.31 — Connect Production Data Pipeline to Incentive Computation
- **Root cause:** Edge function `compute-monthly-incentives` never read `production_daily_entries` or `incentive_production_rates` — only checked `employee_incentive_eligibility.production_value` (always null for production programs)
- **DB migration:** Added `incentive_amount` numeric column to `employee_incentive_records` (default 0)
- **Edge function:** Now fetches `production_daily_entries` (JSONB daily_values) and `incentive_production_rates`, aggregates totalTons × resolvedRate per employee using priority cascade (Employee > Dept > BU > Common)
- **UI:** Added "Amount (₹)" column to `MonthlyIncentiveTable` and `IncentiveDryRunDialog`; added "Total Amount" summary card
- **Export:** Incentive amount included in Excel export
- **POLICY.md §44:** Updated to document computation pipeline integration

### v2.15.32 — Fix Incentive Records Visibility
- **Root cause:** `useIncentiveRecords` had no `program_id` filter — fetched all records for month/year; errors were silently swallowed showing "No records found"
- **Hook:** Added optional `programId` parameter with query filter and error logging
- **UI:** Pass `selectedProgram` to hook; added error state display with actual error message; improved empty state messaging
- **RLS:** Departments already has `SELECT` for all authenticated users — no migration needed

### v2.15.33 — Add Missing FK Constraints for Incentive Tables
- **Root cause:** `employee_incentive_records`, `employee_incentive_eligibility`, and `incentive_score_revisions` had `employee_id` columns without foreign key references to `profiles`. PostgREST could not resolve embedded joins (`profiles:employee_id(...)`) → runtime error "Could not find a relationship"
- **Migration:** Added FK constraints (`employee_id → profiles(id) ON DELETE CASCADE`) to all three tables; orphan rows cleaned before constraint creation
- **No RLS changes** — no risk of dashboard recursion issues
- **Frontend:** Hooks unchanged; existing error display from v2.15.32 now surfaces real data instead of schema errors

### v2.15.34 — Period-Based Incentive Records for Production Programs
- Added `payment_period` column to `employee_incentive_records` with updated unique constraint
- Edge function splits production data into period-based records (1-10, 11-20, 21-31) or Full Month
- Frontend: Period column added to report preview, monthly table, and Excel export; "All" renamed to "Full Month"

### v2.15.35 — Fix N/A Recompute Overwriting Final Score
- **Root cause:** Admin marks management as N/A → upsert correctly sets `final_score = null` → Step 8 recompute block re-fetches submission, finds `auditor_score = 0` via fallback chain, patches `final_score` back to 0
- **Fix:** Added `is_na` guard in recompute block — if `is_na === true`, force `final_score/final_rating` to null and skip fallback chain
- **DB repair:** Corrective update nullified `final_score` on all records where `is_na = true` but score was non-null

### v2.15.36 — Zero DQ Incentive Amount; Show DQ Status in Report
- Edge function: Zero `incentiveAmount` for production programs when employee is disqualified
- Report UI: Added DQ/Incentive Status and Workflow columns to preview table

### v2.15.37 — Merge Incentive Report & Monthly Report into Single Tab
- Merged `IncentiveReportExport` into `MonthlyIncentiveTable` as a single unified component
- Added "All Months", "All Years", "All Programmes" filter options with batched data fetching
- Added Period filter, DQ tooltip, enhanced 30-column Excel export
- Reduced Incentive Report page from 3 tabs to 2 (Incentive Report + Retroactive Adjustments)
- Deleted `IncentiveReportExport.tsx`

### v2.15.38 — Fix Stale DQ Records via Delete-Before-Upsert Cleanup
- **Root cause:** Edge function upserted without deleting existing records; stale `payment_period='full'` records persisted alongside new `'Full Month'` records, causing DQ employees to still show incentive amounts
- **Fix 1:** Normalized all `payment_period = 'full'` → `'Full Month'` in database
- **Fix 2:** Edge function now deletes all existing records for employee+program+month before upserting fresh computed results
- **Fix 3:** Standardized support/vessel program `payment_period` from `'full'` to `'Full Month'`

### v2.15.41 — Frequency-Aware KRA Rollover & Service Role Trigger Bypass
- **Root cause:** Rollover function set `review_period = targetMonth` for ALL KPIs regardless of frequency. Quarterly KPIs rolled to April were blocked by the `kpi_frequency_lock_check` trigger (April is a locked month for Quarterly). Additionally, the trigger's admin bypass failed for service-role callers since `auth.uid()` is NULL.
- **Fix 1:** Edge function now resolves the target `review_period` to the correct terminal month based on KPI frequency (e.g., Quarterly April → June, Half-Yearly April → June, Bi-Monthly April → April)
- **Fix 2:** `enforce_frequency_lock_on_submission` trigger now checks `current_setting('role', true) = 'service_role'` to allow edge function callers to bypass the lock
- **Fix 3:** Dedup check expanded to include `review_period` in the key, so Quarterly KPIs rolled to June don't collide with Monthly KPIs in April

### v2.15.39 — Ensure All Programs Have Standard DQ Rules Configured
- **Root cause:** Metal Sizing program had zero DQ rules in `incentive_disqualification_rules` table, causing the DQ evaluation loop to be a no-op — all employees passed as eligible regardless of warning letters, suspensions, etc.
- **Fix:** Inserted 6 standard DQ rules (warning, suspension, absence, LWP, LTI, contract) for Metal Sizing, CLU Meta Recovery, CLU Metal Recovery, Production Incentive, and completed Port Incentive (had only 1 rule)
- **Re-computation:** Metal Sizing March 2026 re-computed — 2 employees now correctly show as disqualified with ₹0 amount
- **Operational note:** Every new incentive program MUST have DQ rules configured via the Incentive Configuration UI before computation; otherwise DQ evaluation is skipped entirely
- **Root cause:** Metal Sizing program had zero DQ rules in `incentive_disqualification_rules` table, causing the DQ evaluation loop to be a no-op — all employees passed as eligible regardless of warning letters, suspensions, etc.
- **Fix:** Inserted 6 standard DQ rules (warning, suspension, absence, LWP, LTI, contract) for Metal Sizing, CLU Meta Recovery, CLU Metal Recovery, Production Incentive, and completed Port Incentive (had only 1 rule)
- **Re-computation:** Metal Sizing March 2026 re-computed — 2 employees now correctly show as disqualified with ₹0 amount
- **Operational note:** Every new incentive program MUST have DQ rules configured via the Incentive Configuration UI before computation; otherwise DQ evaluation is skipped entirely

### v2.15.42 — Fix Daily KPI Aggregation in Submit Monthly Review Dialog
- **Bug 1 — Submitted Days mismatch:** Dialog used `calculateDailyAggregatedScore` (calendar days) instead of `useExpectedDays` which respects `day_count_type` and employee working days. Fixed to use `calculateDailyAggregatedScoreWithExpectedDays` with correct expected days.
- **Bug 2 — Rating double-conversion:** For `missed_days_penalty` method, the aggregated score (0-5) was re-mapped through KPI thresholds via `calculateScoreFromAchieved`, producing incorrect ratings (e.g., 0 → "Outstanding" for Lower-is-Better KPIs). Fixed: when method is `missed_days_penalty`, the score IS the rating — no re-mapping.
- **Bug 3 — Static label:** "Average Score" label shown regardless of aggregation method. Fixed to use dynamic `getAggregationMethodLabel()`.
- **Affected file:** `src/components/review/SelfReviewSheet.tsx`

### v2.15.43 — Multi-Month KPI Score Percolation Trigger
- **Root cause:** Terminal-month approval for multi-month KPIs (Quarterly, Bi-Monthly, Half-Yearly, Yearly) did not propagate scores/status to sibling months in the same cycle.
- **Fix:** Added `percolate_multimonth_score()` DB trigger on `kpis` table. When a multi-month KPI is set to `approved`, it propagates scores to sibling records in the same cycle via `get_cycle_months()`, using a **3-way workflow-stage guard**:
  - **Already-approved siblings**: Scores and remarks are updated (upserted) but status remains `approved`. Audit action: `SCORE_PERCOLATED` with `scores_only: true`.
  - **Terminal-stage siblings** (at their workflow's last review stage): Status advanced to `approved`, scores/remarks/evidence copied. Audit action: `SCORE_PERCOLATED`.
  - **Mid-workflow siblings** (not yet at terminal stage): Status is NOT touched. A `PERCOLATION_DEFERRED` audit log is created instead, recording the reason ("Sibling has not reached terminal workflow stage"). These siblings must complete their own review workflow independently before being approved.
- **Audit:** Each percolated sibling gets a `SCORE_PERCOLATED` entry in `kpi_audit_logs`. Mid-workflow siblings get `PERCOLATION_DEFERRED`.
- **Policy alignment:** Implements POLICY §54 (Multi-Month Workflow Independence Invariant).
- **Backfill:** One-time migration propagated scores for all approved multi-month KPIs from Jan 2026 onwards.

### v2.15.44 — Full-Cycle Rollover for Multi-Month KPIs
- **Root cause:** Rollover function created only one record at the terminal month for multi-month KPIs (e.g., Quarterly April → only June). Sibling months (April, May) got no records, breaking scorecard visibility, weightage calculations, and percolation.
- **Fix:** Added `getCycleMonthsForTarget()` helper to edge function. Rollover now creates records for ALL months in the cycle that are >= the target month (e.g., Quarterly rolling to April creates April, May, and June). Each month is independently deduped against existing records.
- **Compatibility:** Non-terminal month records are naturally locked by `enforce_frequency_lock_on_submission` trigger. Percolation trigger propagates scores from terminal to siblings on approval.
- **Affected file:** `supabase/functions/auto-rollover-kpis/index.ts`

### v2.15.45 — Auto-Advanced KPIs: Full Stage Score Propagation
- **Root cause:** System auto-advance (overdue self-review) only set `self_score` and `final_score` to 0, leaving `manager_score`, `auditor_score`, `management_score` etc. as NULL. Journey tiles treated NULL scores on completed stages as "N/A" instead of showing the actual 0 score.
- **Fix 1 — Data:** Auto-advance now sets ALL intermediate stage scores (`manager_score`, `skip_level_score`, `hr_pms_score`, `auditor_score`, `management_score`) to 0 with `red` rating alongside `self_score` and `final_score`.
- **Fix 2 — UI:** `KpiJourneySection.tsx` now detects `auto_advance_reason` on submissions and excludes auto-advanced KPIs from N/A badge logic. Both current and previous-month journey tiles are fixed.
- **Backfill:** Existing auto-advanced submissions with NULL intermediate scores updated to 0/red via data correction.
- **Affected files:** `src/hooks/usePendingSelfReviews.ts`, `src/components/review/KpiJourneySection.tsx`

### v2.15.46 — Fix KRA-Level Dedup Blocking Sibling Month Backfill
- **Root cause:** The rollover KRA-level dedup (terminal month check) prevented creating sibling month records when the terminal month already existed. Re-running rollover with `force: true` still created 0 records because the dedup short-circuited the entire KPI.
- **Fix:** Removed KRA-level terminal dedup from `auto-rollover-kpis/index.ts`. The per-month `kra_name+kpi_name` dedup is sufficient and more precise — it allows creating missing sibling months while still preventing true duplicates.
- **Data repair:** Re-ran rollover for March→April 2026 with `force: true`. Created 75 missing sibling KPI records across 22 employees (Quarterly April/May records alongside existing June).
- **Affected file:** `supabase/functions/auto-rollover-kpis/index.ts`

### v2.15.47 — Incentive Report: Employee Selection & Mark Paid Impact Preview
- **Feature:** Added row-level checkbox selection to the Monthly Incentive Report table. "Confirm All" and "Mark Paid" now operate on selected rows when a selection exists.
- **Impact dialog:** Before executing "Mark Paid", an AlertDialog shows the count of employees, total incentive amount (₹), and a scrollable employee list for confirmation.
- **Affected file:** `src/components/incentive/MonthlyIncentiveTable.tsx`

### v2.15.48 — Separate Incentive Data Entry Page
- **Problem:** Production Data and Eligibility Data were tabs inside Incentive Config, requiring full config access for data entry personnel.
- **Fix:** Created standalone `/admin/incentive-data-entry` page with its own menu key (`admin-incentive-data`). Reuses existing `UnifiedProductionDataTab` and `EligibilityDataEntry` components. Incentive Config now shows only program configuration (slabs, DQ rules, mappings).
- **Access control:** New menu key seeded in `menu_access_config`. Admins can grant data entry access to specific roles/users via Menu Access Rights without exposing configuration.
- **Affected files:** `src/pages/admin/IncentiveDataEntry.tsx` (new), `src/pages/admin/IncentiveConfig.tsx`, `src/App.tsx`, `src/components/layout/AppSidebar.tsx`

### v2.15.49 — Percolate Remarks, Evidence & Auto-Advance Reason to Sibling Months
- **Root cause:** The `percolate_multimonth_score()` trigger only copied scores, ratings, `achieved_value`, and `is_na` to sibling month records. Remarks (`self_remarks`, `manager_remarks`, etc.), `auto_advance_reason`, evidence URLs, and per-level achieved values were omitted.
- **Fix:** Updated the trigger to include all remarks columns, `auto_advance_reason`, all `*_evidence_urls` columns, and all per-level `*_achieved_value` columns in both INSERT and ON CONFLICT UPDATE clauses.
- **Data repair:** Backfilled existing percolated sibling records (identified via `SCORE_PERCOLATED` audit logs) with missing remarks and auto-advance reason from their terminal month source.
- **Affected:** Database function `percolate_multimonth_score()`

### v2.15.50 — Admin Step-Back: Target Stage Selector, Full Reset & Sibling Reversion
- **Gap 1 — Target stage selector:** Admin step-back dialog now shows a dropdown of all preceding workflow stages (not just the immediate previous). Admin can choose exactly where to send a KPI back (e.g., from `approved` directly to `kra_set`).
- **Gap 2 — Full reset:** Added "Clear all review data" checkbox. When checked, ALL scores, ratings, remarks, evidence, achieved values, and `auto_advance_reason` are nullified. KPI is reset to `kra_set` with `kpi_status = 'open'`. Audit action: `ADMIN_FULL_RESET`.
- **Gap 3 — Multi-month sibling reversion:** When stepping back an `approved` multi-month KPI (Quarterly, Bi-Monthly, etc.), all sibling months in the same cycle are automatically reverted to the same target stage with the same data clearing. Audit action: `SIBLING_STEP_BACK`.
- **Affected files:** `src/components/admin/AdminStatusStepBackDialog.tsx`, `src/hooks/useAdminDataEntry.ts`

### v2.15.51 — Admin Step-Back Button on KPI Details View
- Added "Step Back" button to the KPI details header (`KpiHeaderSection`), visible only to admin users when the KPI has a valid previous status.
- Button appears alongside "Admin KPI Editor" and "Admin Data Entry" in the admin action row.
- Uses the existing `AdminStatusStepBackDialog` component — no new logic required.
- **Affected files:** `src/components/review/KpiHeaderSection.tsx`

### v2.15.52 — System-Wide Reconfirmation Dialogs for Destructive Actions
- Created reusable `ConfirmDestructiveDialog` component (`src/components/ui/ConfirmDestructiveDialog.tsx`) using Radix AlertDialog with destructive button styling.
- **Step-Back Full Reset:** The "Confirm Full Reset" button in `AdminStatusStepBackDialog` now triggers a nested confirmation: *"This will permanently delete ALL scores, remarks, evidence, and achieved values for this KPI. This action cannot be undone."*
- **9 components updated** with confirmation dialogs for previously unprotected delete buttons:
  - `DisqualificationRulesEditor` — Delete DQ rule
  - `IncentiveSlabEditor` — Delete slab
  - `AllocationRulesEditor` — Delete allocation rule
  - `EligibilityFieldsConfig` — Delete custom field
  - `BusinessUnitManager` — Delete sub-unit
  - `CustomTabDataGrid` — Delete data row
  - `CompetencyManagerTab` — Delete competency
  - `SlabCategorySelector` — Delete slab category
- **Already protected (unchanged):** `Organization.tsx`, `TemplateBundles.tsx`, `KRALibrary.tsx`, `WorkflowConfig.tsx`, `KraIssuanceConfirmDialog.tsx`, `KpiObservationsSection.tsx`
- **Affected files:** `src/components/ui/ConfirmDestructiveDialog.tsx` (new), `AdminStatusStepBackDialog.tsx`, `DisqualificationRulesEditor.tsx`, `IncentiveSlabEditor.tsx`, `AllocationRulesEditor.tsx`, `EligibilityFieldsConfig.tsx`, `BusinessUnitManager.tsx`, `CustomTabDataGrid.tsx`, `CompetencyManagerTab.tsx`, `SlabCategorySelector.tsx`

### v2.15.53 — Real-Time KPI Sync Across Sessions
- Enabled Postgres realtime on `kpis`, `review_submissions`, and `org_kpi_values` tables.
- Created `useRealtimeKpiSync` hook that subscribes to postgres_changes and invalidates relevant React Query caches with 500ms debounce.
- Mounted in `DashboardLayout` so all authenticated sessions receive live updates when admin edits KPIs, scores, or targets.
- **Affected files:** `src/hooks/useRealtimeKpiSync.ts` (new), `src/components/layout/DashboardLayout.tsx`

### v2.15.54 — Previous 2 Months' Overall Score on Dashboard
- Created `PreviousMonthsScoreMini` component showing the previous 2 months' weighted average scores as compact rows with mini progress bars, trend arrows, and score labels.
- Mounted inside the "Overall Performance" card in `UnifiedScorecard`, below the existing Weighted Score section.
- Uses the standard 8-stage fallback chain and excludes N/A KPIs for accurate calculation.
- Mobile-friendly: compact `text-[10px]` labels, thin progress bars, and responsive layout.
- **Affected files:** `src/components/review/PreviousMonthsScoreMini.tsx` (new), `src/components/review/UnifiedScorecard.tsx`

### v2.15.55 — Compact Horizontal 3-Month Trend & Layout Cleanup
- Redesigned `PreviousMonthsScoreMini` from vertical stacked rows to a horizontal 3-column grid layout, removing progress bars for compactness.
- Removed redundant "Overall / Performance" `CardHeader` from the left performance card — donut chart is self-explanatory.
- Changed category chart height from fixed `height` to `minHeight` to prevent blank space when few categories exist.
- Added configurable `count` prop (default 3) to `PreviousMonthsScoreMini`.
- **Affected files:** `src/components/review/PreviousMonthsScoreMini.tsx`, `src/components/review/UnifiedScorecard.tsx`

### v2.15.56 — Fix Category Chart Bars Not Rendering
- Reverted category chart container from `minHeight` back to `height` — Recharts' `ResponsiveContainer` requires a parent with a resolved pixel height to render bars.
- **Affected files:** `src/components/review/UnifiedScorecard.tsx`

### v2.15.57 — Simplify Previous Months Score Display
- Removed percentage display, trend arrows, and `/5` suffix from `PreviousMonthsScoreMini`.
- Each month now shows only the score value (e.g., `5.00`) with color coding.
- **Affected files:** `src/components/review/PreviousMonthsScoreMini.tsx`

### v2.15.58 — Fix Monthly Review Reminder Email Delivery
- Added `monthly_review_reminder` to enabled events in `system_settings`.
- Updated cron schedule to `0 8 1,3,5,7,9 * *` with `X-Cron-Secret` header.
- **Affected:** `system_settings` data, pg_cron job

### v2.15.59 — Formal ADR System + Enhanced POLICY.md Invariants
- Created `docs/adr/` directory with ADR template and 21 individual ADR files (ADR-029 through ADR-049).
- Added "Decision Context & Alternatives Considered" section to each POLICY.md invariant §29–§49.
- **Affected files:** `docs/adr/ADR-TEMPLATE.md`, `docs/adr/ADR-029.md`–`ADR-049.md`, `POLICY.md`

### v2.15.60 — Hide Inactive Employees + Company Name
- Added `.eq('is_active', true)` filter to `useProfiles`, `useProfilesByWorkflowStage`, `useSkipLevelTeamMembers`, `useEmployeeFilterOptions`.
- Added editable company name to Organization Structure page header.
- **Affected files:** `src/hooks/useOrganization.ts`, `src/hooks/useEmployeeFilterOptions.ts`, `src/pages/admin/Organization.tsx`, `POLICY.md` (§51)

### v2.15.61 — Multi-Company Support with Structure Cloning
- Created `companies` table with RLS (authenticated read, admin write).
- Added `company_id` FK to `divisions`, `designations`, `pms_grades`, `levels` tables with backfill to default company.
- Fixed `useUpdateSystemSetting` to use `.upsert()` instead of `.update()` to prevent crash on missing keys.
- Created `src/hooks/useCompanies.ts` with CRUD hooks and `useCloneStructure` for copying org structure between companies.
- Updated `useDivisions`, `useDesignations`, `usePmsGrades`, `useLevels` to accept optional `companyId` filter.
- Replaced inline company name editor with company selector dropdown, "Manage Companies" dialog, and "Clone Structure From..." dialog on Organization page.
- BUs/Departments/Sub-Branches filtered by selected company's divisions.
- **Affected files:** Migration, `src/hooks/useSystemSettings.ts`, `src/hooks/useCompanies.ts` (new), `src/hooks/useOrganization.ts`, `src/pages/admin/Organization.tsx`, `POLICY.md` (§52), `DOCUMENTATION.md`

### v2.15.62 — Workflow Config Export: Skip-Level Manager Column
- Added skip-level manager column to Employee Overrides sheet in workflow config export.
- **Affected files:** `src/components/admin/WorkflowConfigExport.tsx`

### v2.15.63 — Auth Resilience: Fix Infinite Skeleton + Decouple Branding
- **RCA:** Dashboard showed infinite skeleton when `profile` was `null` after auth bootstrap completed. Root cause: `fetchProfile()` used `.single()` which throws on missing rows; catch block returned `true` masking the failure.
- Replaced `.single()` with `.maybeSingle()` in `AuthContext.fetchProfile()`.
- Added `profileError` state to `AuthContext` to distinguish missing/broken profiles from loading state.
- Dashboard now shows actionable error screen (Retry + Sign Out) instead of infinite skeleton when profile is missing.
- Auth page no longer blocks on `isLoadingSettings` from `useAppSettings()` — branding loads progressively.
- **Affected files:** `src/contexts/AuthContext.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Auth.tsx`, `POLICY.md` (§53)

### v2.15.64 — Org KPI Status: Treat 'approved' as Propagated
- **RCA:** Scoped org KPI values that advanced to `'approved'` status were not recognized by the UI's status resolution logic, causing propagated KPIs to display as "Entered".
- Updated all 7 status-resolution checks in `OrgKpiDataEntry.tsx` to treat `'approved'` as equivalent to `'propagated'` (since approved is a later workflow stage).

### v2.15.65 — N/A KPI Final Score: Show "N/A" Badge Instead of Dash
- **RCA:** KPIs marked as N/A by admin had `final_score = NULL`, but the Final column displayed "—" (indistinguishable from "not yet scored"). Users confused this with a stuck/missing score.
- Final column now shows an amber "N/A" badge for N/A KPIs instead of a dash.
- Residual scores (Self, Auditor, Mgmt) on N/A KPIs are rendered with strikethrough styling to indicate they are excluded from calculations.
- **Affected files:** `src/pages/admin/OrgKpiDataEntry.tsx`, `DOCUMENTATION.md`

### v2.16.70 — §60: Workflow Change Auto-Step-Back for Approved KPIs
- **RCA:** KPI `ee7db054` (employee 100482) was approved by HR PMS on Mar 28 under `self_l1_hr_pms` workflow. On Apr 4, admin changed workflow to `self_l1_audit` (adding audit stage). KPI remained `approved` despite never going through audit. 39 KPIs across 7 employees were affected.
- **Data fix:** Reset 39 KPIs from `approved` to `manager_check` (pre-audit stage). Cleared `final_score`/`final_rating`. Preserved all reviewer scores.
- **Trigger:** Added `trg_workflow_change_step_back` on `workflow_config`. Auto-detects when new workflow adds stages beyond old terminal reviewer and steps back approved KPIs.
- **UI:** Post-save toast notification in workflow config UI warns admin when KPIs are stepped back.
- **Affected files:** Migration SQL, `src/hooks/useWorkflowConfig.ts`, `POLICY.md` (§60), `DOCUMENTATION.md`

### v2.16.71 — Fix: Previous Months Show Historical Workflow Instead of Current
- **RCA:** `KpiJourneySection.tsx` called `get_bulk_employee_workflows` with plural parameter names (`p_review_periods`, `p_review_years`) but the RPC only accepts singular (`p_review_period`, `p_review_year`). PostgREST silently ignored unknown params, causing fallback to current/default workflow for all historical months.
- **Fix:** Changed to call RPC once per unique historical period with correct singular parameter names. Each previous month now resolves its own period-specific workflow configuration.
- **Impact:** All employees with historical workflow changes now correctly display the workflow that was active during each past period.
- **Affected files:** `src/components/review/KpiJourneySection.tsx`, `DOCUMENTATION.md`

### v2.16.74 — Fix: Skip-Level ViewLevel Resolved from Reporting Chain
- **RCA:** Employee 101125 (skip-level manager for HR dept) could not review KPIs at `manager_check` status for indirect report 101358. The `viewLevel` resolved to `manager` instead of `skip_level` because the `relationship` property was only set by the grid component and was missing during URL restoration, deep-links, and race conditions.
- **Fix:** Added `resolveRelationship()` helper that queries the actual reporting chain (employee → manager → manager's manager) to determine `direct` vs `indirect` relationship. Applied to all employee selection paths: grid click, deep-link with KPI, deep-link without KPI, and URL restoration.
- **Policy:** Added §62 requiring `viewLevel` to be determined from the reporting chain, not from grid-only metadata.
- **Affected files:** `src/pages/Dashboard.tsx`, `POLICY.md` (§62), `DOCUMENTATION.md`

### v2.16.76 — Feature: Daily Email Reminders for Unresponded Queries & Observations
- **New edge function:** `send-query-observation-reminders` — triggered daily at 9:00 AM IST via pg_cron.
- **Logic:** Queries `kpi_queries` (status='open') grouped by `raised_to`, and `kpi_observations` (status='open') grouped by KPI employee. Sends consolidated reminder emails per recipient.
- **New event types:** `query_response_reminder` and `observation_response_reminder` added to `send-email-notification` templates, `useEmailNotificationSettings`, `EmailNotificationSettings` UI, and `EmailTemplateEditor`.
- **Admin control:** Both events are independently toggleable in Email Settings. Respects global email enabled toggle.
- **Policy:** Added §63 governing reminder behavior, auto-stop, and consolidation rules.
- **Affected files:** `supabase/functions/send-query-observation-reminders/index.ts` (new), `supabase/functions/send-email-notification/index.ts`, `supabase/config.toml`, `src/hooks/useEmailNotificationSettings.ts`, `src/components/admin/EmailNotificationSettings.tsx`, `src/components/admin/EmailTemplateEditor.tsx`, `POLICY.md` (§63), `DOCUMENTATION.md`

### v2.16.77 — Feature: Self-Review Recall (Withdraw & Correct)
- **Feature:** Employees can recall (withdraw) their self-review submission within a configurable time window, as long as the manager hasn't reviewed it yet.
- **Admin Setting:** `self_review_recall_hours` in System Settings → General section. Options: 1, 2, 4, 6, 12, 24, 48, 72 hours, or Disabled. Default: 24 hours.
- **Eligibility:** KPI must be in `self_review` status, current user must be the KPI owner, within configured recall window, and no manager scores/remarks exist.
- **Recall Action:** Reverts KPI status to `kra_set`, clears self-review fields (achieved_value, self_score, self_rating, self_remarks, self_evidence), logs `SELF_REVIEW_RECALLED` audit action.
- **UI:** "Recall" button in SelfReviewSheet footer with countdown timer showing remaining time. Confirmation dialog warns about data that will be cleared.
- **Audit Trail:** `SELF_REVIEW_RECALLED` action added to KpiTimeline, AuditLogs, and AuditTrailReport.
- **Policy:** Added §66 Self-Review Recall Policy.
- **Affected files:** `src/hooks/useRecallSubmission.ts` (new), `src/components/review/SelfReviewSheet.tsx`, `src/pages/admin/SystemSettings.tsx`, `src/components/dashboard/KpiTimeline.tsx`, `src/pages/AuditLogs.tsx`, `src/pages/reports/AuditTrailReport.tsx`, `POLICY.md` (§66), `DOCUMENTATION.md`

### v2.17.2 — Fix: Universal 8-Stage Fallback Chain for All View Levels
- **RCA:** `getRelevantScore` in `UnifiedScorecard.tsx` used truncated per-viewLevel score chains. Manager view only checked `manager_score → self_score`, ignoring skip-level and downstream corrections. Employee 100360 showed 450/450 (manager's 5/5) despite skip-level scoring much lower.
- **Fix:** Replaced all per-viewLevel branches with a single universal 8-stage fallback chain (management → auditor → hr_pms → skip_level → manager → self) applied to ALL view levels. Every viewer now sees the most advanced assessment available.
- **Policy alignment:** Aligns with POLICY §33 authoritative scoring method and memory `architecture/pms/scoring-engine`.
- **Affected files:** `src/components/review/UnifiedScorecard.tsx`, `DOCUMENTATION.md`

### v2.17.3 — Fix: Send-Back Trigger Preserves Self-Review Data
- **RCA:** The `sync_submission_on_kra_set` database trigger (v1.45.1) cleared ALL submission fields including the employee's own `self_score`, `self_remarks`, `self_evidence_urls`, and `achieved_value` when a KPI was sent back to `kra_set`. This conflicted with the application-level surgical clear in `UnifiedScorecard.tsx` which deliberately preserved self-review data.
- **Fix:** Updated the trigger to only clear manager-and-above reviewer fields (manager, skip-level, HR PMS, auditor, management) plus final scores and NA flags. Self-review fields are now preserved so employees can see their original submission when revising.
- **Policy:** Added §67 (Send-Back Data Preservation Policy) and §68 (Workflow Reconciliation Branch Precedence) to POLICY.md.
- **Affected files:** Database migration (trigger), `POLICY.md` (§67, §68), `DOCUMENTATION.md`

### v2.17.4 — SSOT Alignment: Percolation Docs, Daily Bypass Clarification, System Attribution Fix
- **Issue 3.1 (Percolation docs):** Updated v2.15.43 entry to document the 3-way workflow-stage guard (approved/terminal/mid-workflow) and `PERCOLATION_DEFERRED` audit behavior. Previously stated trigger "automatically syncs scores and status to all sibling records" — now accurately reflects the §54 independence invariant.
- **Issue 1.2 (Daily bypass):** Added hard-lock precedence clarification to POLICY §3.6: Daily KPI governance bypass applies only to role-permission governance locks, NOT to period hard-locks (`is_period_locked`).
- **Issue 3.2 (System attribution):** Fixed `fix-corrupted-binary-scores` edge function: changed `performed_by` fallback from `"system"` string to `null`, aligning with §55 System Performer Attribution Invariant.
- **Affected files:** `supabase/functions/fix-corrupted-binary-scores/index.ts`, `POLICY.md` (§3.6), `DOCUMENTATION.md`

### v2.17.5 — Management Bulk Approve for Drafted KPIs
- **RCA**: Employee 100856 (Feb 2026) had 6 KPIs stuck at `management_review` with management scores saved as drafts (`MANAGEMENT_REVIEWED`). System-wide: 22 KPIs across 5 employees in the same state. Root cause: UX gap — reviewers use "Save Draft" but don't realize a separate "Approve" click is required.
- **Fix 1 (Bulk Approve)**: Added "Approve All Drafted" button to `ManagementScorecard.tsx`. Appears as an amber banner when drafted KPIs exist (status = `management_review`, `management_score` not null). On confirm: batch-updates each KPI to `approved`, copies `management_score` → `final_score`, logs `MANAGEMENT_APPROVED` with `bulk_approve: true` metadata.
- **Fix 2 (Draft Badge)**: Added amber "Drafted" badge in `KpiDetailsTable.tsx` action column for management viewType when a KPI has a management score but hasn't been approved. Also visible in other review views as "Draft (Mgmt)".
- **Affected files:** `src/components/review/ManagementScorecard.tsx`, `src/components/review/KpiDetailsTable.tsx`, `POLICY.md`, `DOCUMENTATION.md`

### v2.17.6 — Data Fix: Restore Bi-Monthly January 2026 KPIs
- **Incident**: The April 5 migration (`20260405...`) intended to revert premature reviews for Q1 and Feb-Mar Bi-Monthly cycles. However, the filter `frequency = 'Bi-Monthly' AND review_period = 'January'` also matched the **Dec-Jan cycle** KPIs. The Dec-Jan cycle was already complete (December 2025 ended Dec 31), so these 28 KPIs were legitimately approved and should not have been reset.
- **Impact**: 28 Bi-Monthly January 2026 KPIs across 12 employees were reset to `kra_set` with submissions deleted. 24 remained stuck; 4 were manually re-progressed.
- **Fix**: Corrective migration re-percolates scores from intact December 2025 terminal KPIs to their January siblings. Each restored KPI gets `auto_advance_reason = 'Restored: re-percolated from Dec 2025 terminal month'` and an `ADMIN_BULK_RESTORE` audit entry.
- **Policy**: Added §69 (Migration Scope Guards) requiring cycle-aware period filters for all multi-month migrations.
- **Affected files:** Database migration, `POLICY.md` (§69), `DOCUMENTATION.md`

### v2.17.7 — Fix Unscored KPI Weighted Average Deflation
- **RCA**: `getRelevantScore()` in `UnifiedScorecard.tsx` returned `0` as final fallback when all 8 score fields were NULL (empty submissions from `trg_sync_submission_on_kra_set`). The grid hook `useEmployeeScoresForPeriod.getBestScore()` correctly returned `null`. This caused score mismatches: grid showed correct weighted averages while scorecard detail deflated scores by including unscored KPIs as 0.
- **Impact**: Employees 100017 (Satyam, Feb 2026: grid=3.9, scorecard=3.4) and 101773 (Dippendu, Feb 2026: grid=3.9, scorecard=3.7). System-wide: 72 KPIs with empty submission rows at `kra_set` status.
- **Fix**: Changed `getRelevantScore` fallback from `?? 0` to `?? null`. Updated scoring loop to skip KPIs where score is `null` (same as N/A exclusion). All scoring consumers now align on the same exclusion logic.
- **Policy**: Added §70 (Unscored KPI Exclusion) formalizing that KPIs with all-null scores are excluded from weighted averages, identical to N/A treatment.
- **Affected files:** `src/components/review/UnifiedScorecard.tsx`, `POLICY.md` (§70, §5.4), `DOCUMENTATION.md`

### v2.17.8 — Cycle-Aware Multi-Month KPI Resolution
- **RCA**: The `get_cycle_months()` DB function was hardcoded to standard calendar cycles (Jan-Feb, Jan-Mar, etc.), ignoring the per-KPI `frequency_cycle_start` column. 132 out of 135 Bi-Monthly KPIs use `frequency_cycle_start = 'Feb-Mar'` (cycles: Dec-Jan, Feb-Mar, Apr-May). When January (terminal of Dec-Jan) was approved, percolation incorrectly copied scores to February (which belongs to the Feb-Mar cycle), causing cross-cycle contamination. Similarly, `enforce_frequency_lock_on_submission` and both rollover/incentive edge functions used hardcoded cycle logic.
- **Fix 1 (DB)**: Updated `get_cycle_months()` to accept optional `p_cycle_start TEXT` parameter. When provided, dynamically computes cycle boundaries from the start month and cycle length instead of using hardcoded assumptions. Falls back to original logic when NULL.
- **Fix 2 (Percolation)**: Updated `percolate_multimonth_score` trigger to pass `NEW.frequency_cycle_start` to `get_cycle_months()`, ensuring siblings are resolved from the correct cycle.
- **Fix 3 (Locking)**: Updated `enforce_frequency_lock_on_submission` trigger to read `NEW.frequency_cycle_start` for per-KPI cycle-aware locking. Falls back to `frequency_config` table when override is NULL.
- **Fix 4 (Edge Functions)**: Updated `auto-rollover-kpis` and `detect-retroactive-incentive-changes` edge functions with cycle-start-aware helpers that accept `cycleStart` parameter.
- **Policy**: Added §71 (Cycle-Aware Multi-Month KPI Resolution) mandating per-KPI cycle start resolution across all layers.
- **Affected files:** Database migration (`get_cycle_months`, `percolate_multimonth_score`, `enforce_frequency_lock_on_submission`), `supabase/functions/auto-rollover-kpis/index.ts`, `supabase/functions/detect-retroactive-incentive-changes/index.ts`, `POLICY.md` (§71), `DOCUMENTATION.md`

### v2.17.9 — Incentive Data Entry RLS Fix for Menu Override Users
- **RCA**: User 201091 (Upendra Singh, role: `manager`) was granted `admin-incentive-data` menu access override but could not see any employees on the Incentive Data Entry page. Two root causes: (1) The `profiles` table had no SELECT policy for users with `admin-incentive-data` override — managers can only see their own reports, so the employee table appeared empty. (2) The `employee_incentive_eligibility`, `incentive_vessel_rates`, and `incentive_production_rates` tables had INSERT/UPDATE/DELETE policies checking for `admin-incentive` menu key, but the user's override was for `admin-incentive-data` — a different key.
- **Fix**: Added 14 new RLS policies across 5 tables (`profiles`, `employee_incentive_eligibility`, `incentive_vessel_rates`, `incentive_eligibility_fields`, `incentive_production_rates`) gated by `has_menu_access_override(auth.uid(), 'admin-incentive-data')`. Profile access is scoped to `is_active = true` only.
- **Policy**: Added §72 (Incentive Data Entry Access for Menu Override Users) documenting the distinction between `admin-incentive` (program config) and `admin-incentive-data` (data entry) keys.
- **Affected files:** Database migration (14 RLS policies), `POLICY.md` (§72), `DOCUMENTATION.md`

### v2.18.0 — production_daily_entries RLS Fix for Menu Override Users
- **RCA**: User 201091 (Jitendra Bharti) encountered "new row violates row-level security policy" when saving daily production entries. The `production_daily_entries` table's write policy only checked for `admin` role or `incentive-config` override — the `admin-incentive-data` key was missed in the v2.17.9 fix.
- **Fix**: Added a `FOR ALL` RLS policy on `production_daily_entries` gated by `has_menu_access_override(auth.uid(), 'admin-incentive-data')`.
- **Policy**: Updated §72 table access list to include `production_daily_entries`.
- **Affected files:** Database migration (1 RLS policy), `POLICY.md` (§72), `DOCUMENTATION.md`

### v2.19.0 — compute-monthly-incentives RBAC Fix for Menu Override Users
- **RCA**: Users with `admin-incentive` menu override (e.g., Jitendra Bharti — 101715, role: `manager`) received 403 Forbidden when triggering incentive computation. The `compute-monthly-incentives` edge function only checked `user_roles` for `admin` or `hr_pms` — it did not fall back to `menu_access_user_overrides`.
- **Fix**: Added a fallback RBAC check in the edge function: if the user lacks `admin`/`hr_pms` role, query `menu_access_user_overrides` for `admin-incentive` key before rejecting. Only `admin-incentive` (not `admin-incentive-data` or `reports-incentive`) grants compute authority.
- **Policy**: Updated §72 to clarify that `admin-incentive` grants compute access in addition to configuration access.
- **Affected files:** `supabase/functions/compute-monthly-incentives/index.ts`, `POLICY.md` (§72), `DOCUMENTATION.md`

### v2.20.0 — Excel Download for Incentive Data Entry
- **Feature**: Added "Download Excel" button to the Incentive Data Entry page, next to the program selector.
- **Behavior**: Exports the currently selected program's data as `.xlsx`, adapting columns based on program type:
  - **Vessel**: Employee, Code, Rate/Vessel, Vessels Handled, Total, Remarks
  - **Production Daily**: Employee, Code, Designation, Department, Rate/Ton, Day 1–31, Total, Amount
  - **Production Target**: Sub-Unit, Category, Target, Achieved, Incentive %, Remarks
- **File naming**: `{ProgramName}_{Month}_{Year}.xlsx`
- **New file**: `src/components/incentive/IncentiveDataExport.tsx`
- **Modified files**: `UnifiedProductionDataTab.tsx`, `VesselDataEntryGrid.tsx`, `ProductionDailyGrid.tsx`, `ProductionTargetGrid.tsx`

### v2.21.0 — Company Filter Added to Incentive Employee Mapping
- **Feature**: Added a Company filter dropdown and Company column to the ProgramEmployeeMapping component.
- **Affected files**: `ProgramEmployeeMapping.tsx`, `DOCUMENTATION.md`

### v2.22.2 — Fix Menu Override Upsert RLS Violation
- **Problem**: Granting an employee-level menu override that already existed failed with "Failed to grant access" because the `menu_access_user_overrides` table had no UPDATE RLS policy, and `.upsert()` requires UPDATE when a matching row exists.
- **Solution**: Added `Admins can update menu user overrides` RLS policy for UPDATE with `has_role(auth.uid(), 'admin')` guard — same pattern as existing INSERT/DELETE policies.
- **Affected table**: `menu_access_user_overrides`

### v2.26.0 — Two-Phase Scan-Select-Repair Workflow (§74)
- **Enhanced**: Data Repair tool now uses a two-phase workflow: Scan (read-only preview) → Select → Repair (with confirmation dialog).
- **Scan mode**: Edge function returns per-KPI details (employee, KRA, KPI, achieved value, score, action, reason) without modifying data.
- **Selective repair**: Admin selects specific KPIs via checkboxes; `ConfirmDestructiveDialog` gates the repair action.
- **Downloadable reports**: Excel export available after both scan and repair phases (multi-sheet: Summary, Details, Errors).
- **Edge function**: Added `mode` ("scan"/"repair"), `kpi_ids` filtering, and `details` array to response.
- **Affected files**: `repair-orphaned-propagations/index.ts`, `DataRepairTab.tsx`

### v2.29.0 — Sibling Re-percolation Repair Tool (§75)
- **Root Cause**: "Admin Bulk Step Back" on April 5, 2026 correctly reverted prematurely reviewed multi-month KPIs but also stepped back non-terminal sibling months whose terminal siblings were already legitimately approved. The percolation trigger only fires on terminal → approved transitions, leaving these siblings permanently stuck at `kra_set`.
- **New Edge Function**: `repair-stepped-back-siblings` — Two-phase (scan/repair) tool that finds multi-month KPIs at `kra_set` where the terminal sibling in the same cycle is already `approved` with a `final_score`. Repair copies the terminal's full submission data and advances the stuck KPI to `approved`.
- **New UI Section**: "Repair Stepped-Back Siblings" collapsible section in Data Repair tab with scan → select → repair workflow, Excel export, and post-repair verification.
- **Policy §75**: Step-back operations must preserve non-terminal siblings when the terminal month is independently approved.
- **New files**: `supabase/functions/repair-stepped-back-siblings/index.ts`, `src/components/admin/SiblingRepairSection.tsx`
- **Modified files**: `DataRepairTab.tsx`, `supabase/config.toml`, `DOCUMENTATION.md`, `POLICY.md`

### v2.25.0 — Admin Data Repair UI (§74)
- **Added**: "Data Repair" section in System Settings with a "Repair Orphaned Propagations" button.
- **UI**: `DataRepairTab.tsx` — invokes the `repair-orphaned-propagations` edge function with limit 200, displays results (repaired, NULL fixed, skipped, checked, errors).
- **Affected files**: `SystemSettings.tsx`, `DataRepairTab.tsx`

### v2.24.0 — Fix Org KPI Propagation Gap (§74)
- **Root Cause**: `org_kpi_values.status` defaulted to `'approved'`, causing "Save" (without propagate) to mark records as approved. The `propagate_org_kpi_value` RPC was never invoked, leaving employee KPIs stuck at `kra_set` with no `review_submission` records.
- **Fix 1 — DB Default**: Changed `org_kpi_values.status` default from `'approved'` to `'entered'`. New records now start as "entered" and only advance through explicit propagation actions.
- **Fix 2 — Phantom Score Guard**: `KpiJourneySection.tsx` no longer uses `orgAchievedValue` as a fallback for the "Self" stage when no `review_submission` record exists. This prevents misleading phantom scores for unpropagated org KPIs.
- **Impact**: ~40+ employee KPIs across LTI and other org-level categories were affected. Use the `repair-orphaned-propagations` edge function to fix existing orphaned data.
- **Affected files**: `KpiJourneySection.tsx`, DB migration (org_kpi_values default)

- **Problem**: Users with `reports-incentive` menu override could see the Incentive Report page but got 403 on Compute/Detect edge functions, which only checked `admin-incentive`.
- **Solution**: Updated `checkIncentiveAccess()` to accept `string | string[]` for menu keys and use `.in()` filter. Both edge functions now pass `['admin-incentive', 'reports-incentive']`, so either override authorizes execution.
- **Affected files**: `incentive-auth.ts`, `compute-monthly-incentives/index.ts`, `detect-retroactive-incentive-changes/index.ts`

### v2.31.0 — Bulk Zero-Score Non-Submitters (§76)
- **Problem**: Admins had no streamlined way to assign 0 scores across all review levels when employees missed submission deadlines. Manual per-KPI intervention was time-consuming and error-prone.
- **Solution**: New `bulk-zero-score-non-submitters` edge function with scan + execute modes, plus `BulkZeroScoreSection` UI in Data Repair tab.
- **Scan logic**: Identifies KPIs stuck at `kra_set` or `self_review` for a given period/year. Excludes sent-back KPIs (open queries), N/A KPIs, and non-terminal multi-month KPIs. Optionally scans `org_kpi_values` with no data entered.
- **Execute logic**: Resolves each employee's workflow template (period-specific → global → system default). Upserts `review_submissions` with 0 for every applicable stage (self, manager, skip_level, hr_pms, auditor, management, final). Sets `kpi_status = 'locked'`, advances `kpis.status` to `approved`. For Org KPIs, sets `achieved_value = 0` and status to `propagated`.
- **Audit trail**: `kpi_audit_logs.action = 'ADMIN_BULK_ZERO_SCORE'` per KPI with `batch_id` linking all entries. `org_kpi_data_entry_logs.action = 'admin_zero_scored'` per Org KPI. Admin remarks visible in `auto_advance_reason` across all review levels.
- **Safety**: Elevated confirmation requires typing "ZERO". Prior batch detection warns if the same period was already zero-scored. Post-execution verification confirms KPIs at `approved` and submissions at 0.
- **Workflow awareness**: Uses `workflow_config` → `workflow_templates` resolution (period-specific → global → default) to determine which stages to zero-score per employee.
- **New files**: `supabase/functions/bulk-zero-score-non-submitters/index.ts`, `src/components/admin/BulkZeroScoreSection.tsx`
- **Modified files**: `DataRepairTab.tsx`, `DOCUMENTATION.md`, `POLICY.md`

### v2.22.0 — Incentive Edge Function RBAC Centralized (§73)
- **Problem**: Both `compute-monthly-incentives` and `detect-retroactive-incentive-changes` hardcoded `['admin', 'hr_pms']` as allowed roles. Users with `employee` or `manager` roles granted `admin-incentive` menu overrides were blocked with 403 on the detect function (compute had a partial fix).
- **Solution**: Created shared auth helper `supabase/functions/_shared/incentive-auth.ts` with `checkIncentiveAccess()` — a two-tier authorization check (privileged roles → menu override fallback). Both edge functions now import and use this helper.
- **Key benefit**: Any role (employee, manager, etc.) can access incentive functions if granted the `admin-incentive` menu override via System Settings → Menu Access → User Overrides. No code changes needed to grant/revoke access.
- **New file**: `supabase/functions/_shared/incentive-auth.ts`
- **Modified files**: `compute-monthly-incentives/index.ts`, `detect-retroactive-incentive-changes/index.ts`, `POLICY.md` (§73), `DOCUMENTATION.md`

### v2.31.1 — Fix 401 on bulk-zero-score-non-submitters (config.toml)
- **Root Cause**: The `bulk-zero-score-non-submitters` edge function was missing from `supabase/config.toml`. Without an explicit entry, it defaulted to `verify_jwt = true`, causing the Supabase gateway to reject requests at the infrastructure level before the function's internal `requireAdminUser()` auth could run.
- **Fix**: Added `[functions.bulk-zero-score-non-submitters]` with `verify_jwt = false` to `config.toml`, consistent with all other admin edge functions.
- **Preventive**: This is the third instance of a config.toml omission causing a 401. Added mandatory checklist below.

### v2.31.2 — Admin edge auth forwarding hardening
- **Root Cause**: The admin tools were receiving a valid bearer token from the browser, but shared admin auth used session-based identity resolution that could still fail with `Auth session missing!` in backend execution paths.
- **Fix**: Hardened `requireAdminUser()` to validate the explicit bearer token via claims, added a deployment-sync marker to `bulk-zero-score-non-submitters`, and switched the Bulk Zero-Score UI to explicit authenticated `fetch()` via a shared helper.
- **Regression Protection**: Added `adminEdgeFunction.test.ts` to verify bearer token forwarding and unauthenticated failure handling.

### v2.33.4 — UX: Accept "0" and "zero" in bulk zero-score confirmation
- **Root Cause**: The confirmation field required the exact uppercase string `ZERO`, but users naturally typed `0` (digit) or `zero` (lowercase), leaving the execute button permanently disabled.
- **Fix**: Relaxed the confirmation check to accept `ZERO`, `zero`, or `0` (case-insensitive). Updated the label to "Type ZERO or 0 to confirm".
- **Affected files**: `src/components/review/EmployeeBulkZeroScoreDialog.tsx`

### v2.33.1 — Fix enum type mismatch in bulk zero-score ratings
- **Root Cause**: The `rating_level` column on `review_submissions` is a Postgres enum (`red | yellow | green | blue`). The bulk zero-score function assigned numeric `0` to all 7 `*_rating` fields, causing `invalid input value for enum rating_level: '0'` on every upsert — 100% execute failure.
- **Fix**: Replaced all `*_rating = 0` assignments with `*_rating = 'red'` (the lowest valid enum value, semantically correct for a zero score).
- **Preventive**: Added to Edge Function Checklist: "Verify enum column types before assigning literal values — never use numeric literals for enum fields."
- **Affected files**: `supabase/functions/bulk-zero-score-non-submitters/index.ts`

### v2.33.0 — Employee-level Bulk Zero-Score on dashboard
- **Feature**: Admins can now zero-score non-submitted KPIs for a specific employee directly from the Employee Dashboard (UnifiedScorecard), without navigating to the Data Repair tab.
- **UI**: A "Zero-Score" button (Ban icon) appears in the KPI Details header for admin users. Opens `EmployeeBulkZeroScoreDialog` with Scan → Select → Confirm ("ZERO") → Execute flow.
- **Edge Function**: `bulk-zero-score-non-submitters` now accepts an optional `employee_id` parameter to scope scan/execute to a single employee.
- **New files**: `src/components/review/EmployeeBulkZeroScoreDialog.tsx`
- **Modified files**: `src/components/review/UnifiedScorecard.tsx`, `supabase/functions/bulk-zero-score-non-submitters/index.ts`

### v2.31.6 — Force redeploy after stale kpiErr fix
- **Root Cause**: The v2.31.5 code fix (removing orphaned `kpiErr` reference) was applied to the repo but the edge function was never redeployed. The Supabase runtime continued executing the old compiled version, causing persistent 500 errors on every scan attempt.
- **Fix**: Added deployment sync comment to force fresh deployment. Verified via edge function logs that the new code is active.
- **Preventive**: Added to Edge Function Checklist: "Confirm deployment via log inspection after every fix" and "After refactoring queries, search for all prior variable references to ensure none are orphaned."
- **Affected files**: `supabase/functions/bulk-zero-score-non-submitters/index.ts`

### v2.33.6 — Normalized KPI key matching + owner-scoped progress bar
- **Root Cause (Bug 1)**: Org KPI Data Entry used exact string matching (`category_id||kra_name||kpi_name`) to join ownership, template, and value data. Slight whitespace/casing differences between tables (e.g., double spaces, "0" vs "NO") caused `getKpiStatus()` to return `'pending'` for KPIs that actually had entered data, resulting in incorrect progress counts (e.g., 27 propagated instead of 33).
- **Root Cause (Bug 2)**: `progressData` was computed from global `frequencyFilteredKpis` instead of being scoped to the selected data owner, so the progress bar and status filter chips showed global counts even when a specific owner tab was selected.
- **Fix (Bug 1)**: Introduced `nk()` (normalize-key) utility that lowercases, collapses whitespace, and trims strings. Applied across all key construction in `OrgKpiDataEntry.tsx`, `useOrgLevelKpis.ts`, and `useOrgKpiDataOwner.ts` for consistent matching.
- **Fix (Bug 2)**: Added `progressScopedKpis` memo that respects `selectedOwnerId` filter, and changed `progressData` to compute from it instead of the global list.
- **Affected files**: `src/pages/admin/OrgKpiDataEntry.tsx`, `src/hooks/useOrgLevelKpis.ts`, `src/hooks/useOrgKpiDataOwner.ts`


- **Root Cause**: Line 169 of `bulk-zero-score-non-submitters/index.ts` contained `if (kpiErr) throw kpiErr;` — a stale reference left behind after the query was refactored from a single fetch to batched fetching (using `bErr`). Since `kpiErr` was never declared in the scan-mode scope, every scan attempt threw a `ReferenceError` and returned 500.
- **Fix**: Deleted the orphaned line. Error handling is already covered by `if (bErr) throw bErr` inside the fetch loop.
- **Affected files**: `supabase/functions/bulk-zero-score-non-submitters/index.ts`

### v2.31.3 — Fix kpis.is_na column reference error
- **Root Cause**: The `bulk-zero-score-non-submitters` function referenced `kpis.is_na` in both SELECT and WHERE clauses, but `is_na` lives on `review_submissions`, not on `kpis`. This caused a Postgres 500 error (`column kpis.is_na does not exist`).
- **Fix**: Removed `is_na` from the `kpis` query. Added a secondary lookup on `review_submissions` to exclude N/A-marked KPIs. Also removed the invalid `is_na` filter from the `org_kpi_values` query (that table does have the column, but the filter was applied without selecting it in the column list, causing ambiguity).
- **Affected files**: `supabase/functions/bulk-zero-score-non-submitters/index.ts`

---

## New Edge Function Checklist (Mandatory)

Every new edge function **must** complete all of these steps before deployment:

1. **Create `supabase/functions/<name>/index.ts`** — the function code
2. **Add `[functions.<name>]` to `supabase/config.toml`** — with `verify_jwt = false` (for functions using in-code auth via `requireAdminUser()` or `checkIncentiveAccess()`)
3. **Use shared auth helpers** — `requireAdminUser(req)` for admin tools, `checkIncentiveAccess()` for incentive functions
4. **Include CORS headers** in all responses (success, error, OPTIONS)
5. **Update `DOCUMENTATION.md`** — add a version entry describing the function
6. **Update `POLICY.md`** — if the function implements or affects a business policy
7. **Force redeploy after auth/config changes** — shared auth helpers and `config.toml` changes are only effective after the affected function is redeployed
8. **Confirm deployment via log inspection** — after every fix, check edge function logs to verify the new code path is active; never assume saving the file triggers a deploy
9. **Search for orphaned variable references** — after refactoring queries, search for all prior variable references to ensure none are left behind

⚠️ **Omitting step 2 causes a 401 Unauthorized at the gateway level.** The function boots but never receives the request. Logs show `Auth session missing!` even though the client sends a valid token.

---

### v2.36.0 — Multi-Period Scorecard Display (YTD/QTD/Custom) (2026-04-13)

- **Feature**: Wired `periodRanges` through to `UnifiedScorecard` so YTD, QTD, and Custom period modes now actually query and display multi-month KPI data
- **Filter logic**: Replaced single-month filter with `periodSet` lookup built from `periodSelection.periodRanges`, supporting cross-year ranges
- **Read-only safety**: Multi-month mode disables all review actions (approve, send-back, submit) to prevent cross-period workflow mutations; users must switch to single-month mode to take actions
- **Visual indicator**: Added amber badge showing mode label and month range (e.g., "YTD: Jan–Apr 2026 (Read-Only)") when viewing cumulative data
- **Regression safety**: Single-month mode (`periodRanges` with 1 entry) produces identical behavior to previous code
- **Modified files**: `src/components/review/UnifiedScorecard.tsx`

---

### v2.35.0 — Target & Level-wise Actual Values in KPI Scorecard Detail Export (2026-04-13)

---

### v2.33.8 — Multi-Factor Compliance KPI Data Entry + All-Level Visibility (2026-04-11)

- **Feature**: Added 4 compliance sub-factor reference fields for the "Implementation of common" compliance KPI in Org KPI Entry
- **Sub-factors**: Policy Compliance (Yes/No), Submission Date (auto-fetched), Policy Training (Yes/No), Other Observation (numeric)
- **Admin entry**: Sub-factor columns appear inline in `OrgKpiScopedEntryTable` when viewing the compliance KPI. HR enters values per employee; Achieved remains manual
- **All-level visibility**: Read-only "Compliance Factors" banner in `KpiJourneySection` visible to all roles (Employee, Manager, Auditor, HR PMS, Management, Skip-Level, Admin)
- **Database**: Added `sub_factors jsonb DEFAULT NULL` to `org_kpi_values`
- **Submission date auto-fetch**: System queries employee KPIs (excl. org-level, sent-back, not-due frequency) and returns latest submission date or pending count
- **Backward compatible**: Banner hidden when `sub_factors` is null
- **New files**: `src/hooks/useComplianceSubFactors.ts`
- **Modified files**: `src/components/admin/OrgKpiScopedEntryTable.tsx`, `src/components/admin/OrgKpiEntryCard.tsx`, `src/hooks/useOrgKpiValues.ts`, `src/components/review/KpiJourneySection.tsx`

### v2.33.7 — Employee Self-Review Compliance Penalty (2026-04-11)

- **Feature**: Added Employee Self-Review Compliance Penalty system
- **What it does**: When employees fail to complete all self-reviews by a configurable deadline, the system zero-scores ALL their pending KPIs and additionally zeros their "Implementation of common - policies / systems / processes" compliance KPI
- **Configurable exclusions**: Admin can toggle on/off exclusions for Org-level KPIs, Sent-back KPIs, and frequency-based KPIs (Quarterly, Bi-Monthly, Half-Yearly, Yearly) not currently due
- **Settings**: Configurable deadline day, system remark, and enable/disable toggle stored in `system_settings`
- **Rollback**: Full batch rollback support with audit trail
- **Audit**: All actions logged with `EMPLOYEE_COMPLIANCE_PENALTY` and `COMPLIANCE_PENALTY_ROLLBACK` actions in `kpi_audit_logs`
- **New files**: `src/hooks/useCompliancePenalty.ts`, `src/components/admin/CompliancePenaltyTab.tsx`
- **Modified files**: `src/pages/admin/PendingSelfReviews.tsx` (new tab), `POLICY.md` (§82)
- **Settings**: Configurable deadline day, system remark, and enable/disable toggle stored in `system_settings`
- **Rollback**: Full batch rollback support with audit trail
- **Audit**: All actions logged with `EMPLOYEE_COMPLIANCE_PENALTY` and `COMPLIANCE_PENALTY_ROLLBACK` actions in `kpi_audit_logs`
- **New files**: `src/hooks/useCompliancePenalty.ts`, `src/components/admin/CompliancePenaltyTab.tsx`
- **Modified files**: `src/pages/admin/PendingSelfReviews.tsx` (new tab), `POLICY.md` (§82)

### v2.33.9 — Bug Fix: Compliance Sub-Factors Save Handler
- **Bug**: `handleCardSave` in `OrgKpiDataEntry.tsx` did not include `sub_factors` in the save payload, so HR-entered compliance sub-factor values were lost on save
- **Fix**: Added `sub_factors` mapping from `sv.subFactors` to the `toSave` object in the scoped values loop, and updated the type definition to include `subFactors`
- **Modified files**: `src/pages/admin/OrgKpiDataEntry.tsx`

### v2.34.0 — Bug Fix: Password Rollout 401 Unauthorized (2026-04-13)
- **Bug**: Password Rollout edge function returned 401 Unauthorized despite the user being authenticated and having admin role
- **Root Cause**: `usePasswordRolloutMutation` used `supabase.functions.invoke()` (SDK method) which does not reliably forward the `Authorization` header. All other admin edge functions use `invokeAdminEdgeFunction()` (explicit `fetch` with headers).
- **Fix**: Replaced SDK invocation with `invokeAdminEdgeFunction` from `src/lib/adminEdgeFunction.ts`, aligning with project security policy
- **Modified files**: `src/hooks/usePasswordRollout.ts`, `POLICY.md` (§85)

### v2.35.0 — Bug Fix: Reset Password & Update Email 401 Unauthorized (2026-04-13)
- **Bug**: Admin Reset Password (generate link / set new password) and Update User Email returned 401/Invalid token errors on `/admin/users`
- **Root Cause**: `UserManagement.tsx` still used `supabase.functions.invoke()` for `reset-password` and `update-user-email`. The edge functions used inline `supabaseAdmin.auth.getUser(token)` instead of the shared `requireAdminUser()` helper. `config.toml` had `verify_jwt = true` for `reset-password`.
- **Fix**: (1) Replaced all SDK invocations with `invokeAdminEdgeFunction`. (2) Refactored both edge functions to use `requireAdminUser()`. (3) Set `verify_jwt = false` for `reset-password` in `config.toml`.
- **Modified files**: `src/pages/admin/UserManagement.tsx`, `supabase/functions/reset-password/index.ts`, `supabase/functions/update-user-email/index.ts`, `supabase/config.toml`

### v2.36.0 — Bug Fix: Observation Notification Deep-Link Opens KPI Details Sheet (2026-04-13)
- **Bug**: "Open in App" on observation notifications for admins/reviewers navigated to the employee dashboard but did not open the specific KPI details sheet.
- **Root Cause**: `UnifiedScorecard.tsx` auto-open logic only handled self mode. Reviewer modes (`team`, `audit`, `management`, `hr_pms`) received `autoOpenKpiId` but never set `selectedKpi` or opened `reviewSheetOpen`.
- **Fix**: Added reviewer-mode auto-open effect in `UnifiedScorecard.tsx` that matches `autoOpenKpiId` against loaded KPIs and opens the review sheet. Handles cross-period KPIs by switching period selection.
- **Modified files**: `src/components/review/UnifiedScorecard.tsx`

### v2.37.0 — Configurable SLA Target + Fix SLA 0% vs 100% Inconsistency (2026-04-15)
- **Bug**: Inbox Health Score showed SLA 0% while My Productivity showed 100% — inconsistent defaults when no resolved queries exist.
- **Root Cause**: Health Score counted all resolved queries (hardcoded 2-day target), My Productivity only counted queries received by user and defaulted to 100% when none existed.
- **Fix**: Made SLA target configurable via `query_sla_target_days` workflow setting (default 2 days, range 1–30). Both components now show "N/A" when no resolved queries exist. Health score uses neutral base (80) instead of penalizing with 0% SLA when no data.
- **Modified files**: `src/hooks/useWorkflowSettings.ts`, `src/components/inbox/InboxInsights.tsx`, `src/components/inbox/PersonalProductivityInsights.tsx`

### v2.38.0 — Incentive Report: Pagination & Select-All Enhancement (2026-04-15)
- **Problem**: Incentive report hardcoded `slice(0, 50)` — records beyond 50 were invisible with no navigation. Select-all only covered visible 50 rows.
- **Fix**: Added full pagination (page size selector: 25/50/100/All), Prev/Next navigation, Gmail-style "Select all X records" banner when all page rows are selected.
- **Modified files**: `src/components/incentive/MonthlyIncentiveTable.tsx`

### v2.39.0 — Sticky Table Headers for Menu Access & Profile Tables (2026-04-15)
- **Problem**: Table headers scrolled out of view on long tables (Role Access, Employee Overrides, Profiles, Assignments).
- **Fix**: Applied `sticky top-0 z-10 bg-background` to `TableHeader` with `max-h-[60vh] overflow-auto` container — headers stay pinned like Excel freeze panes.
- **Modified files**: `src/components/admin/MenuAccessTab.tsx`, `src/components/admin/AccessProfilesManager.tsx`

### v2.63.0 — Custom Report Builder (2026-04-16)
- **Feature**: Full Report Builder in System Settings with three sections: Report Sequence, Customize Columns (pre-built), and Custom Reports CRUD.
- **Custom Reports**: Admin can create reports by selecting fields from Employee, Organization, KPI, Scores, Achieved Values, and Workflow data sources. Supports field aliases, drag-and-drop ordering, filter rules, role-based access, and Excel export.
- **Report Sequencing**: Drag-and-drop reorder of all reports (built-in + custom) on Reports Hub. Persisted via `report_display_order` system setting.
- **Database**: New `custom_reports` table with RLS (admin full CRUD, role-filtered read for active reports).
- **New files**: `src/lib/reportFieldRegistry.ts`, `src/hooks/useCustomReports.ts`, `src/hooks/useReportColumnOverrides.ts`, `src/components/admin/ReportBuilderTab.tsx`, `src/components/admin/ReportSequenceConfig.tsx`, `src/components/admin/ReportFieldPicker.tsx`, `src/components/admin/ReportFilterConfig.tsx`, `src/pages/reports/CustomReport.tsx`
- **Modified files**: `src/pages/admin/SystemSettings.tsx`, `src/pages/reports/ReportsHub.tsx`, `src/App.tsx`

### v2.64.0 — Disclose Smart Period Detection auto-switch in reviewer scorecard (2026-04-20)
- **Problem (RCA)**: Auditor saw "no pendency" on the outside Audit Panel grid card for Arun Goswami while inside the scorecard saw "Pending: 4". Outside grid is filtered strictly by the panel-selected period (April 2026, all KPIs at `kra_set` → 0 pending). Inside scorecard auto-switched to March 2026 via Smart Period Detection (where 4 KPIs sit at `self_review`). Both technically correct; the period mismatch was invisible.
- **Fix**: Added optional `autoSwitchedFrom` field to `PeriodSelection`. `EmployeeSelectorGrid.handleEmployeeClick` now records the user's original panel period when it auto-switches. `ReviewPeriodSelectorEnhanced` clears it on every user-initiated change. New `PeriodAutoSwitchBanner` shown at the top of `UnifiedScorecard` when displayed period ≠ panel-selected period: "Showing March 2026 (auto-switched — KPIs found here). You selected April 2026 …".
- **New files**: `src/components/review/PeriodAutoSwitchBanner.tsx`
- **Modified files**: `src/components/ui/ReviewPeriodSelectorEnhanced.tsx`, `src/components/review/EmployeeSelectorGrid.tsx`, `src/components/review/UnifiedScorecard.tsx`
- **Note**: `AuditScorecard.tsx` and `ManagementScorecard.tsx` are dead code (no call sites) — only `UnifiedScorecard` is in use, so the banner only needed to be added there.

### v2.64.1 — Eliminate flicker on reviewer panel switch (2026-04-20)
- **Problem (RCA)**: Switching from Team Review → HR PMS / Audit / Management produced a visible flicker (Team grid → grey skeleton → new grid). Cause: `useProfilesByWorkflowStage` was a cold cache for the new stage, so `isLoading=true` collapsed the entire grid into a skeleton placeholder for 200–800ms. Team view didn't flicker because `useProfiles` was already cached.
- **Fix**: Added `placeholderData: keepPreviousData` to `useProfilesByWorkflowStage` so the previous panel's data stays rendered during stage swaps. Softened skeleton condition in `EmployeeSelectorGrid` to `isLoading && !hasAnyData` (true cold start only). Added a discreet top-right "Updating…" spinner during background fetch and a `min-h-[600px]` wrapper to prevent layout-collapse jumps.
- **Modified files**: `src/hooks/useOrganization.ts`, `src/components/review/EmployeeSelectorGrid.tsx`

### v2.64.2 — Reviewer grid pagination for large workforces (2026-04-20)
- **Problem (RCA)**: Reviewer dashboards rendered every matching employee in a single grid (1500+ cards on Audit / HR PMS panels for >2500-employee orgs). Each card runs per-card workflow + score + KPI-count derivations, producing long initial JS tasks, heavy memory, and laggy search/filter typing.
- **Fix (Layer 1 — render-only pagination)**: `EmployeeSelectorGrid` now slices the full sorted/filtered list into pages (default 24, configurable 12 / 24 / 48 / 96) and renders only the current page. Search, sort (incl. urgency), filters, and aggregate counts continue to operate on the **full** filtered set so totals and prioritization are unaffected. Page and page-size are URL-persisted (`?page=`, `?size=`) per `dashboard-view-persistence`. Page resets to 1 on any filter / sort / view change. Audit grouped view paginates the combined list (assigned-first ordering preserves "My Assignments on page 1").
- **Skipped (Layer 2)**: Restricting `useBulkEmployeeWorkflows` / `useEmployeeScoresForPeriod` to paged ids was rejected — `workflowMap` is consumed by `displayMembers` status filtering and aggregate stats, so windowing it would produce incorrect pending counts for off-page employees. Layer 1 already eliminates the render-side bottleneck (the dominant cost).
- **Modified files**: `src/components/review/EmployeeSelectorGrid.tsx`, `src/hooks/useUrlFilterState.ts` (added `page`/`size` to `FILTER_PARAM_NAMES` so "Clear All" resets pagination)

### v2.64.4 — Filter typing teleports user to previous panel — fixed (2026-04-20)
- **Problem (RCA)**: Admin on HR PMS (or Audit / Management / Pending*) panel types one letter into "Search Employees…" and the dashboard snaps back to the previous view (Self / Pending Self). Three interacting bugs in `Dashboard.tsx`:
  1. Effect A ("Initialize from URL") depended on the entire `searchParams` object, so it re-ran on every `q`/`dept`/`page` keystroke and could re-apply a stale `view` during a `setSearchParams` updater race with `useUrlFilterState`.
  2. `handleModeChange` cleared filter params via `queueMicrotask` but did NOT clear the stale `employee` URL param. The "Restore selected employee" effect then re-pulled the previous panel's employee back into state.
  3. `deepLinkProcessedRef` was only set during deep-link processing on mount, never re-armed on manual mode change, leaving restore logic hot.
- **Fix**: (1) Narrowed Effect A's dependency to `searchParams.get('view')` only, with a `mappedMode !== viewMode` guard. (2) `handleModeChange` now clears `employee` alongside `FILTER_PARAM_NAMES` in a single synchronous batched `setSearchParams` write (dropped `queueMicrotask`). (3) `handleModeChange` sets `deepLinkProcessedRef.current = true` to lock out late restore effects.
- **Modified files**: `src/pages/Dashboard.tsx`

### v2.64.5 — Discoverability hint for fully reviewed employees in paginated grids (2026-04-20)
- **Problem (RCA)**: After v2.64.2 introduced 24-per-page pagination, urgency sort (`badge1` DESC) pushes employees with no pending items to the back pages. On large reviewer pools (e.g. HR PMS over 2,500 active employees), a fully-reviewed employee like 101178 (Sanjeeb Kumar Jena, 27/27 KPIs approved for Jan 2026) lands on page ~80+ and appears "missing" to reviewers who only check page 1. Underlying data, RLS, and sort logic are correct — only discoverability fails.
- **Fix**: `EmployeeSelectorGrid` now surfaces (a) a contextual info pill above the grid when `statusFilter==='all'` AND `totalPages > 1` AND there are reviewed employees in the back pages, explaining the urgency sort and quoting the count of fully-reviewed employees on later pages, with a one-click **"Show only Reviewed"** button that maps each viewLevel to its completed status filter (team/skip/hr_pms → `reviewed`, audit → `forwarded`, management → `approved`); and (b) a refined pagination footer reading `Page X of Y · Showing N–M of T employees` for unambiguous position context. No changes to data fetching, sort algorithm, or workflow logic.
- **Modified files**: `src/components/review/EmployeeSelectorGrid.tsx`

### v2.64.11 — Reviewer dashboard stat cards: correct denominators + tooltips (2026-04-20)
- **Problem (RCA)**: The v2.64.8 "period-aware Total Employees" recompute over-narrowed the denominator for HR PMS / Audit / Management views by counting only employees whose CURRENT KPI status sat at or before the reviewer's stage. Employees whose KPIs had already advanced past that stage (e.g. management_review, approved) were excluded from both "Total Employees" and "Reviewed", producing dashboards that under-reported actual workload (HR PMS Mar 2026: UI showed 14 employees / 595 KPIs / 185 reviewed against DB truth of 107 / 1,758 / 739).
- **Fix**: In `EmployeeSelectorGrid.tsx` `stats` recompute — (a) **Total Employees** now equals unique employees in `relevantKpis` (i.e. anyone in the filtered, workflow-eligible roster with ≥1 KPI in the period), regardless of their current stage; (b) **Reviewed** for HR PMS / Audit / Management now counts KPIs whose stage-specific signature column is populated (`hr_pms_score`, `audit_score`, `management_score`) so that work already advanced past the stage is still credited to the reviewer; (c) **Total KPIs** continues to reflect the full period total for the visible roster; (d) `StatCard` accepts an optional `tooltip` prop and renders an `Info` icon plus Radix Tooltip; all five cards on HR PMS / Audit / Management dashboards now disclose their precise definition. Skip-Level stats also switched from `demographicFilteredMembers.length` to period-presence for consistency.
- **Modified files**: `src/components/review/EmployeeSelectorGrid.tsx`

### v2.66.0 — Atomic Org KPI propagation RPC (Phase A3, 2026-04-21)
- **Problem (RCA)**: `propagate_org_kpi_value` advanced status without verifying `ROW_COUNT`, so KPIs already past `kra_set` silently incremented the success counter. Root cause for Buckets B, C, F (87 silent failures).
- **Fix**: Both overloads now use guarded `UPDATE … WHERE status='kra_set'` + `GET DIAGNOSTICS ROW_COUNT`, return `{propagated_count, skipped_count, details, skipped[]}`, emit `PROPAGATION_PARTIAL` audit logs.
- **Modified files**: `supabase/migrations/20260421173624_*.sql`, `src/hooks/usePropagateOrgKpiValue.ts`

### v2.66.1 — Pre-flight Org KPI propagation preview (Phase A4, 2026-04-21)
- **Fix**: New read-only RPC `preview_org_kpi_propagation(uuid[])` + `PropagationPreviewDialog` showing `total/will_advance/will_skip` breakdown before the live call. `OrgKpiDataEntry.tsx` gates Save & Propagate behind the preview.
- **Modified files**: `supabase/migrations/20260421173856_*.sql`, `src/hooks/usePreviewOrgKpiPropagation.ts`, `src/components/admin/PropagationPreviewDialog.tsx`, `src/pages/admin/OrgKpiDataEntry.tsx`

### v2.66.2 — Reviewer "Request Revision" action (Phase B1, 2026-04-21)
- **Problem (Gap #1)**: When a reviewer rejected an Org KPI because the source value was wrong, only the rejected employee rolled back; DO was never notified, OKV stayed `propagated`.
- **Fix**: New OKV columns (`last_revision_reason`, `last_revision_requested_by`, `last_revision_requested_at`, `revision_count`). New atomic RPC `request_org_kpi_revision(p_kpi_id, p_reason)` reverts OKV → `draft`, cascades early-stage employees back to `kra_set` (clearing scores, preserving evidence), flags late-stage employees with `ORG_KPI_REVISION_FLAGGED`. SendBackDialog adds an "Issue is with the source value" toggle on `is_org_level=true` KPIs.
- **Modified files**: `supabase/migrations/20260421174309_*.sql`, `src/hooks/useRequestOrgKpiRevision.ts`, `src/components/review/SendBackDialog.tsx`

### v2.66.3 — Late-joiner Org KPI auto-pull trigger (Phase B2, 2026-04-21)
- **Problem (Gap #3)**: Employees onboarded after Propagate received a `kpis` row but no submission — ghost assignments stuck at `kra_set`.
- **Fix**: New flag `app_settings.enable_org_kpi_autopull` (default off). Helper `compute_org_kpi_score_for_kpi(uuid, numeric)`. Trigger `trg_autopull_propagated_org_kpi` on `kpis AFTER INSERT` resolves OKV via natural-key lookup with most-specific scope (employee → department → org-wide), pre-fills submission, advances to `self_review`, audit-logs `ORG_KPI_AUTOPULLED_FOR_LATE_JOINER`. Honors `is_na`. New `backfill_late_joiner_org_kpis(p_dry_run)` admin RPC + Bucket K card in Data Repair for historical rows.
- **Modified files**: `supabase/migrations/20260421_*.sql`, `src/hooks/useLateJoinerBackfill.ts`, `src/components/admin/LateJoinerBackfillSection.tsx`, `src/components/admin/DataRepairTab.tsx`

### v2.66.4 — Phase A1 + A2 Execution Report (2026-04-21)
- **Context**: Historical-data sweep for Buckets B, C, F using the same logic as `repair-orphaned-propagations` edge function, executed server-side with full audit trail.
- **Pre-state**: Bucket B (orphaned org-level children) = 20 repairable / 809 total at `kra_set`; Bucket C = 0; Bucket F (silent propagation failures) = 4.
- **Phase A1 (Buckets B + C)**: Created 20 `review_submissions` from matching `propagated`/`approved` OKV values, advanced 20 KPIs from `kra_set` → `self_review`, scored via `compute_org_kpi_score_for_kpi()`. Audit action: `PROPAGATION_BACKFILL` (20 entries, `tool=bucket_bc_repair`, `pass=phase_a1`, `performed_by=NULL`).
- **Phase A2 (Bucket F)**: Reset 4 OKVs from `propagated` → `draft` so the Data Owner can re-propagate via the new atomic RPC (v2.66.0). Affected period: February 2026. Audit action: `PROPAGATION_FAILURE_RESET` (4 entries, `tool=bucket_f_repair`, `pass=phase_a2`, `performed_by=NULL`). Reset OKV IDs:
  - `29bf640c-02ca-491e-971f-6d5042d741d3` — Achieve Power generation target from WHRB 1050 TPD (Production & Operations / Achieve organization's production target)
  - `96a62c9b-0f80-47ed-a0e2-0f1eb4af538f` — Enhance Campaign life of 1050 TPD (Maintenance & Reliability / Enhance Campaign Life)
  - `6d344293-c067-4d76-a803-4035100b2713` — Power generation from 45 MWh/AFBC (Production & Operations / Achieve organization's production target)
  - `9571e37b-99ec-4c0b-87e6-82eb26cabea8` — Achieve production target from 3X100 TPD (Production & Operations / Achieve organization's production target)
- **Post-state**: Bucket B remaining = 0, Bucket F remaining = 0. Verification confirmed against the same census query used pre-execution.
- **Reversibility**: Every change recorded in `kpi_audit_logs`; the existing Step Back tool can revert any individual row by referencing the prior-state JSON in the audit entries.
- **Follow-up**: The 4 reset OKVs need to be re-propagated by the Data Owner (or by an admin via Org KPI Data Entry → Propagate) to advance the corresponding employees through the workflow. The new atomic RPC will succeed-or-rollback-cleanly, so a silent failure cannot recur.

### v2.66.5 — Org KPI Scope Cascade + OKV Migration + Auto-pull Activation (2026-04-21)
- **Goal**: Close 3 governance gaps identified in the Q&A audit:
  (1) scope changes don't cascade to future open periods,
  (2) existing OKV values are silently orphaned when scope changes,
  (3) `enable_org_kpi_autopull` was still off so late-joiners weren't auto-filled.
- **DB additions**:
  - Table `okv_migration_history` — archives every OKV row touched by a scope change so admins have a revert trail (RLS: admin read/insert only).
  - Function `migrate_okv_on_scope_change(...)` — handles the 6-way transition matrix:
    * `employee → department` / `employee → organization` / `department → organization` → AVG-aggregate, inherit highest status (`approved` > `propagated` > `draft`).
    * `organization → department` / `organization → employee` / `department → employee` → split into seeded `draft` rows for each target owner.
  - RPC `change_org_kpi_scope_cascading(category_id, kra_name, kpi_name, base_period, base_year, new_scope, cascade_forward, dry_run, triggered_by)` — applies the scope change to the base period and (if `cascade_forward=true`) every unlocked future period in the same fiscal year (July→June). Returns per-period results and a list of locked periods that were skipped. Audit-logs `ORG_KPI_SCOPE_CASCADED` with the OKV migration summary in metadata.
- **Frontend**:
  - `useChangeOrgKpiScope` rewritten to call the new RPC with `cascadeMode: 'current_only' | 'current_and_future'`.
  - New hook `useScopeCascadePreview` for the dry-run preview.
  - New `OrgKpiScopeChangeDialog` — replaces the silent dropdown action with: (a) aggregation/split warning, (b) "Apply to all open future periods" checkbox, (c) live preview list of affected periods + skipped locked periods.
  - `OrgKpiMappingDashboard` now opens the dialog instead of mutating directly.
- **Auto-pull activation**: `app_settings.enable_org_kpi_autopull` flipped to `true`. Trigger `trg_autopull_propagated_org_kpi` confirmed deployed. Late-joiner `kpis` inserts now auto-pull matching propagated OKV values.
- **Modified files**: `supabase/migrations/<timestamp>_org_kpi_scope_cascade.sql`, `src/hooks/useOrgKpiManagement.ts`, `src/components/admin/OrgKpiScopeChangeDialog.tsx` (new), `src/components/admin/OrgKpiMappingDashboard.tsx`, `app_settings` data update.
- **Reversibility**: `okv_migration_history` retains every original OKV payload as JSONB so any aggregation can be manually unwound. Splits leave the new draft OKVs visible to Data Owners — declining/clearing them returns to the prior shape.

### v2.66.6 — Auto-Inherit Org KPI Status on KPI Creation (2026-04-21)
- **Goal**: Close Scenario 2 of the Q&A audit — when an admin creates a new KPI for an employee mid-month and that KPI matches an existing Org KPI signature (same Category + KRA + KPI name + period + year), it must automatically become Org-level so the data owner is implicitly mapped and (combined with v2.66.5's auto-pull) the achieved value is pre-filled.
- **DB additions**:
  - Column `app_settings.enable_org_kpi_auto_inherit boolean NOT NULL DEFAULT true` — feature flag for the new trigger.
  - Function + trigger `trg_autoinherit_org_level_on_kpi_insert` (BEFORE INSERT on `kpis`) — sets `NEW.is_org_level = true` and inherits `org_level_scope` from a matching sibling KPI when one exists. Flag-gated.
  - Function + trigger `trg_audit_org_level_inheritance` (AFTER INSERT on `kpis`) — records `ORG_KPI_AUTO_INHERITED` audit log entries (system performer = NULL) with the source KPI ID and inherited scope, but only for rows that were inheritors (not originators).
  - RPC `reconcile_org_kpi_inheritance(p_dry_run boolean)` — admin-only; finds existing KPIs with `is_org_level=false` that have an Org-level sibling and bulk-promotes them in dry-run-then-apply fashion. Each update is audit-logged with `ORG_KPI_INHERITANCE_RECONCILED`.
- **Frontend**:
  - New `OrgKpiGovernanceSettings` component (System Settings → General) exposes both `enable_org_kpi_auto_inherit` and `enable_org_kpi_autopull` toggles in one card.
  - New `OrgKpiInheritanceReconciler` section added to System Settings → Data Repair tab. Provides scan → preview → confirm-apply UX for the new RPC.
- **Trigger pipeline**: `trg_autoinherit_org_level_on_kpi_insert` (BEFORE) → row inserted with `is_org_level=true` → `trg_autopull_propagated_org_kpi` (AFTER) → fills value if a propagated OKV exists. Net effect: a brand-new mid-month KPI immediately enters the Org KPI workflow at `self_review` if its OKV is already propagated, otherwise sits at `kra_set` waiting for the data owner.
- **Modified files**: new migration file, `src/components/admin/OrgKpiGovernanceSettings.tsx` (new), `src/components/admin/OrgKpiInheritanceReconciler.tsx` (new), `src/pages/admin/SystemSettings.tsx`, `src/components/admin/DataRepairTab.tsx`.
- **Reversibility**: existing "Step Back" admin tool reverts any single false-positive inheritance. The reconciler can be re-run safely (idempotent — already-inherited rows are skipped).

### v2.66.7.3 — Design Decisions & Rejected Refactors (2026-04-22, doc-only)

This section records architectural patterns that have been audited and intentionally retained, so future contributors do not re-propose refactors that would damage compliance, performance, or downstream features.

#### Decision 1 — `nk()` Natural-Key Helper is a Client-Side Map Key, Not a SQL Predicate
- **Pattern**: `src/lib/orgKpiKey.ts` exposes `nk(s)` which lowercases, trims, and collapses internal whitespace. Used only in `OrgKpiDataEntry.tsx`, `useOrgKpiDataOwner.ts`, and `useOrgLevelKpis.ts` — exclusively to build JS `Map` keys for in-memory grouping after rows are fetched.
- **What it is NOT**: It is never embedded in a SQL `WHERE` or `JOIN` clause. All server-side joins (RPCs `propagate_org_kpi_value`, `change_org_kpi_scope_cascading`, trigger `trg_sync_org_status_to_future_open_periods`, etc.) use plain equality on `(category_id, kra_name, kpi_name, review_period, review_year)` backed by the unique index `idx_kpis_unique_signature` (migration `20260106132841_*.sql`).
- **Rejected refactor**: Introducing a `kpi_template_id` UUID or `content_hash` column. This would force a multi-month schema migration of every `kpis`/`review_submissions`/`org_kpi_values`/`kpi_audit_logs` row, every report query, every import path, and every export — for **zero performance gain** (Postgres already uses the composite index). It would also create a second identity that must be kept in sync with the human-readable name everyone references in audits.
- **Verdict**: Retain `nk()` as a small client-side ergonomics helper. Drift at the source is prevented by the KRA Library Master.

#### Decision 2 — `review_submissions.achieved_value` is an Immutable Per-Submission Snapshot
- **Pattern**: When an Org KPI is propagated, the achieved value is **copied** into every per-employee `review_submissions` row rather than referenced via a foreign key to `org_kpi_values`.
- **Why**: HR audit law and `final-score-governance-and-immutability` require that once an employee's value is submitted (and certainly once a `final_score` is approved), no upstream edit may silently alter the historical score. The 8-stage scoring fallback chain (`mem://architecture/pms/universal-scoring-logic`) reads this frozen value as the canonical "Self" score.
- **Rejected refactor**: Replacing the value column with `org_kpi_value_id` FK and deriving the value at read-time. This would mean a single admin edit to one OKV could mutate thousands of already-approved final scores — a direct violation of immutability policy and a compliance/legal risk. Storage cost (numeric × thousands of rows ≈ 40 KB) is irrelevant.
- **Allowed delta**: Employees and reviewers may amend their own `review_submissions` row (sub-factors, remarks, evidence, score override) after pre-fill. Once `final_score` is set, the row is locked.
- **Verdict**: Retain by-value copy. Codified in POLICY.md §88 (Submission Snapshot Immutability).

#### Decision 3 — `ORG_KPI_PROPAGATED` Audit Rows Are Per-KPI by Design
- **Pattern**: `usePropagateOrgKpiValue.ts` inserts one `ORG_KPI_PROPAGATED` row in `kpi_audit_logs` per affected KPI — not a single bulk-summary row.
- **Why per-row is load-bearing**:
  - `KpiTimeline.tsx` filters audit logs by `kpi_id` to render the per-employee Review Journey.
  - `KpiJourneySection.tsx` labels and groups events per KPI.
  - `supabase/functions/repair-stepped-back-siblings/index.ts` reconstructs prior submission state by reading these per-KPI rows; collapsing them would break the rollback-recovery engine.
- **Rejected refactor**: Replacing per-KPI rows with one `ORG_KPI_BULK_PROPAGATED` row carrying a JSON array of affected IDs. This would silently break three downstream features.
- **Allowed (optional, additive) optimization**: A single `ORG_KPI_BULK_PROPAGATION_SUMMARY` row may be added **alongside** the per-KPI rows for analytics; it must not replace them. The existing `PROPAGATION_PARTIAL` rows (no per-row consumer today) may also be compacted to a single summary if a future need arises.
- **Verdict**: Retain per-KPI granularity. Codified in POLICY.md §89 (Per-KPI Audit Granularity).

#### Risk & Impact
- **Data Impact**: None — documentation only.
- **Workflow Impact**: None.
- **UI/UX**: None.
- **Regression Risk**: Zero. Purely defensive against future destructive refactors.

### v2.66.7.9 — Profiles Query Policy: Paged Fetches for All List Reads (2026-04-22)

**Root Cause Class.** PostgREST silently caps unranged `select(...)` queries at 1000 rows. Several admin pickers and distinct-value queries on the `profiles` table relied on this implicit cap, so any employee beyond row ~1000 (active roster ≈ 2,533) was invisible to client-side search/filter UIs that only inspect the loaded array. The originating ticket: employee `101784` (Vivek Kumar Dansena, ~row 2512) was missing from the Copy KRAs picker.

**Standard.** All client-side `supabase.from('profiles').select(...)` calls that produce a **list** (for rendering, selection, filtering, search, or distinct-value extraction) MUST be wrapped in `fetchAllPaged()` from `src/lib/fetchAll.ts`. Single-row `.maybeSingle()` lookups and `.in('id', [...])` filtered lookups are exempt — they are not bounded by the row-scrolling cap.

**Files Migrated to `fetchAllPaged`.**
- `src/components/admin/CopyKrasDialog.tsx` (prior turn)
- `src/components/admin/OrgKpiAddEmployeeDialog.tsx` — Org KPI assignment picker
- `src/components/admin/CompetencyManagerTab.tsx` — competency employee search
- `src/components/admin/ReportAccessTab.tsx` — report-access user-override picker (also added `is_active=true`)
- `src/components/admin/AccessProfilesManager.tsx` — `AssignmentTab` user picker AND `distinct-levels` query
- `src/hooks/useEmployeeFilterOptions.ts` — `distinct-designations` and `distinct-grades`

**Hardened Data Contract.** `EmployeeCombobox.tsx`'s `employees` prop now carries a JSDoc warning documenting that callers MUST supply a fully-paged dataset. The combobox cannot recover from a truncated input.

**Regression Coverage.** `src/components/admin/__tests__/employeePickerPaging.test.ts` simulates a 2,533-row roster, places the target employee at index 1150, and asserts that `fetchAllPaged` walks all pages and the same client-side filter EmployeeCombobox uses can locate the employee by code, name, and department — and that the `excludeIds` and multi-select contracts still hold.

**Risk & Impact.**
- *Data Impact*: None. Identical SELECT shape — restores previously-dropped rows.
- *Workflow Impact*: None. No business logic changed.
- *UI/UX*: Pickers now show the complete active roster. No layout/interaction changes.
- *Performance*: Each affected picker now issues ~3 paged requests (~2.5k rows total) instead of 1 capped request (~1k). React Query caches across components; dialogs remain `enabled`-gated so the cost is paid only on open.
- *Regression Risk*: Very low. Single well-trodden helper, no schema or business-logic changes.


### v2.66.7.19 — Manager Approve Crash Fix: `audit_lead` Enum Typo (2026-04-23)

**Root Cause.** Migration `20260422062449_…` redeployed `public.notify_on_kpi_status_change()`. The `self_review → manager_check` branch queried `WHERE ur.role IN ('auditor', 'audit_lead')`. The `app_role` enum contains no `audit_lead` value (canonical roles are defined in `src/lib/roles.ts::ALL_APP_ROLES` — `admin, manager, employee, auditor, management, hr_pms, skip_level`). Postgres aborted the trigger with `invalid input value for enum app_role: "audit_lead"`, which rolled back the entire manager Approve transaction and surfaced as a red toast in the UI.

**Fix.** New migration recreates `notify_on_kpi_status_change()` with `WHERE ur.role = 'auditor'`. All other branches are byte-identical. No schema/data changes.

**Regression Coverage.** `src/test/bugBountyFixes.test.ts` adds **BUG-019** — pins the contract that every role string referenced in SQL or edge-function code must exist in `ALL_APP_ROLES`, and explicitly rejects the historical `audit_lead` typo.

### v2.66.7.45 — KPI Mapping Matrix Coverage Truncation (BUG-043) (2026-04-28)

**Root Cause.** `src/hooks/useAdminReports.ts::useKpiMappingMatrix` issued an unranged `supabase.from('profiles').select(...).order('full_name')` to load the employee roster for `/admin/kpi-mapping`. PostgREST silently caps unranged reads at 1000 rows; the active roster is ~2,533 profiles. The matrix only saw the first ~996 active employees alphabetically, every cascading filter operated on a truncated denominator, and the Coverage % stat was systematically under-reported. The sibling KPI fetch in the same hook was already batched manually — only the profiles query was missed when POLICY §94 was rolled out.

**Fix.** Wrapped the profiles query in `fetchAllPaged()` from `src/lib/fetchAll.ts` (the project-standard helper used by every other §94-compliant picker). Same SELECT shape; same in-memory `is_active !== false` filter; the only behavioural change is that all ~2,533 active rows are now visible to the matrix.

**Regression Coverage.** `src/test/bugBountyFixes.test.ts::BUG-043` pins (a) `useAdminReports.ts` imports `fetchAllPaged`, (b) the `kpi-mapping-profiles` queryFn block uses both `fetchAllPaged` and `.range(...)`. POLICY §94 Addendum extended with an enumerated list of compliant paged-fetch sites so future hooks reading `profiles` as a list cannot silently regress.

**Risk & Impact.**
- *Data Impact*: None. Read-only query, identical SELECT shape, RLS unchanged.
- *Workflow Impact*: Coverage %, "mapped employees", and grade/designation cascades on `/admin/kpi-mapping` now reflect the full active roster.
- *UI/UX*: No visual change. Existing pagination spans the real dataset.
- *Performance*: ~3 paged requests instead of 1 (≈2.5k rows). React Query caches across mounts.
- *Regression Risk*: Very low — single helper swap, no schema or business-logic changes.

**Risk & Impact.**
- *Data Impact*: None — trigger function only.
- *Workflow Impact*: Restores manager Approve. Auditor "ready for audit" notifications continue to fire.
- *UI/UX*: None.
- *Regression Risk*: Very low — surgical fix; new test prevents recurrence.

### v2.66.7.21 — Reviewer Dashboard "All Zeros" Regression Fix (2026-04-23)

**Root Cause.** v2.66.7.20 added `manager_score, skip_level_score, hr_pms_score, audit_score, management_score` to `SLIM_KPI_SELECT` in `src/hooks/useKpis.ts`. None of those columns exist on the `kpis` table — they live on `review_submissions`, and the auditor column is named `auditor_score` (not `audit_score`). Every PostgREST request using the slim select 400'd silently; React Query's `keepPreviousData` masked the failure visually. Result: HR PMS / Audit / Management dashboards showed Total Employees = 0, Pending = 0, Reviewed = 0, Total KPIs = 0.

**Fix.**
1. Removed the non-existent score columns from `SLIM_KPI_SELECT`.
2. Added a new hook `useReviewSubmissionScoresByKpiIds(kpiIds)` that fetches `manager_score, skip_level_score, hr_pms_score, auditor_score, management_score, final_score` from `review_submissions` in 500-row batches and returns a `Map<kpi_id, scores>`.
3. `EmployeeSelectorGrid` now consumes the score map for `scoreReviewed` counts in `getEmployeeKpiStats` and for the "Reviewed" stat-card counters across HR PMS / Audit / Management views. Corrected `audit_score` → `auditor_score` everywhere it leaked.

**Regression Coverage.** `bugBountyFixes.test.ts` BUG-020 rewritten to pin the inverse contract: `SLIM_KPI_SELECT` must NOT contain any reviewer-stage score column, the companion hook must source from `review_submissions`, and the auditor field must be the canonical `auditor_score`.

**Risk & Impact.**
- *Data Impact*: None — additive read-only query on `review_submissions`.
- *Workflow Impact*: None.
- *UI/UX*: Restores correct stat counts and progress bars on every reviewer dashboard.
- *Regression Risk*: Low — reverts an invalid column list and adds a scoped companion query covered by tests.

### v2.66.7.24 — Reviewer Roster Score-Signature Seed (BUG-022) (2026-04-23)
- **Issue:** "HR PMS Reviewed" stat card on the reviewer dashboard showed `0` for March 2026 even though the database had 504 KPIs with `hr_pms_score` recorded for the period (across 48 employees).
- **RCA:** `useProfilesByWorkflowStage` only seeded employees whose KPIs were *currently* at the requested stage (`status='hr_pms_review'`). Once HR PMS reviewed a KPI and it advanced to `audit` / `management_review` / `approved`, the employee dropped out of the visible roster. Stat-card logic intersects period KPIs with the visible roster (`memberIds`), so all already-reviewed KPIs were filtered out and the count collapsed to 0. Same defect under-reported "Auditor Reviewed" and "Management Reviewed".
- **Fix:** Added a **score-signature seed** branch in `useProfilesByWorkflowStage`. For reviewer stages (`hr_pms_review` → `hr_pms_score`, `audit` → `auditor_score`, `management_review` → `management_score`, plus `manager_check` and `skip_level_check`), the hook now also seeds employees whose `review_submissions` row for the period has the relevant score column non-null. Roster filter unions both seeds with workflow-resolution and template-fallback branches.
- **Secondary fix:** Replaced fragile `${kpiIds.length}:${kpiIds[0]}` cache key in `useReviewSubmissionScoresByKpiIds` with a deterministic FNV-1a hash of the sorted id list to eliminate cross-period stale cache hits.
- **Diagnostic:** Extended the `[useProfilesByWorkflowStage]` console breadcrumb to include `seededFromScoreSignature` for future regression visibility.
- **Files:** `src/hooks/useOrganization.ts`, `src/hooks/useKpis.ts`, `src/test/bugBountyFixes.test.ts` (BUG-022).
- *Data Impact*: None (read-only seed expansion). *Workflow Impact*: None. *UI Impact*: Reviewed stat cards become accurate; Total Employees may rise slightly as historically-scored employees re-enter the roster (correct behaviour, matches the existing tooltip). *Regression Risk*: Low — additive union of seeds; no employee is removed.

### v2.66.7.25 — Org KPI Self Column: Tooltipped Dash Instead of "N/A" (BUG-023) (2026-04-25)
- **Issue:** On reviewer scorecards, Org KPIs (e.g. "Proactive Safety Reporting (UA, UC, & Near Miss)") were displaying an amber **N/A** badge in the **Self** column even though the achieved value (e.g. `157`) was correctly shown — making it look like the self-review was missing or excluded.
- **RCA:** Org KPIs bypass the self-review stage by design — the achieved value is provided by the Data Owner and propagated through `org_kpi_values`, never via `review_submissions.self_score`. The previous rule in `KpiDetailsTable.tsx` (`score === null && (stageCompleted || (is_na && stageReached)) → "N/A"`) treated a legitimately-null Org-KPI self-score as a missing entry on a completed stage.
- **Fix:** Added an `isOrgKpiSelfBypass` branch (`col.key === 'self_score' && kpi.is_org_level === true && score === null && !submission?.is_na`). The branch renders a muted em-dash with a tooltip: *"Self-review is not collected for Org KPIs. The achieved value is provided by the Data Owner."* Genuine N/A rows (`is_na = true`) continue to surface as the amber **N/A** badge — the bypass cannot mask intentional N/A.
- **Files:** `src/components/review/KpiDetailsTable.tsx`, `src/test/bugBountyFixes.test.ts` (BUG-023).
- *Data Impact*: None — UI-only. *Workflow Impact*: None. *UI Impact*: Org KPI rows now render an em-dash with explanatory tooltip in the Self column instead of misleading "N/A". Non-Org KPIs are byte-identical. *Regression Risk*: Low — guarded by `is_org_level === true && col.key === 'self_score' && !submission?.is_na`.

### v2.66.7.26 — KPI Journey Excel: Assigned Workflow Chain Column (2026-04-25)
- **Enhancement:** The KPI Journey Timeline Excel export now includes an **Assigned Workflow** column showing the resolved per-employee workflow as a compact stage chain (e.g. `Self → L1 → HR PMS → Audit → Mgmt`).
- **Resolution:** Workflow is resolved per employee + period via the existing `get_bulk_employee_workflows` hierarchy: period-specific employee → ongoing employee → period-specific department → ongoing department → period-specific pms_grade → ongoing pms_grade → globals → system default. Stages are mapped to compact labels (`self_review`→Self, `manager_check`→L1, `skip_level_check`→Skip, `hr_pms_review`→HR PMS, `audit`→Audit, `management_review`→Mgmt; `approved` omitted as terminal). Falls back to `—` when no workflow resolves.
- **Scope:** Excel export only — the on-screen table is intentionally unchanged to preserve column density.
- **Files:** `supabase/migrations/*` (extended `get_kpi_journey_report`), `src/hooks/useKpiJourneyReport.ts`, `src/pages/reports/KpiJourneyReport.tsx`, `src/test/bugBountyFixes.test.ts` (BUG-024).
- *Data Impact*: None — additive read-only RPC field, no schema changes. *Workflow Impact*: None. *UI Impact*: None on screen; one new column in exported XLSX. *Regression Risk*: Low — RPC remains backward-compatible.

### v2.66.7.27 — TNI Detection Splits Skill Gaps from Compliance Failures (BUG-025) (2026-04-25)
- **Bug:** `detect_training_needs_for_period` was flagging *every* `final_score < threshold` as a skill gap, including KPIs that scored 0 only because the employee never submitted (auto-zero / overdue auto-advance). HR could not distinguish "needs training" from "didn't submit" — polluting the TNI Report and breaking alignment with the HR KPI definition (*Identification & Consolidation of Training Needs from PMS Data*).
- **Fix:** Detection now runs in two passes:
  - **Pass A (Compliance):** rows where `review_submissions.self_score IS NULL` OR `auto_advance_reason IS NOT NULL` → tagged `gap_type='compliance'`, priority `high`, fixed recommendation: *"Auto-flagged: non-submission / compliance penalty. No training required."*
  - **Pass B (Skill):** rows where the employee submitted but still scored low → tagged `gap_type='skill'` with priority by score band (existing behavior).
  Detection remains idempotent (`NOT EXISTS` dedup on `kpi_id`).
- **Enum:** Added `'compliance'` to `tni_gap_type` (additive — no impact on existing rows).
- **UI:** TNI Report now shows a dedicated **Compliance Gaps** summary card, a **Gap Type** filter (All / Training / Compliance) on the Individual tab, and a **Gap Type** badge column. The "Training Needs" total card now excludes compliance rows.
- **Out of scope:** Training delivery, attendance, and effectiveness tracking — handled by the LMS module (per user direction).
- **Files:** `supabase/migrations/*` (enum + RPC), `src/hooks/useTNI.ts`, `src/pages/reports/TNIReport.tsx`, `src/test/bugBountyFixes.test.ts` (BUG-025).
- *Data Impact*: Additive enum value; existing rows unchanged. *Workflow Impact*: None — TNI is read-only consolidation. *UI Impact*: One new card + one filter + one column. *Regression Risk*: Low — RPC signature unchanged; LMS handoff via `gap_type='skill'` rows.

### v2.66.7.28 — TNI Report: Multi-Period & Assessment Year (Jul–Jun) Filter (2026-04-25)
- **Enhancement:** The Training Needs Identification report now supports five viewing modes — **Month** (default), **QTD**, **YTD**, **AY (Jul–Jun)** ⭐ new, and **Custom** (cross-year). HR/Management can monitor the *Training & Development* KPI across the full Bharat Forge assessment year cycle (July → June) instead of one month at a time.
- **AY anchoring:** Selecting an end-month in Jul–Dec anchors AY to (endYear → endYear+1); selecting Jan–Jun anchors AY to (endYear-1 → endYear). Always returns 12 months (Jul…Jun).
- **Hooks:** `useTNISummary`, `useTrainingNeeds`, `useTNIByCategory`, `useTNIByDepartment` accept a new optional `periodRanges: PeriodRange[]`. When provided, queries use a single PostgREST `.or(and(...))` composite filter — single-month path is preserved as a special case (`length === 1` falls back to `.eq`).
- **Detection:** `detect_training_needs_for_period` remains intentionally month-scoped. In multi-month modes, the **Detect TNI** button surfaces an inline month-picker (defaults to the latest month in the active range) so operators must consciously pick which month to populate.
- **Excel export:** Filename now reflects the active range (e.g. `TNI_Report_AY_Jul2025-Jun2026.xlsx`) and includes a second **Monthly Summary** sheet pivoting Skill Gaps / Compliance Gaps / High Priority / Employees Affected per month — making the AY trend visible at a glance.
- **Files:** `src/hooks/useTNI.ts`, `src/pages/reports/TNIReport.tsx`, `src/test/bugBountyFixes.test.ts` (BUG-026).
- *Data Impact*: None — read-only filter change, no schema/RLS change. *Workflow Impact*: Default mode is Single Month → no behavior change for existing users. *UI Impact*: Filter row replaced by mode toggle + From/To pickers + range badge; Detect button gains a month-picker only in multi-month modes. *Regression Risk*: Low — single-month query path preserved; tests pin AY boundary, cross-year custom, and PostgREST OR-clause shape.

### v2.66.7.29 — Org KPI ↔ Normal KPI Scope Toggle Restored (BUG-027) (2026-04-25)
- **Bug:** Toggling any KPI between **Organization-Level** and **Normal** failed system-wide with `column rp.month_name does not exist`. Reproduced on Jitendra Dwivedi's KPI; affected every employee and every editor role.
- **Root cause:** Two SQL functions introduced 2026-04-21 referenced the `review_periods` table using non-existent column names. Actual columns: `period_name` and `review_year`. The functions used `month_name` and `year`.
  - `fn_sync_org_status_to_future_open_periods` — AFTER UPDATE trigger on `kpis.is_org_level / org_level_scope`. Errored before doing any work, so the toggle's UPDATE statement always rolled back.
  - `change_org_kpi_scope_cascading` — RPC for "Apply scope to future months" in Org KPI Management.
- **Fix:** Single migration redefining both functions with the correct column names (`rp.period_name`, `rp.review_year`). Function bodies are byte-equivalent otherwise — no signature, logic, or behavioural change. Side-benefit: the locked-period guard inside both functions now actually executes (was previously unreachable because the SQL errored first), restoring the documented locked-period protection for forward-sync.
- **Files:** `supabase/migrations/20260425064651_*.sql`, `src/test/bugBountyFixes.test.ts` (BUG-027).
- *Data Impact*: None — function-only redefinition. *Workflow Impact*: Restores the broken Org↔Normal toggle and re-enables the locked-period guard. *UI Impact*: None. *Regression Risk*: Very low — signatures unchanged; trigger binding unchanged. BUG-027 pins the canonical column names against the migration file so the typo cannot return.

### v2.66.7.30 — KPI Journey Excel: "Month" Column Showed Status (BUG-028) (2026-04-25)
- **Bug:** In the KPI Journey Timeline Excel export, the **Month** column displayed workflow status values (`self_review`, `kra_set`, `manager_check`, `approved`) instead of the assessment month name. The dedicated **Status** column was correct, so the report appeared to "duplicate" status into Month.
- **Root cause:** The RPC `get_kpi_journey_report` mapped the JSONB key `reviewPeriod` to `pg.status` (line 197 of the prior definition) instead of `pg.review_period`. Compounding: the upstream `filtered_kpis` CTE never selected `k.review_period` or `k.review_year`, so the column was unavailable to the JSONB builder even if the key had been correct.
- **Fix:** Single migration redefining `get_kpi_journey_report` to (a) include `k.review_period` and `k.review_year` in the `filtered_kpis` CTE and (b) wire `'reviewPeriod' → pg.review_period` plus a new `'reviewYear' → pg.review_year` key. All other CTEs, filters, pagination, transitions, send-back aggregation, summary metrics, and JSONB output keys are byte-equivalent.
- **Field Mapping Contract:** Report RPCs that return JSONB rows must map each frontend field to its semantically correct DB column. Sharing the same column between two semantically distinct keys (e.g., `reviewPeriod` and `status`) is forbidden.
- **Files:** `supabase/migrations/20260425073216_*.sql`, `src/test/bugBountyFixes.test.ts` (BUG-028), `POLICY.md` §101.
- *Data Impact*: None — read-only RPC redefinition. *Workflow Impact*: None — only the exported Month cell now shows the correct period name. *UI Impact*: The on-screen KPI Journey table also benefits where it surfaces `reviewPeriod`. *Regression Risk*: Very low — change isolated to one CTE SELECT list and two JSONB keys; BUG-028 pins the canonical mapping against the migration file.

---

### v2.66.7.33 — KPI Journey Timeline Showed Blank: Wrong Audit Table & Status Vocabulary (BUG-031) (2026-04-25)
- **Symptom:** `/reports/kpi-journey` rendered "No KPIs found for this period." with all summary cards reading **0**, even for periods with thousands of approved KPIs (e.g. March 2026 = 1,757 KPIs).
- **Root cause:** The previous migration of `get_kpi_journey_report` (v2.66.7.30) introduced two breaking defects in the `transitions` CTE:
  1. It read from a `audit_logs` table that does not exist in this project (canonical table is `public.kpi_audit_logs`). Every RPC call threw `42P01: relation "audit_logs" does not exist`, the React Query rejected, and the page silently fell through to its empty-state branch.
  2. Even with the table fixed, the status-literal filters used outdated stage names (`l1_review`, `auditor_review`, `skip_level_review`) instead of the project's canonical workflow vocabulary (`manager_check`, `audit`, `skip_level_check`). All per-stage timestamp columns would have been silently `null` for every row.
  3. The join used `audit_logs.entity_id::uuid` / `entity_type='kpi'`; `kpi_audit_logs` keys directly off `kpi_id uuid`.
- **Why it appeared "report-wide":** A code/function scan confirmed the defect was isolated to `get_kpi_journey_report`. No other report function references `audit_logs`; every other client and server reference uses `kpi_audit_logs`. Other reports that look "blank" are unrelated and should be diagnosed individually (typically empty filter results, fiscal-year vs calendar-year mismatch, or RLS).
- **Fix:** Single migration redefining `get_kpi_journey_report` with: (a) `FROM kpi_audit_logs al` joined by `al.kpi_id`, (b) canonical status literals across all six stage filters, and (c) the matching `workflow_chain` CASE. Function signature, security (`STABLE SECURITY DEFINER, search_path=public`), JSONB output shape, summary aggregation, and pagination all unchanged — so no client edit was required.
- **Verification:** `SELECT get_kpi_journey_report('March', 2026, …)` now returns `totalCount: 1757`, `summary.pending: 819`, `summary.totalSendBacks: 132` and three populated rows for `LIMIT 3` (previously: error).
- **Files:** `supabase/migrations/20260425115401_*.sql`, `src/test/bugBountyFixes.test.ts` (BUG-031), `POLICY.md` §104, `mem://architecture/database/kpi-audit-logs-canonical`.
- *Data Impact*: None — read-only function replace. *Workflow Impact*: None. *UI Impact*: KPI Journey Timeline now renders rows + correct summary numbers + per-stage timestamps. *Regression Risk*: Very low — signature and JSONB shape preserved; BUG-031 pins the canonical table & status vocabulary against the migration file so the wrong identifiers cannot return.

## v2.66.7.31 — TNI Report: Empty-Period Guidance & Range Backfill (BUG-029)

### Symptom
On `/reports/tni`, the **Monthly Summary** export sheet showed all zeros for months like Sep / Oct / Nov 2025 even though scoring data existed elsewhere in the system.

### RCA
TNI records in `public.training_needs` are generated **on demand** by the `detect_training_needs_for_period(p_review_period, p_review_year, p_threshold)` RPC. They are NOT auto-created when KPIs are scored. When a user selects a multi-month range (QTD / YTD / AY / Custom) that includes months for which the RPC has never been run, every aggregation (cards, category, department, monthly export) correctly returns `0` — but the UI gave no signal that the months were *undetected* rather than *gap-free*.

### Fix
1. **`useBackfillTrainingNeeds`** (`src/hooks/useTNI.ts`) — new mutation that iterates the active `periodRanges`, calls the existing `detect_training_needs_for_period` RPC per month, and reports per-period success/failure. Cache invalidation is identical to single-month detect.
2. **TNIReport empty-state alert** — when one or more months in the selected range have zero TNI rows, the report shows an inline alert listing the undetected months and pointing to either the **Backfill Range** action (multi-month modes) or the existing **Detect TNI** button (single-month mode).
3. **Backfill Range action** — visible only in multi-month modes, runs detection across the entire active range in one click.
4. **Monthly Summary export** — added a `Detection Status` column with values `Detected` or `Not detected — run TNI detection`, so zero rows are unambiguous.
5. **Regression test** — `BUG-029` in `src/test/bugBountyFixes.test.ts` pins the contract.

### Operational Note
Run TNI backfill before closing a reporting cycle. The RPC is idempotent — re-running it for an already-detected month does not create duplicates.


---

## v2.66.7.32 — Centered Refresh Overlay (Reviewer Grid) [SUPERSEDED by v2.66.7.34]

Initially shipped a centered overlay tied to user-initiated Refresh clicks on the reviewer grid. **Superseded** by v2.66.7.34, which moves the centered overlay to page navigation / initial data loads and reverts the Refresh button to inline-only feedback.

---

## v2.66.7.34 — Page Loading Overlay (PageLoadingOverlay)

**Component**: `src/components/ui/PageLoadingOverlay.tsx` (new). Shared brand SVG extracted to `src/components/ui/RocketGrowthArt.tsx` so both `PageLoadingOverlay` (active) and the deprecated `RefreshOverlay` reuse the same art without duplication.

**What changed**:
- The centered overlay (rocket + rising green growth chart, caption **"Please wait"** / **"Loading…"**) now indicates **page loading**, not user-initiated refresh.
- `src/components/layout/DashboardLayout.tsx` mounts the overlay in two places:
  1. `Suspense` fallback for route lazy-loading (was a small `Loader2`).
  2. New `RouteDataLoadingGate` — uses `useLocation()` + `useIsFetching()` to show the overlay during the first fetch burst after a route change, then auto-dismisses when the fetch count returns to zero. 15s safety auto-disarm.
- `src/components/review/EmployeeSelectorGrid.tsx` no longer mounts `RefreshOverlay`. The `userRefreshing` state and its `useEffect` are removed. The Refresh button keeps its inline spinner + `disabled={isRefreshing}` state.
- `RefreshOverlay` is marked `@deprecated`; backwards-compatible export retained.

**Animations**: unchanged — `rg-*` keyframes in `src/index.css` honor `prefers-reduced-motion`.

**Why**: A full-screen overlay on every Refresh click was intrusive and didn't address the actual visibility gap, which was on initial page loads. Users could not tell whether a slow page was loading. The gated route-change indicator covers that case while leaving Refresh feedback inline.

**Policy**: POLICY.md §103 (rewritten).

**Tests**: `src/test/bugBountyFixes.test.ts` → `BUG-030` (revised) and `BUG-032` (new).

---

## v2.66.7.35 — KPI Journey "Assigned Workflow" Resolved Per Employee (BUG-033)

**Symptom**: The KPI Journey Excel export rendered the same chain — `Self → L1 → Skip → HR PMS → Auditor → Mgmt` — for every row, regardless of the employee's actual workflow template.

**RCA**: The `get_kpi_journey_report` RPC's `emp_workflow` CTE hardcoded a six-element string array as `stages` for every employee. The chain join then always produced the maximal label. The RPC bypassed `get_bulk_employee_workflows`, the canonical resolver already used by reviewer grids, the bottleneck report, admin data entry, pending self-reviews, and Org KPI audit. Live data confirms employees in the same period are on at least 5 distinct chains (`Self → L1 → Auditor`, `Self → HR PMS`, `Self → L1 → HR PMS`, `Self → Audit → Mgmt`, `Self → L1 → Skip → HR PMS`, …) — none of which surfaced in the export.

**Scope check**: Codebase-wide scan confirmed this anti-pattern was isolated to the journey RPC. All other reports/hooks already call `get_employee_workflow` / `get_bulk_employee_workflows`.

**Fix** (migration `20260425120922_*.sql`):
- The `emp_workflow` CTE now calls `get_bulk_employee_workflows(ARRAY(SELECT DISTINCT employee_id FROM page), p_period, p_year)` — exact same resolver the reviewer grid uses.
- `workflow_chain` excludes the framing stages `kra_set` and `approved` (they are not user-facing review steps).
- Display labels (`Self`, `L1`, `Skip`, `HR PMS`, `Auditor`, `Mgmt`) and ordering are unchanged.

**Verified live**: a 500-row sample for March 2026 now returns 5 distinct chains in proportions matching the underlying `workflow_config` distribution.

**Policy**: see POLICY.md §104 (extended).
**Test**: `src/test/bugBountyFixes.test.ts` → `BUG-033`.

---

## v2.66.7.36 — Loading Art Simplified to Ascending Rocket (BUG-034)

**Change**: The centered `PageLoadingOverlay` art was simplified. The X/Y axes, three green growth-chart arrows, soft green ellipse, and arrowhead polygons have been **removed**. The art now shows a single navy rocket with green fins and a flickering orange flame **ascending vertically**, accompanied by a faint three-dot motion trail beneath. The container chrome ("Please wait" / "Loading…", rounded card, blur backdrop) is unchanged.

**Rationale**: User feedback — the chart axes added visual noise without communicating progress. A single ascending rocket reads as "moving forward, please wait" with less cognitive load.

**Scope**:
- `src/components/ui/RocketGrowthArt.tsx` — SVG rewritten; viewBox tightened to 120×140; component renamed `RocketLaunchArt` with backwards-compatible `RocketGrowthArt` alias so existing imports keep working.
- `src/index.css` — replaced `rg-arrow-rise` and `rg-rocket-launch` keyframes with `rg-rocket-ascend` (translateY +20 → −20 with fade) and added `rg-trail-fade`. `prefers-reduced-motion` guard preserved.
- Both `PageLoadingOverlay` and the deprecated `RefreshOverlay` automatically pick up the new art via the shared component.
- Gating logic (Suspense fallback + `RouteDataLoadingGate` via `useIsFetching`) is unchanged.

**Policy**: POLICY.md §103 — note added that the loading art is "rocket ascending"; growth-chart arrows are forbidden from re-entering this component.

**Test**: `src/test/bugBountyFixes.test.ts` → `BUG-034` pins the markup contract (no `rg-arrow*`, no axis lines, no arrowhead polygons; rocket + flame retained; alias export intact).

---

## v2.66.7.37 — NULL kpi.status Corruption Fix (BUG-035)

**Defect**: A user reported that the "Compliance to contract shipment/delivery date" KPI for Dippendu Das (March 2026) was showing as **"KRA Set"** in the View KPI Details modal even though Self had been submitted with rating 5 and the workflow chain Self → Auditor → Management should have advanced it to "Auditor / Pending".

**RCA (chain confirmed via DB + audit log)**:
1. Dippendu's workflow chain (resolved by `get_employee_workflow_info`) is `[kra_set, self_review, audit, management_review, approved]` — **manager_check is absent**.
2. The reporting manager landed on the Manager Scorecard for this employee because `useProfilesByWorkflowStage` includes employees by **score-signature seed** (intended for read-only roster completeness post-stage-advance — see v2.66.7.24 / BUG-022).
3. Manager entered a score and clicked Forward. In `UnifiedScorecard.tsx` line 681, `config.forwardStatus` was computed by `resolveForwardStatus('manager', stages)` which **correctly returned `null`** because `manager_check` is not in the chain (see workflowEngine.ts line 182 guard).
4. The component then executed `update({ status: null as any })` against `kpis` — Postgres allowed it because `kpis.status` is nullable, producing a row with `status = NULL`.
5. The audit trigger faithfully recorded `STATUS_TRANSITION old=self_review → new=null`.
6. The UI then re-rendered the row with `kpi.status || 'kra_set'` fallbacks in **MobileKpiCard, KpiDetailsTable, MobileSelfReviewCard, SelfReviewSheet** — silently mislabelling the corruption as "KRA Set".

**Blast radius**: 8 KPIs project-wide were affected (3 for Dippendu Das, 5 for Love Sahrawat) — all March 2026, all on the `self_audit_mgmt` template, all touched by the same manager UID.

**Fix**:
1. **Application guard** — `UnifiedScorecard.tsx` now defines `assertResolvableStatus(newStatus, viewLevel)` and calls it before the `submitReview` mutation's `kpis` update; the three inline `handleSubmitReview` branches (NA mark, NA override, NA confirmation) check `if (newStatus == null)` and toast "Workflow misconfigured" before short-circuiting. No more silent NULL writes possible from any reviewer flow.
2. **UI honesty** — Replaced `kpi.status || 'kra_set'` display fallbacks in **MobileKpiCard (dashboard)**, **MobileKpiCard (review)**, **MobileSelfReviewCard**, **SelfReviewSheet**, and **KpiDetailsTable** with an explicit amber **"Status Missing"** badge. Defaults-when-creating in admin tools were left intact (those represent legitimately new KPIs, not corruption).
3. **Data repair** — All 8 affected KPIs were repaired in a single transaction: illegitimate `manager_*` fields cleared on `review_submissions`, `kpis.status` set to `audit` (legitimate next stage in their chain), and a `RECONCILE_STATUS` audit entry inserted on each KPI with reason `'null_status_repair_v1'`. Verified `SELECT count(*) FROM kpis WHERE status IS NULL = 0` post-repair.

**Policy**: POLICY.md §106 — "No-NULL-Status Invariant".

**Test**: `src/test/bugBountyFixes.test.ts` → `BUG-035` (5 assertions covering resolver semantics, presence of guards in `UnifiedScorecard`, and "Status Missing" fallback in all four reviewer-facing badge sites). Full suite: 68/68 passing.

## v2.66.7.38 — Reviewer Self-Exclusion + Stage-Gate (BUG-036) (2026-04-26)

**Defect**: A user (admin acting as reporting manager) reported seeing their own profile listed inside the **Manager / Team** tab on `/dashboard?view=team` alongside their direct reports.

**RCA**:
1. `EmployeeSelectorGrid.baseMembers` (line 362) branches on `isFullAccess = role ∈ {admin, auditor, management, hr_pms}`. For full-access roles in the Team view it returned `allProfiles?.map(...)` — the entire `useProfiles()` set — without excluding the current `user.id`. The user therefore appeared as their own teammate.
2. The non-full-access (pure manager) path went through `useTeamMembers(reporting_manager_id = managerId)`. A direct DB query (`SELECT … FROM profiles WHERE reporting_manager_id = id AND is_active`) confirmed zero self-reporting loops today, so pure managers were not affected — but the path had no safeguard against future corruption.
3. The `EmployeeSelectorGrid` click handler also did not assert that the selected employee's resolved workflow included the reviewer's `requiredStage`, leaving the NULL-status forward path (BUG-035) reachable for any reviewer who clicked an out-of-chain employee.

**Fix**:
1. **UI exclusion** — `baseMembers` was refactored to compute the candidate list per branch and then `resolved.filter(m => m.id !== user.id)` in a single tail step that applies uniformly to Team / Audit / HR PMS / Management / Skip-Level / Pending-* / cross-check. Stat counters automatically inherit the exclusion because they derive from `baseMembers → demographicFilteredMembers`.
2. **Click guards** — `handleEmployeeClick` now (a) rejects clicks on the viewer's own row with a *"Self-review not allowed here"* toast and (b) when `requiredStage` is set and `workflowMap` has the employee's resolved chain, rejects clicks with a *"Workflow stage missing"* toast if `requiredStage ∉ chain` — closing the residual BUG-035 surface.
3. **Hook safety net** — `useTeamMembers` and `useSkipLevelTeamMembers` (`src/hooks/useOrganization.ts`) chain `.neq('id', managerId|userId)` so even a corrupt `reporting_manager_id = id` row cannot leak self into team lists.
4. **Database invariant** — A `BEFORE INSERT OR UPDATE OF reporting_manager_id` trigger (`prevent_self_reporting_manager` / `trg_prevent_self_reporting_manager`) raises `check_violation` whenever `NEW.reporting_manager_id = NEW.id`, blocking the data condition at the source. Per workspace policy this is a validation **trigger**, not a CHECK constraint.

**Policy**: POLICY.md §107 — "Reviewer Self-Exclusion".

**Test**: `src/test/bugBountyFixes.test.ts` → `BUG-036` (5 assertions covering the UI filter, both click guards, the dual `.neq` chain in hooks, and the trigger migration). Full suite: 73/73 passing.

## v2.66.7.39 — Notification Recipient Guard for Non-Login Users (BUG-037) (2026-04-28)

**Defect**: Vivek reported that **Copy KRAs** failed with toast `Copy Failed — insert or update on table "notifications" violates foreign key constraint "notifications_user_id_fkey"` when copying 12 KPIs from `Deepak Ranjan (100739)` to `Rahul Kumar Prasad (101941)` for April 2026.

**RCA**:
1. Direct DB query confirmed `Rahul Kumar Prasad (id=fa29fcb0-9b45-44b0-88d2-f48ef6104fe6)` has an active `profiles` row but **no `auth.users` row** — i.e., a non-login user (a supported class for offline data tracking; see `mem://features/admin/non-login-user-provisioning`).
2. The Copy KRAs flow inserts into `public.kpis`, which fires `trigger_notify_kpi_created → notify_on_kpi_created()`, which in turn inserts into `public.notifications` with `user_id = NEW.employee_id`.
3. `notifications.user_id` is `FOREIGN KEY ... REFERENCES auth.users(id) ON DELETE CASCADE` (verified via `pg_get_constraintdef`). The recipient row does not exist in `auth.users`, so PostgreSQL raised `foreign_key_violation` and rolled back the entire transaction — all 12 KPIs lost.
4. The same class of failure was latent in `notify_on_kpi_status_change` (send-back to non-login employee, self-review submission by non-login employee, manager approval, auditor fan-out where any auditor lacked an auth row, and finalisation) — every status transition that landed on a non-login user would have aborted the calling write.

**Fix**:
1. **Pre-check in `notify_on_kpi_created`** — the body now wraps the notification INSERT in `IF EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.employee_id) THEN ... END IF;`, making the no-op explicit for the common single-recipient case.
2. **Defensive handlers everywhere** — every one of the **5** distinct `INSERT INTO public.notifications` blocks inside `notify_on_kpi_status_change` (send-back, self-review-submitted-to-manager, manager-approval-to-employee, auditor-fan-out, finalisation) is now wrapped in `BEGIN ... EXCEPTION WHEN foreign_key_violation THEN NULL; END;`. Notification delivery is therefore best-effort by construction; no business write can ever be aborted by a missing recipient.
3. **Auditor fan-out filtering** — the set-based `INSERT ... SELECT ur.user_id FROM user_roles ur WHERE ur.role = 'auditor'` now also requires `EXISTS (SELECT 1 FROM auth.users au WHERE au.id = ur.user_id)`, preventing a single non-login auditor from poisoning the entire audit batch.
4. **Schema unchanged** — `notifications.user_id` keeps its FK to `auth.users(id) ON DELETE CASCADE`. The policy lives in the trigger layer.

**Verification**: `pg_proc` shows both functions now contain the guards. The Copy KRAs flow that failed is now expected to succeed; the non-login recipient simply receives zero notifications (correct — they have no inbox to read them).

**Policy**: POLICY.md §108 — "Notification Recipient Resolution / Non-Login Guard".

**Test**: `src/test/bugBountyFixes.test.ts` → `BUG-037` (3 assertions: `notify_on_kpi_created` pre-check, INSERT/handler parity in `notify_on_kpi_status_change`, and auditor fan-out auth filter).

**Migration**: `supabase/migrations/20260428044137_3bb989f3-5465-47fc-ad96-2aa0fef12c9e.sql`.

## v2.66.7.40 — PMS Scorecard Export Statement-Timeout Fix (BUG-038) (2026-04-28)

**Defect**: On `/admin/import` → **Import PMS Data**, clicking **Export Current Data** failed with `Export Failed — canceling statement due to statement timeout`. Reproducible at `kpis ≈ 9,526 rows`.

**RCA**:
1. `exportKpiData()` paged the `kpis` table with a 4-level nested join (`kra_categories(name), profiles!kpis_employee_id_fkey(employee_code, full_name, department_id, departments(name, business_units(name, divisions(name))))`). Each 1000-row page therefore expanded into a wide multi-table join in PostgREST.
2. The `.range(offset, offset + 999)` calls had **no `ORDER BY`**. Without an index-backed ordering, PostgreSQL must materialise the full join set on every page request to compute the offset window — the very first page exceeded `statement_timeout`.
3. `review_submissions` (7,550 rows) was also paged unordered; a latent timeout risk as the table grows.
4. `performance_reviews` returns 0 rows today; not implicated but on the same fragile pattern.

**Fix**:
1. **Decoupled lookups.** `kpis` is now fetched with **own columns only**, then `profiles` / `departments` / `business_units` / `divisions` / `kra_categories` / `sub_branches` are resolved via cheap `.in('id', [...])` lookups (the same pattern used in `IncentiveDataExport.tsx`).
2. **Ordered, paged via `fetchAllPaged`.** Every paginated read now uses `src/lib/fetchAll.ts` and includes `.order('id')` (or `.order('kpi_id')` / `.order('employee_id')`) so each `.range(from, to)` is an index-backed bounded scan.
3. **Smaller KPI page size (500).** Halves planner cost per page on cold caches; total round-trips remain O(n / 500).
4. **Defensive harden of `exportEmployeeData`.** Same lookup-decoupled + ordered-paging refactor applied so the employee export does not regress as the roster grows.
5. **Output unchanged.** Excel column names, ordering, and per-row formulas are byte-identical to the prior export.

**Verification**: `bunx vitest run src/test/bugBountyFixes.test.ts` → **78 / 78 pass** (BUG-038 adds 2 assertions: (a) `exportKpiData` no longer contains the nested join and uses ordered, decoupled lookups; (b) `exportEmployeeData` paginates `profiles` ordered and resolves `departments` via `.in()`).

**Policy**: POLICY.md §94 extended — paginated exports over large tables MUST decouple joins into `.in()` lookups and MUST order before `.range()`.

**Files**: `src/pages/admin/ImportData.tsx`, `src/test/bugBountyFixes.test.ts`, `mem/architecture/database/large-export-pagination-policy` (new).

## v2.66.7.42 — Data Entry Sidebar Gate Fix (BUG-040) (2026-04-28)

**Reported by**: Vivek.

**Problem**: The Data Entry sidebar group in `src/components/layout/AppSidebar.tsx` (line 309) was supposed to show only to admins (under Administration) and to designated org KPI data owners or users with explicit menu overrides. The actual gate was `return isDataOwner || true`, which always evaluated to `true` whenever `canAccess(menuKey)` passed. Since the menu's role-default list includes `employee, manager, auditor, management, hr_pms`, every non-admin user saw the **Data Entry → Org KPI Data Entry** item, then got redirected to `/dashboard` by `DataOwnerRoute` (`src/components/layout/DataOwnerRoute.tsx` line 13, wired from `App.tsx` line 213). Result: a misleading menu→redirect bounce.

**RCA**: Logic typo (dead-code short-circuit `|| true`) bypassing the intended ownership check. Comment described correct intent; implementation did not.

**Fix**: Replaced the filter so the Data Entry group renders only when:
- the user is an org KPI data owner (`useIsAnyOrgKpiDataOwner`), OR
- the user has an explicit per-user menu override (`menu_access_user_overrides` row for `data-entry`).

Role-default access is intentionally insufficient because `DataOwnerRoute` will reject those users at the route level. `userOverrides` is now pulled from `useMenuAccess()` and matched against `profile.id` (= `auth.users.id`).

**Verification**: `bunx vitest run src/test/bugBountyFixes.test.ts` → **80 / 80 pass** (BUG-040 adds an assertion that `isDataOwner || true` no longer appears and that the file references both `isDataOwner` and `userOverrides`).

**Policy**: POLICY.md §111 — sidebar visibility for ownership-gated routes MUST mirror the route guard; never rely on role-default `canAccess` when a stricter route-level guard exists.

**Files**: `src/components/layout/AppSidebar.tsx`, `src/test/bugBountyFixes.test.ts`.

## v2.66.7.43 — DataOwnerRoute Honors Per-User Overrides & Profile Rights (BUG-041) (2026-04-28)

**Reported by**: Vivek.

**Problem**: After BUG-040 fixed the **Data Entry** sidebar gate (admit on data ownership OR per-user override), the route guard at `src/components/layout/DataOwnerRoute.tsx` was still the pre-override version: it admitted only `effectiveRole === 'admin'` or `isDataOwner`. An admin could grant a non-owner explicit access through `menu_access_user_overrides` (or via an access profile with `can_view = true` on `data-entry`), the sidebar would correctly show the Org KPI Data Entry link, but clicking it bounced the user to `/dashboard`. The override path was half-implemented across two files.

**RCA**: Single-source-of-truth violation. The admit policy was duplicated between sidebar filter and route guard, and the route guard was never updated when the user-override and profile-rights layers were added to `useMenuAccess`.

**Fix**: Expanded `DataOwnerRoute` to consult `useMenuAccess` and admit any of:
1. `effectiveRole === 'admin'`
2. `isDataOwner` (existing)
3. Per-user override row for `(menu_key='data-entry', user_id=current)` in `menu_access_user_overrides`
4. Profile-based `can_view = true` on `data-entry` (`canPerform('data-entry', 'view')`)

The loading guard now also waits on `useMenuAccess.isLoading` to avoid a premature redirect on first paint while overrides/profile-rights are still loading. For symmetry, `AppSidebar.tsx` also admits Layer-2 profile view rights so the sidebar set strictly equals the route set.

Role-default `canAccess` admit is intentionally still excluded — that is what caused BUG-040, and the same policy applies here (POLICY.md §111).

**Verification**: `bunx vitest run src/test/bugBountyFixes.test.ts` → **82 / 82 pass**. BUG-041 adds two assertions: (a) `DataOwnerRoute.tsx` imports `useMenuAccess`, references the `'data-entry'` key, calls `canPerform(..., 'view')`, walks `userOverrides.some(...)`, and waits on `menuLoading`; (b) `AppSidebar.tsx` Data Entry filter also calls `canPerform(item.menuKey, 'view')`.

**Policy**: POLICY.md §111 extended — sidebar admit set and route admit set MUST be equal for ownership-gated routes. Any admit predicate added to one MUST be added to the other in the same change.

**Files**: `src/components/layout/DataOwnerRoute.tsx`, `src/components/layout/AppSidebar.tsx`, `src/test/bugBountyFixes.test.ts`.

## v2.66.7.44 — PMS Policy Menu Honors `pms_policy_visible_roles` (BUG-042) (2026-04-28)

**Reported by**: Vivek.

**Problem**: PMS Policy visibility had two competing sources of truth:
1. `app_settings.pms_policy_visible_roles` — the canonical column the admin toggles from the PMS Policy page (checkboxes at line 39–45) and the field the page guard already consulted at `src/pages/PMSPolicy.tsx` line 35.
2. `useMenuAccess.canAccess('pms-policy')` — used by the sidebar (`AppSidebar.tsx` line 177–186), which returned **true unconditionally for every signed-in user** because `'pms-policy'` was in `EMPLOYEE_DEFAULT_MENUS` (Layer 1, applied before any role/config check), in `DEFAULT_MENU_ROLES` for all roles (Layer 7 fallback), and in `menu_access_config.allowed_roles` for all roles (Layer 6 DB).

Net effect: an admin removed a role from the PMS Policy visibility config; the role still saw the nav item; clicking bounced them to `/dashboard`.

**RCA**: Single-source-of-truth violation — `useMenuAccess` was unaware of the PMS-Policy-specific `pms_policy_visible_roles` config and instead admitted every authenticated user via the implicit-default Layer 1.

**Fix** (in `src/hooks/useMenuAccess.ts`):
1. Removed `'pms-policy'` from `EMPLOYEE_DEFAULT_MENUS` (was Layer 1 leak).
2. Removed the `'pms-policy'` row from `DEFAULT_MENU_ROLES` (was Layer 7 leak).
3. Added a dedicated branch in `canAccess` that runs **before** the Layer 1–7 cascade: admin always passes; other roles pass only if `effectiveRole ∈ appSettings.pms_policy_visible_roles`; per-user overrides on `pms-policy` are still honored as an admin-granted escape hatch (parity with §111).
4. Aligned `src/pages/PMSPolicy.tsx` to delegate to `useMenuAccess.canAccess('pms-policy')` instead of repeating the role-list check, so the page guard and sidebar share one admit policy.

**Verification**: `bunx vitest run src/test/bugBountyFixes.test.ts` → **86 / 86 pass**. BUG-042 adds four assertions: (a) `EMPLOYEE_DEFAULT_MENUS` no longer contains `pms-policy`; (b) `DEFAULT_MENU_ROLES` no longer contains `pms-policy`; (c) `useMenuAccess` imports `useAppSettings` and has a dedicated branch keyed on `menuKey === 'pms-policy'` referencing `pms_policy_visible_roles`; (d) `PMSPolicy.tsx` delegates to `useMenuAccess.canAccess('pms-policy')`.

**Policy**: POLICY.md §112 (new) — when a page has its own role-visibility configuration column, `useMenuAccess.canAccess` MUST defer to that column in a dedicated branch and the menu key MUST be removed from `EMPLOYEE_DEFAULT_MENUS`, `MANAGER_DEFAULT_MENUS`, and `DEFAULT_MENU_ROLES`. The page guard MUST delegate to `canAccess`, not duplicate the predicate.

**Files**: `src/hooks/useMenuAccess.ts`, `src/pages/PMSPolicy.tsx`, `src/test/bugBountyFixes.test.ts`.

## v2.66.7.46 — Password Rollout Auto-Provisions Missing Auth Users (BUG-044) (2026-04-28)

**Reported by**: User (screenshot of "0 of 1 passwords generated successfully. 1 failed." for Binod Kumar Bhanja, 201142).

**Problem**: The Password Rollout admin tool failed for any employee who had a `profiles` row but no corresponding `auth.users` row. Edge function logs showed `Auth update failed: User not found`. This is the standard state for employees imported via the master backfill (per `mem://features/admin/non-login-user-provisioning`) — they live in `profiles` from day one but only get an `auth.users` record when they first log in. The Password Rollout tool was the natural place to provision that first login, but the implementation only knew how to **update** existing auth users, not **create** missing ones.

**RCA**: `processOneUser` in `supabase/functions/password-rollout/index.ts` unconditionally called `supabaseAdmin.auth.admin.updateUserById(profile.id, { password })`. The Supabase admin API returns `User not found` when no `auth.users` row matches the supplied id. There was no fallback to `createUser`.

**Fix** (`supabase/functions/password-rollout/index.ts`):
1. Probe `auth.admin.getUserById(profile.id)` before mutating.
2. If the user is missing, call `auth.admin.createUser({ id: profile.id, email, password, email_confirm: true, user_metadata: { full_name, employee_code } })`. **Critically**, the profile id is passed through as the auth user id so every FK keyed on the profile id (user_roles, KPI assignments, audit logs, KRA records) remains intact — no orphan rows, no rebinding.
3. Surface a friendlier error when the email is already linked to a different auth account ("Email already linked to a different auth account: …") rather than a generic admin-API string.
4. Add `auth_action: 'created' | 'updated'` to the per-user result payload so admins can distinguish first-login provisioning from a password reset (UI badging is a future enhancement; the audit table already captures status).

**Verification**: `bunx vitest run src/test/bugBountyFixes.test.ts -t "BUG-044"` → **3 / 3 pass**. BUG-044 pins (a) the `getUserById` probe exists, (b) `createUser` is invoked with `id: profile.id` and `email_confirm: true`, (c) the `auth_action` field is surfaced.

**Policy**: POLICY.md §113 (new) — admin tooling that mutates `auth.users` MUST handle the "profile-without-auth" state. The canonical pattern is probe-then-create-or-update, with the profile id passed verbatim into `createUser` to preserve referential integrity. Auto-provisioning is allowed (and expected) for the Password Rollout tool, since admin selection of the user is itself the authorization signal.

**Files**: `supabase/functions/password-rollout/index.ts`, `src/test/bugBountyFixes.test.ts`, `DOCUMENTATION.md`, `POLICY.md`, `mem/features/admin/non-login-user-provisioning`, `.lovable/plan.md`.

## v2.66.7.47 — handle_new_user() Idempotency for Backfilled Employees (BUG-045) (2026-04-28)

**Reported by**: User (after BUG-044 deploy, password rollout for Binod Kumar Bhanja 201142 still returned `0 of 1` with `Auth provisioning failed: Database error creating new user`).

**Problem**: After BUG-044 the rollout correctly tried `auth.admin.createUser({ id: profile.id, ... })` for backfilled employees. Supabase still rejected the call with the opaque `Database error creating new user` message. Edge function logs:

```
Password rollout failed for 2a2de074-7e13-462c-bcb7-850bc4fd1faa:
  Auth provisioning failed: Database error creating new user
```

**RCA**: `AFTER INSERT ON auth.users` runs `public.handle_new_user()`. The legacy body did:

```sql
INSERT INTO public.profiles (id, email, full_name) VALUES (NEW.id, NEW.email, ...);
INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee');
```

For a backfilled employee the `profiles` row already exists (master HR import). The first `INSERT` raised `duplicate key value violates unique constraint "profiles_pkey"`, which aborted the whole auth-create transaction. Supabase surfaced that as the generic admin-API error.

**Fix**:

1. **Migration** — replaced `public.handle_new_user()` body to use `INSERT ... ON CONFLICT (id) DO NOTHING` on `public.profiles` (preserves HR-imported employee data) and `ON CONFLICT (user_id, role) DO NOTHING` on the default-role insert. Self-signup still gets a profile + employee role; backfilled employees get a no-op trigger and keep their authoritative profile.
2. **Edge function (`supabase/functions/password-rollout/index.ts`)** — when `auth.admin.createUser` returns `Database error creating new user`, the rollout now wraps that string with a pointer to POLICY §114 / BUG-045 so any future trigger regression is debuggable from the rollout history alone.

**Verification**: New `BUG-045` regression block in `src/test/bugBountyFixes.test.ts` pins (a) the latest `handle_new_user` migration uses `ON CONFLICT (id) DO NOTHING` on `public.profiles`, (b) it uses `ON CONFLICT (user_id, role) DO NOTHING` on `public.user_roles`, (c) the rollout edge function maps the trigger DB error to an actionable message. Live retry for 201142: probe → createUser with `id: profile.id` → trigger no-ops on the existing profile and inserts the missing employee role → password set → email dispatched (toast: "1 of 1 passwords generated successfully").

**Policy**: POLICY.md §114 (new) — any trigger on `auth.users` that touches `public.profiles` or `public.user_roles` MUST be idempotent (`ON CONFLICT DO NOTHING`) so admin tools that auto-provision missing auth users (Password Rollout, future equivalents) succeed for backfilled employees and never overwrite HR master data.

**Files**: new migration replacing `public.handle_new_user()`, `supabase/functions/password-rollout/index.ts`, `src/test/bugBountyFixes.test.ts`, `DOCUMENTATION.md`, `POLICY.md`, `mem/features/admin/non-login-user-provisioning`, `.lovable/plan.md`.

## v2.66.7.48 — HR PMS Roster Authority + N/A Reviewed Credit (BUG-046) (2026-04-28)

**Reported by**: User (HR PMS dashboard, March 2026): (1) "HR PMS Reviewed = 184" looked too low, (2) "Total KPIs = 798" looked inflated, (3) Anant Shankar Shet (200208, VP) appeared in HR PMS even though VPs no longer go through HR PMS, (4) Devendra Kumar Yadav (100707) — all 22 KPIs approved as N/A — rendered as a blank card with no "reviewed" indicator.

**RCA** (verified by direct DB query for `review_period='March', review_year=2026`):

- **Anant** (`21d539de-…959`) — `get_bulk_employee_workflows` returns `[kra_set, self_review, audit, management_review, approved]` (no HR PMS). 36 KPIs. 5 carry a stale `hr_pms_score` set 2026-04-22 under a previous workflow template. The score-signature seed in `useProfilesByWorkflowStage` admitted him into the HR PMS roster on the strength of those 5 stale rows, inflating Total Employees (54 vs ~42), Total KPIs (798 vs ~595), and surfacing his card.
- **Devendra** (`799f3256-…992`) — 22 KPIs all `status='approved'`, all `review_submissions.is_na=true`, all stage scores NULL. The progress-bar "reviewed" predicate counted only `hr_pms_score IS NOT NULL`, so N/A approvals were treated as un-reviewed → empty `0/22` bar. The overall rating badge correctly returned blank because `useEmployeeScoresForPeriod` excludes N/A from the weighted average — combined, the card looked entirely empty despite a fully completed HR PMS review.
- **HR PMS Reviewed = 184** — the stat-card aggregation early-returned at `if (hrIdx === -1) return;` BEFORE the score-signature counter, so KPIs belonging to score-seed-only employees did not contribute. Combined with the N/A exclusion this collapsed the total far below the true 470–518 range.

**Fix**:

1. **`src/hooks/useOrganization.ts`** — `useProfilesByWorkflowStage` now treats the resolved workflow as the SSOT. `seededIds` and `scoreSigSeededIds` are honored ONLY when bulk RPC failed for that employee. Net effect: stale historical signatures no longer admit employees whose current workflow excludes the stage.
2. **`src/hooks/useKpis.ts`** — `useReviewSubmissionScoresByKpiIds` now selects and returns `is_na` so reviewer panels can credit N/A approvals.
3. **`src/components/review/EmployeeSelectorGrid.tsx`** — six "reviewed" predicates updated (HR PMS / Audit / Management × per-card progress bar + stat card) to credit `(stage_score != null) OR (is_na && status at-or-past stage)`. The HR PMS / Audit stat-card aggregations now run the score-signature counter BEFORE the workflow early-return so score-seeded employees still contribute totals when the seed admits them.

**Verification**: New `BUG-046` regression block in `src/test/bugBountyFixes.test.ts`: (a) `useReviewSubmissionScoresByKpiIds` selects `is_na`, (b) HR PMS reviewed predicate credits N/A approvals, (c) `useProfilesByWorkflowStage` resolved-workflow check precedes the seed shortcuts. Devendra now renders `22/22` with a green "22 reviewed" pill; Anant disappears from the HR PMS panel; HR PMS Reviewed and Total KPIs realign with the workflow-true denominator.

**Policy**: POLICY.md §115 (new) — current resolved workflow is the authoritative roster filter; "Approved as N/A" is a completed reviewer action and counts toward stage-reviewed totals.

**Files**: `src/hooks/useOrganization.ts`, `src/hooks/useKpis.ts`, `src/components/review/EmployeeSelectorGrid.tsx`, `src/test/bugBountyFixes.test.ts`, `POLICY.md`, `DOCUMENTATION.md`, `mem/features/review/unified-scorecard-component`, `.lovable/plan.md`.

## v2.66.7.49 — HR PMS On-Behalf Score-or-N/A Guardrail + Lekh Raj Repair (BUG-047) (2026-04-28)

**Symptom**: HR PMS Reviewed dashboard showed `592 / 595` for March 2026, off by exactly 3.

**Root cause**: An admin used "Score on behalf of HR PMS" on 3 KPIs for Lekh Raj (employee 101959) and advanced them to `approved` without writing `hr_pms_score` and without setting `is_na = true`. The submission was technically valid against schema constraints but invisible to the dashboard's reviewed-signature predicate (BUG-046's `hr_pms_score IS NOT NULL OR is_na = true`).

**Fix (defence in depth)**:

1. **Data repair migration** — backfilled the 3 affected `review_submissions` rows with `is_na = true`, `na_marked_by_role = 'admin'`, and a clear `auto_advance_reason` referencing BUG-047. Reconciled HR PMS Reviewed to `595 / 595`. Insert is idempotent and scoped to the broken signature.
2. **Audit trail** — every repaired KPI got a `BUG_047_DATA_REPAIR` row in `kpi_audit_logs` with `performed_by = NULL` (system-attributed per `mem://architecture/system-performer-attribution`).
3. **DB trigger `enforce_on_behalf_score_or_na`** — BEFORE INSERT/UPDATE on `review_submissions`. Detects on-behalf writes via `auto_advance_reason ILIKE '%on behalf of <stage>%'` for all reviewer stages (manager / skip_level / hr_pms / auditor / management) and rejects writes that lack both a stage score / rating and `is_na = true`. Repair migrations and fast-track writes are exempt by reason prefix.
4. **Client guard** — `AdminDataEntryDialog` now disables the Submit button (and shows an inline POLICY §116 hint) unless either a numeric score / rating is provided or the `Mark as N/A` toggle is on. Self-stage submissions are exempt because final aggregation does not depend on a self-stage signature.
5. **POLICY.md §116** added; **regression test** `BUG-047` added to `src/test/bugBountyFixes.test.ts` pinning the dialog predicate, the trigger contract, and the targeted repair scope.

**Files**:
- `supabase/migrations/<ts>_*.sql` (new)
- `src/components/admin/AdminDataEntryDialog.tsx`
- `src/test/bugBountyFixes.test.ts`
- `POLICY.md` (§116)
- `mem/features/admin/admin-data-entry-workflow-controls`

---

### v2.66.7.51 — Profile Cache Invalidation Contract (29 Apr 2026)

**Issue**: After an admin edited the `employee_code` of "Chandra Bhan Singh" from User Management, the employee disappeared from the Monthly Score Trend report, KPI pickers and the Company filter — even though all 170 of his historical KPIs (Sep 2025 → Jun 2026) remained intact in the database, linked correctly by `employee_id` (UUID).

**Root cause** (system-wide RCA, NOT a band-aid): Several reports cache employee → company / hierarchy / picker maps for 5–10 minutes via React Query `staleTime`. Profile-edit `onSuccess` handlers only invalidated the bare `['profiles']` key, leaving stale snapshots of `employee-company-map`, `profiles-hierarchy`, `monthly-trend`, `distinct-designations`, `distinct-grades`, `managers-list`, etc. Pickers therefore filtered against an outdated dataset.

**Fix**:
1. New helper `src/lib/profileCacheKeys.ts` exporting `PROFILE_DEPENDENT_QUERY_KEYS` and `invalidateProfileCaches(queryClient)`.
2. New realtime hook `src/hooks/useProfilesVersion.ts` — single shared Postgres-changes channel on `public.profiles` that bumps a module-level counter on any insert/update/delete and immediately invalidates the registered caches. Catches mutations made outside the UI (bulk imports, edge functions, direct DB).
3. Patched the four `onSuccess` handlers in `src/pages/admin/UserManagement.tsx` (edit / create / bulk update / delete) to call `invalidateProfileCaches`.
4. Appended `useProfilesVersion()` to query keys in `useCompanyFilter`, `useKpiFilters` (`useProfilesWithHierarchy`), `useEmployeeFilterOptions` (3 distinct-* / managers queries), and `useMonthlyTrend`.
5. **POLICY.md §95** added; regression test `src/test/profileCacheInvalidation.test.ts` pins both the cache key registry and the helper's invalidation set (passes 2/2).

**Files**:
- `src/lib/profileCacheKeys.ts` (new)
- `src/hooks/useProfilesVersion.ts` (new)
- `src/pages/admin/UserManagement.tsx`
- `src/hooks/useCompanyFilter.ts`
- `src/hooks/useKpiFilters.ts`
- `src/hooks/useEmployeeFilterOptions.ts`
- `src/hooks/useMonthlyTrend.ts`
- `src/test/profileCacheInvalidation.test.ts` (new)
- `POLICY.md` (§95)
- `mem/architecture/profile-cache-invalidation` (new)

---

### v2.66.7.52 — Safety Manual-Fetch & Pagination Policy (29 Apr 2026)

**Change**: Codified a binding UX/performance contract for the Safety module — *filters first → click Search → server-paginated tables*. No `/safety/*` list/query screen may auto-fetch on mount; every tabular surface must paginate server-side via `.range()` with `count:'exact'` (default 25, options 25/50/100).

**Why**: Existing Safety lists (`SafetyAuditLog` pulled 300 rows; `SafetyIncidents`, `SafetyPermits`, `SafetyAudits` pulled full tables) auto-fetched and filtered client-side. As Safety data grows this would degrade. We locked the rule in *now* via policy + ADR + memory + sanctioned primitives so every future Safety screen inherits it automatically.

**Deliverables**:
1. **Policy / governance**:
   - `POLICY.md` §113 (the rule, exemptions, forbidden patterns)
   - `docs/adr/ADR-050.md` (decision, alternatives, consequences)
   - `mem://architecture/safety/manual-fetch-and-pagination` (Core memory + index entry)
2. **Sanctioned primitives** (the only legal way to build a Safety list):
   - `src/hooks/useManualQuery.ts` — `enabled:false` + `submit(filters)`, ranged paging, `refetchLast()` for mutations
   - `src/components/safety/SafetyFilterBar.tsx` — Search/Reset shell, Enter-to-submit
   - `src/components/safety/SafetyDataTable.tsx` — empty / loading / paginated table renderer
   - `src/components/safety/SafetyEmptyState.tsx` — `awaiting-search` / `no-results` variants
3. **Migrated pages** (Phase 1):
   - `src/pages/safety/SafetyAuditLog.tsx` (was 300-row auto-fetch → ranged + server-side OR-search)
   - `src/pages/safety/SafetyIncidents.tsx`
   - `src/pages/safety/SafetyPermits.tsx`
   - `src/pages/safety/SafetyAudits.tsx`
4. **Tests**: `src/test/safetyPagination.test.ts` (7 tests) — pins range math, page guards, pageSize-resets-page, no-fetch-before-submit. Total suite: **688/688 passing**.

**Remaining migration backlog** (Phase 2, same primitives, no new policy):
`SafetyAuditTemplates`, `SafetyAuditScoreboard`, `SafetyAssets`, `SafetyTraining`, `SafetyTrainingAdmin`, `SafetyEmergency` (drills list), `SafetyEmergencyContacts`, `SafetySlaMonitor`, `SafetyHoursWorked`, `SafetyUsers`, plus the BU drill-down inside `SafetyAnalytics`. These pages remain functional today; Phase 2 will swap them onto the primitives page-by-page.

**Files**:
- `POLICY.md` (+§113), `DOCUMENTATION.md` (this entry), `mem/index.md` (+Core line, +Memory entry)
- `docs/adr/ADR-050.md` (new)
- `mem/architecture/safety/manual-fetch-and-pagination.md` (new)
- `src/hooks/useManualQuery.ts`, `src/components/safety/SafetyFilterBar.tsx`, `src/components/safety/SafetyDataTable.tsx`, `src/components/safety/SafetyEmptyState.tsx` (new)
- `src/pages/safety/SafetyAuditLog.tsx`, `src/pages/safety/SafetyIncidents.tsx`, `src/pages/safety/SafetyPermits.tsx`, `src/pages/safety/SafetyAudits.tsx` (rewritten)
- `src/test/safetyPagination.test.ts` (new)

## v2026-04-29c — Monthly Scorecard Date-Range trend stale-cache fix

**Symptom:** `/reports/monthly-scorecard` Date Range tab rendered "N of N
employees" with every monthly cell blank ("—").

**Root cause (RCA):** Two compounding issues —
1. `useMonthlyTrend` was issuing submission batches of 800 KPI IDs per
   `kpi_id=in.(...)` URL (~30 KB), exceeding the PostgREST URL limit. The
   old code did `r.data ?? []` with no `r.error` check, so every batch
   silently came back empty → every cell became "—".
2. React Query cached that broken payload under
   `['monthly-trend', ...]` with `staleTime: 5 min`. The "Reload" button
   only re-set local state to the same values → same query key → React
   Query returned the cached blank result without refetching.

**Fix:**
- `useMonthlyTrend.ts`: `SUB_BATCH = 200` (URL stays < 8 KB), explicit
  `throw r.error`, diagnostic `console.warn` when KPIs > 0 but submissions
  came back empty, `staleTime: 30s` / `gcTime: 5 min`.
- `MonthlyTrendView.tsx`: `handleLoad` now calls
  `queryClient.invalidateQueries({ queryKey: ['monthly-trend'] })` so a
  user can recover from any stale cached failure with a single click.
- POLICY §114 codifies both rules (cached-report reload + URL batch cap).
- New test `src/test/monthlyTrendCacheBust.test.ts` is a regression guard
  for all four invariants.
- New memory `mem://features/reports/monthly-scorecard-trend` documents
  the contract.

**Files:**
- `src/hooks/useMonthlyTrend.ts`, `src/components/reports/MonthlyTrendView.tsx`
- `src/test/monthlyTrendCacheBust.test.ts` (new)
- `mem/features/reports/monthly-scorecard-trend.md` (new)
- `POLICY.md` (+§114), `DOCUMENTATION.md` (this entry), `mem/index.md` (+entry)

## v2026-04-30 — Monthly Trend report: Reporting Manager column

**Change:** Added a "Reporting Manager" column to the Monthly Scorecard
Date Range (Trend) report, visible in both the on-screen table and the
Excel export. Format is `Name(Code)` (e.g. `Jaspal(101125)`); falls back
to `Name` alone when no employee_code, and `—` / blank when no manager.

**Implementation:**
- `useMonthlyTrend` now selects `reporting_manager_id` on profiles,
  batch-fetches `id, full_name, employee_code` for the deduped manager
  set via `.in()`, and exposes `reportingManagerName` on each row.
- Manager fetch is wrapped in try/catch — failures degrade to `null`
  rather than blocking the report.
- `MonthlyTrendTable` adds the column right after Department.
- `MonthlyTrendView` includes "Reporting Manager" in the Excel export
  and the client-side search filter.

**Files:**
- `src/hooks/useMonthlyTrend.ts`
- `src/components/reports/MonthlyTrendTable.tsx`
- `src/components/reports/MonthlyTrendView.tsx`
- `src/test/monthlyTrendCacheBust.test.ts` (extended)
- `mem/features/reports/monthly-scorecard-trend.md` (extended)

## v2.66.7.49 — Safety Module: Mobile-Friendly Entry-Level UX (2026-04-30)

**Change.** Made the Safety module fully usable for entry-level users
(Workers, Supervisors, Safety Officers) on phones (360–414px). Desktop
layouts at `md+` are preserved unchanged.

**Risk & Impact.** UI/CSS-only — zero schema, RLS, FSM, or permission
changes. Scoped under `src/components/safety/**` and `src/pages/safety/**`
only; PMS shell isolation invariant from `mem://architecture/safety/module-shell-isolation`
is preserved.

**New mobile primitives** (all in `src/components/safety/`):
- `SafetyMobileListCard` — stacked tap-target row (min-h 88px) used on every list page.
- `SafetyResponsiveList` — drop-in for `SafetyDataTable`; renders `<Table>` on `md+`, mobile cards on `<md`. Compact pager (Prev / Page X/Y / Next) on mobile.
- `SafetyStickyActionBar` — fixed-bottom CTA bar, mobile-only (or `forceVisible`). Honours iOS safe-area inset.
- `SafetyFilterSheet` — desktop = inline filter grid; mobile = "Filters (n)" trigger that opens a bottom Sheet, plus an immediate "Search" icon button.

**Pages updated:**
- `SafetyHome` — responsive header, mobile list rows wrap badges, sticky "Report Incident" CTA.
- `SafetyIncidents` — `SafetyFilterSheet` + `SafetyResponsiveList` (mobile cards) + sticky "Report Incident".
- `SafetyIncidentNew` — h-11 inputs, two-up evidence drop-zones with `<input capture="environment">` for direct camera access on mobile, sticky Submit / Cancel bar with offline banner.
- `SafetyIncidentDetail` — tighter mobile padding, wrappable badges, condensed back button.
- `SafetyPermits` — same mobile-cards / sticky-CTA pattern as Incidents.
- `SafetyTraining` — responsive header + back button.
- `SafetyEmergencyContacts` — phone numbers rendered as 📞-prefixed `tel:` links with min-h 36px and a 40px destructive icon button.
- `SafetyLayout` — `<main>` now `pb-24 md:pb-6` so sticky CTAs never cover content; floating SidebarTrigger gets iOS safe-area-inset-top padding.

**Tests & memory:**
- `src/test/safetyMobileLayout.test.tsx` (new) — guards `SafetyMobileListCard` semantics and the `SafetyStickyActionBar` mobile-only render contract.
- `mem/design/safety-mobile-ux.md` (new) — mobile-UX SSOT for Safety.
- `mem/index.md` — entry added.

**Out of scope:** Admin surfaces (`SafetyTrainingAdmin`, `SafetyUsers`, `SafetyHoursWorked`, `SafetyPermitTypeConfig`, `SafetyAuditTemplates`, `SafetySettings`) intentionally remain desktop-first.

### v2.66.7.50 — Identity & Access Console (IAC) Phase 1 (2026-04-30)

**Why.** User & Role Management was duplicated across PMS (`/admin/users`) and Safety (`/safety/settings/users`), each with its own role enum. Adding HRMS/LMS would multiply screens, enums, and audit gaps. There was no single place to see "who can do what" across the Hub.

**Architecture.** New capability/role/assignment model, additive to existing tables — Phase 1 ships zero RLS rewrites or breaking changes.

- `iac_capabilities` — catalog of fine-grained actions (`safety.incident.create`, `pms.review.approve`, `hub.iac.manage`, …). Immutable, developer-managed.
- `iac_roles` — bundles per module (PMS Admin, Safety Worker, …). Admin-editable, system roles flagged.
- `iac_role_capabilities` — role ↔ capability mapping.
- `iac_user_role_assignments` — user × role × scope (`global | company | business_unit | department`) with optional `expires_at` for time-bound access.
- `iac_audit_log` — immutable trail; written via `iac_log()` SECURITY DEFINER function.
- `has_capability(uid, cap, scope_type, scope_id)` — single authoritative SQL gate, used by RLS in Phase 2.

**Backfill.** Existing 683 PMS `user_roles` rows + 3 Safety `safety_user_roles` rows mapped into `iac_user_role_assignments`. Old tables remain authoritative for RLS in Phase 1; the IAC console reads/writes the new model.

**UI.** New `/admin/iac` console with five tabs:
1. **People** — directory with drawer (identity, current assignments, grant/revoke).
2. **Roles** — per-module list, capability checklist editor.
3. **Capabilities** — read-only catalog with usage counts.
4. **Bulk** — CSV import (`email,role_code,scope_type,scope_id,expires_at`), idempotent.
5. **Audit** — immutable log of every grant/revoke/role change.

Legacy screens (`/admin/users`, `/safety/settings/users`) keep working unchanged; both now show a banner pointing admins to the new console.

**Service layer.** `src/services/iac/iacService.ts` is the only Supabase entry point for IAC; UI consumes it via `src/hooks/useIac.ts` React Query hooks.

**Tests.** `src/test/iac/hasCapabilityParity.test.ts` validates the seeded role↔capability map against the legacy enum behavior.

**Phase 2 (planned).** RLS policies migrate from `has_role` → `has_capability`; Joiner-Mover-Leaver automation via `access_templates`; destructive-capability approval workflow; scheduled-access cron driven by `expires_at`.

### v2.66.7.51 — IAC Phase 2: Compatibility shims + Leaver + Expiry cron (2026-04-30)

**Why.** Phase 1 shipped the new capability/role/assignment model and the `/admin/iac` console, but legacy `has_role()` / `has_safety_role()` SQL functions still read only from `user_roles` / `safety_user_roles`. That meant grants made through the new console did not actually gate any of the 254 RLS policies that depend on these helpers.

**What changed.**
- **`has_role(uid, role)` and `has_safety_role(uid, role, bu)`** rewritten as OR-shims: returns `true` if *either* the legacy table *or* the new `iac_user_role_assignments` grants the role. Strictly additive — every grant that worked before still works, and new IAC grants now take effect everywhere immediately. `has_any_safety_role()` got the same treatment. Function signatures and return types unchanged, so no callers needed updating.
- **Leaver automation** — `iac_revoke_on_deactivation()` trigger fires `AFTER UPDATE OF is_active` on `profiles`. When `is_active` flips from `true` to `false`, every IAC assignment for that user is deleted and a single audit row is written with `actor_id = NULL` (system attribution per the Core memory rule).
- **Expiry sweep** — `iac_sweep_expired()` SECURITY DEFINER RPC deletes assignments whose `expires_at` is in the past and audits the count. Idempotent.
- **Cron edge function** `iac-sweep-expired` (`verify_jwt = false`, gated by `CRON_SECRET`) calls the RPC. Smoke-tested: returns 401 without the secret, deploys cleanly.

**Tests.** `src/test/iac/phase2Behavior.test.ts` pins the OR-shim contract (legacy-only, IAC-only, neither, wrong-user permutations). 10/10 IAC tests green.

**What didn't change.** Zero RLS rewrites. Zero existing-policy edits. Both legacy tables (`user_roles`, `safety_user_roles`) remain authoritative and are still backfilled into IAC; the console's revoke action only removes the IAC row (Phase 3 will collapse the two sources after a parallel-run period).

**Operator setup.** Schedule the cron in Cloud's Cron tab to call `iac-sweep-expired` daily at 02:00 with `x-cron-secret: <CRON_SECRET>`. Until that's wired up, an admin can hit the function manually or call the RPC `select public.iac_sweep_expired();` from a SQL session.

### v2.66.7.52 — IAC Bulk: Round-trip download/upload + hardened error handling (2026-04-30)

**Why.** Bulk tab shipped in Phase 1 only had a paste-CSV box. Admins had no way to export the current state and no structured feedback when imports went wrong; failures could surface as a single toast that hid per-row reasons.

**What changed.**
- **Download** section with two buttons: **Download Assignments CSV** (every row in `iac_user_role_assignments`, joined with `profiles.email` and `iac_roles.code`, paginated 1000 per page) and **Download Template CSV** (header + example + `#`-prefixed help).
- **Upload** section now accepts a file via `<input type="file" accept=".csv">` *or* the existing paste box. CSV parser (`src/lib/iac/csv.ts`) is RFC-4180-ish — handles quoted fields, embedded commas/quotes, CRLF, and skips blank/`#` lines.
- **Live preview** runs on every change/parse and groups rows into 5 buckets: ✅ Ready, ⚠️ Already exists, ❌ Unknown email, ❌ Unknown role, ❌ Invalid (missing email/role, bad scope, bad date). Each bucket is expandable.
- **Apply** button is disabled until at least one Ready row exists; label shows the exact count ("Apply 12 assignments").
- **Error report** — after Apply, every row that did *not* insert (invalid + unknown user/role + duplicate) is gathered into a downloadable CSV with an explicit `reason` column.
- **No silent fail** — every failure path raises a destructive toast and logs `[IAC.bulk] <where>:` to the console. File >2MB, missing required headers, preview RPC error, and apply error all surface inline.

**Round-trip guarantee.** Re-uploading an unmodified Assignments CSV produces 0 Ready / N Already-exists rows.

**Files.**
- `src/lib/iac/csv.ts` (new) — CSV parse/serialize/validate + download helper.
- `src/services/iac/iacService.ts` — added `exportAssignments()` (paginated, joined).
- `src/services/iac/types.ts` — added `IacBulkExportRow`, `BulkRowIssue`, `ParsedBulkRow`.
- `src/hooks/useIac.ts` — added `usePreviewBulk`, `useExportAssignments`.
- `src/pages/admin/IdentityAccessConsole.tsx` — `BulkTab` rewritten with Download / Upload / Preview / Error report sections.
- `src/test/iac/bulkCsv.test.ts` (new) — 6 tests pinning parser, round-trip, and validators.

---

## §KPI_STANDARD — KPI Standardization & Canonical Registry

**Added:** 2026-05-01

**Problem.** Same KPI concept appears under multiple KRA name variants (e.g. "Control dust emission", "Control Dust Emission", "Environment compliance" all for the same PM10 KPI). This makes cross-month dashboards treat them as different KPIs, inflates reporting, and creates confusion during reviews.

**Solution: Forward-Only Canonical Registry.**

### Architecture

Three new database objects:

1. **`kpi_definitions`** — Master registry of canonical KPI names. Fields: `canonical_kra_name`, `canonical_kpi_name`, `category_id`. Unique constraint on all three.

2. **`kpi_name_aliases`** — Maps old variant KRA/KPI names to canonical definitions. Fields: `definition_id` (FK), `variant_kra_name`, `variant_kpi_name`, `category_id`. Unique constraint on variant names + category.

3. **`kpis.kpi_definition_id`** — Nullable FK on existing `kpis` table linking each KPI row to its canonical definition.

4. **`resolve_canonical_kpi()`** — SECURITY DEFINER function that looks up alias table to resolve any variant to its canonical definition ID.

### Forward-Only Policy

- **Past data (before May 2026):** NEVER modified. Original text stays in DB.
- **May 2026 onward:** KPI rows corrected to canonical names and linked via `kpi_definition_id`.
- **Cross-month linking:** `kpi_name_aliases` table allows dashboards to group old variants with canonical names in trend views.

### Admin Tool (`/admin/kpi-standardization`)

Three tabs:
- **Build Registry:** Scans all KPIs via `scan_kpi_duplicate_groups()` RPC, groups near-duplicates, admin picks canonical version per group.
- **Review Registry:** View/edit/delete canonical definitions and their aliases.
- **Correct May KPIs:** Shows unlinked KPIs for May 2026+, auto-matches to registry, admin applies corrections via `correct_may_kpis()` RPC.

### DB Functions

- `scan_kpi_duplicate_groups()` — Returns JSONB array of duplicate groups with variants, employee counts, and row counts.
  - **Invariant (May 2026 fix):** the `variants` array contains exactly one entry per distinct `(category_id, kra_name, kpi_name)`. An earlier revision joined `kpis` back to its own aggregate and inflated each variant by its `row_count` (a single variant with 8 rows was emitted 8 times in the UI). The function now builds `variants` directly from the aggregate, and `src/lib/scanGroupsDedup.ts` provides client-side defence-in-depth.
- `correct_may_kpis()` — Updates KPI + org_kpi_values rows for a specified period. Hard-coded safety: refuses to operate on periods before May 2026.

### Enforcement (Soft)

Registry-based picker is default for new KPI creation. Free-text entry remains allowed but flagged with a warning. Custom entries logged for periodic admin review.

### Files

- `supabase/migrations/*_kpi_definitions_registry.sql`
- `supabase/migrations/*_kpi_standardization_functions.sql`
- `src/pages/admin/KpiStandardization.tsx`
- `src/components/admin/kpi-standardization/BuildRegistryTab.tsx`
- `src/components/admin/kpi-standardization/ReviewRegistryTab.tsx`
- `src/components/admin/kpi-standardization/CorrectMayKpisTab.tsx`
- `src/hooks/useKpiRegistry.ts`

### Phase 2a — Cross-Month Canonical Resolver (2026-05-01)

Phase 2a activates the registry inside the read path. Historical rows still
display under their original text on the per-month grids; only views that
aggregate across variants (currently the Profile → KRA Summary tab) collapse
matched variants into a single canonical KRA row.

- **`resolve_canonical_kpi_batch(p_signatures jsonb)`** — RPC. Accepts an
  array of `{ category_id, kra_name, kpi_name }` and returns the matching
  `definition_id`, `canonical_kra_name`, and `canonical_kpi_name` for each.
  Unmatched signatures get NULL columns. Read-only, SECURITY DEFINER.
- **`useCanonicalResolver(signatures)`** — React hook wrapping the RPC.
  Dedupes signatures, caches with 10-min staleTime, fails open (returns an
  empty Map and logs) so a registry outage never blocks rendering.
- **`src/lib/canonicalGrouping.ts`** — Pure utilities: `nk()`,
  `signatureKey()`, `canonicalGroupKey()`, `canonicalDisplayNames()`,
  `groupByCanonicalKey()`, `aliasesForGroup()`. Tested in
  `src/lib/canonicalGrouping.test.ts` (9 tests).
- **KraSummaryTab integration** — When two or more KRA-name variants in the
  same category resolve to the same canonical definition, they collapse
  into a single row. The canonical name is shown with a small `GitMerge`
  icon; hovering reveals "Also known as: …" listing the original variants.

**Out of scope for 2a** (revised after codebase audit): the originally
listed trend hooks (`useMonthlyTrend`, `useKpiJourneyReport`,
`useKpiEmployeeMatrix`) all aggregate per-employee for a single period and
do not group across KPI variants, so no edits were required there. They
will be re-evaluated in 2b/2c if user-visible drift emerges.

### Phase 2b — Soft Enforcement at Creation (2026-05-01)

Phase 2b enforces canonical linking at the database layer rather than in
each of the 5 client-side KPI insert sites. This is the cleanest soft
enforcement: zero changes to existing KPI creation UIs, single point of
maintenance, fully reversible via feature flag.

- **`is_canonical_enforcement_period(period, year)`** — Immutable helper
  returning `true` only for May 2026 and later. Used by the trigger and
  by `promote_signature_to_definition`.
- **`trg_kpi_canonical_autolink`** — BEFORE INSERT/UPDATE trigger on
  `public.kpis`. When the row's (category_id, kra_name, kpi_name) matches
  a `kpi_name_aliases` entry AND the period is May 2026+, automatically
  stamps `kpi_definition_id`. Skipped if user explicitly set the FK or
  if the feature flag is OFF.
- **`trg_kpi_canonical_autolink_audit`** — AFTER trigger writing
  `KPI_CANONICAL_AUTOLINKED` audit rows with `performed_by = NULL`
  (system action). Wrapped in EXCEPTION so audit failures never block
  KPI creation.
- **`enable_kpi_canonical_autolink`** system_settings flag (default ON).
  Admin toggle in the new Governance tab.
- **`promote_signature_to_definition(category_id, kra_name, kpi_name,
  canonical_kra?, canonical_kpi?)`** — Admin RPC that creates a new
  canonical definition + alias for an unlinked signature and back-links
  all matching May 2026+ rows in one shot.
- **`useCanonicalAutolinkSetting()` / `usePromoteSignature()`** —
  React hooks for the toggle and promotion RPC.
- **GovernanceTab** added to `/admin/kpi-standardization` showing the
  toggle and the most recent 25 auto-link audit events.
- **Tests:** `src/lib/canonicalEnforcementPeriod.test.ts` (6 tests
  documenting the period-gate contract — DB function is the source of
  truth, this test mirrors it).

### Phase 2c — Registry Health & Coverage (2026-05-01)

Phase 2c closes the loop on the registry by giving admins continuous
visibility into how well it covers active KPI data. It is read-only —
no new mutation paths are introduced. Promotion of unlinked signatures
continues to flow through the existing Build Registry / Review Registry
tabs and the Phase 2b `promote_signature_to_definition` RPC.

- **`get_registry_coverage_stats()`** — Admin-only RPC returning a JSONB
  blob with `total_definitions`, `total_aliases`, in-scope KPI counts
  (`inscope_kpis_total`, `inscope_kpis_linked`, `inscope_kpis_unlinked`,
  `inscope_distinct_signatures`), and `coverage_pct`. "In-scope" means
  rows passing `is_canonical_enforcement_period()` (May 2026+) — the same
  gate the auto-link trigger uses, so the dashboard math is always
  consistent with what enforcement actually controls.
- **`get_unlinked_signatures(limit)`** — Admin-only RPC returning the
  distinct (category, kra_name, kpi_name) tuples that are in scope but
  not linked. Ranked by occurrence count, then last-seen timestamp.
- **`detect_alias_drift()`** — Admin-only RPC returning canonical
  definitions whose aliases span more than one distinct KRA name. This
  is an advisory signal for possible mis-grouping; admins decide whether
  to split.
- **`useRegistryHealth()`** — React hook that loads all three RPCs in
  parallel and exposes `{ stats, unlinked, drift, loading, error,
  refresh }`. Fails open: an RPC error sets `error` instead of throwing.
- **`HealthCoverageTab`** — New tab on `/admin/kpi-standardization`
  with four metric cards (Definitions, Aliases, Linked KPIs, Unlinked
  KPIs), a coverage progress gauge tinted by threshold (≥90% green,
  ≥60% amber, otherwise destructive), the unlinked signatures queue,
  and the alias-drift table.

**Why "in-scope" excludes pre-May-2026 data:** historical KPIs were
created before the registry existed and are intentionally frozen by
§88B/§88C. Including them would permanently depress `coverage_pct` and
make the metric useless as an operational signal for the new regime.

### Phase 3a — Registry Visibility in Creation Flows (2026-05-01)

Phase 3a closes the gap between the silent DB auto-link trigger (Phase 2b)
and the authors who create KPIs. Authors now see at a glance whether the
KPI they are about to save is part of the canonical registry, without
introducing a second picker that would compete with the existing KRA
Library template picker.

- **`RegistryBadge`** — Self-fetching inline badge for forms with one
  KRA/KPI input pair. Uses `useCanonicalResolver()` with a single
  signature. Renders nothing while loading or out of scope, then either
  a green "Registered" badge with the canonical name in tooltip, or an
  amber "Not in registry" badge explaining the soft-enforcement model.
- **`RegistryBadgePreset`** — Pure presentational variant for list
  contexts. Consumes a pre-resolved Map from a parent that called
  `useCanonicalResolver()` once with all visible signatures.
- **`src/lib/canonicalEnforcementPeriod.ts`** — Extracted client mirror
  of the DB `is_canonical_enforcement_period()` function. Single import
  used by both `RegistryBadge` and the existing test suite, ensuring
  the period rule is defined exactly once on the client.

**Wiring:**
- `AdminKpiEditorForm` — single `RegistryBadge` next to the "KPI Name"
  label, gated on the edited KPI's own `review_period`/`review_year`.
- `AdminKpiCreateDialog` — single `RegistryBadge` next to the "KPI Name *"
  label, gated on the dialog's `reviewPeriod`/`reviewYear` state.
- `SmartAssignmentDialog` — batch resolver in role-template list, with
  `RegistryBadgePreset` rendered inside each template card next to the
  existing Category and Weightage badges.

**Deliberately not wired:**
- `OrgKpiBulkImport` is an achievement-value importer (Excel rows of
  achieved values mapped against existing org-level KPI definitions) —
  it does not create new KPI names, so the registry concept does not
  apply there. Adding a badge would be noise.

**Tests:** `src/components/admin/kpi-standardization/RegistryBadge.test.tsx`
(5 tests) locks the period-gate visibility rule and the signature-key
normalization contract that ties badge lookups to the resolver's writes.

### Phase 3b — Canonical-Aware Cross-Period Lookup (2026-05-01)

**Problem.** `KpiJourneySection`'s "Previous 2 Months" panel queried
previous-period KPIs by exact `kra_name = ? AND kpi_name = ?` match. If a
KPI was renamed across months (legal under §88A's forward-only registry),
the prev-month lookup missed and the reviewer saw "no previous data" even
though the canonical KPI clearly had history under an earlier name.

**Audit-driven scope reduction.** The original Phase 3 plan named four
report surfaces. A walkthrough of the codebase found that:
- `VarianceReport` and `KpiJourneyReport` are **single-period** reports
  (one selected month + year). §88B forbids modifying them.
- `ManagementDashboard`'s `PerformanceTrendChart` aggregates **org-wide
  weighted averages per period** — there is no per-KPI grouping, so
  canonical merging has no effect.
- `EmployeePerformanceSummary` aggregates per **employee**, not per KPI
  name across periods.

The only surface where renames cause a real, user-visible loss of data is
the prev-month panel inside KpiJourneySection. Phase 3b is therefore
narrow by design (see §88F).

**Implementation.**
1. `useCanonicalResolver` resolves the current KPI's signature to a
   `kpi_definition_id` if any. When found, a follow-up query fetches the
   canonical pair plus every alias from `kpi_definitions` and
   `kpi_name_aliases`.
2. The prev-month query swaps `.eq('kra_name')`/`.eq('kpi_name')` for
   `.in('kra_name', ...)`/`.in('kpi_name', ...)` over the variant pairs.
3. **Cartesian-product guard.** Because `.in()` clauses are independent,
   the result is post-filtered by `isAllowedPair()` from
   `src/lib/prevMonthCanonicalMatch.ts` — only rows whose actual
   `(kra_name, kpi_name)` pair exists in the registry-derived pair set
   are kept.
4. Each surviving prev-month row is tagged `isRenamedVariant` via
   `isRenamedFromCurrent()` (case- and whitespace-insensitive). Renamed
   rows render an inline `GitMerge` "Also known as" badge whose tooltip
   names the original variant text — preserving the audit-trust rule
   that historical text is never silently rewritten (§88B).
5. **Fallback.** When no canonical definition exists (pre-May-2026 KPIs,
   unregistered KPIs, RPC failure), the lookup degrades to the legacy
   single-pair exact-match. No regression and no error toast.

**Tests:** `src/lib/prevMonthCanonicalMatch.test.ts` (8 tests) locks the
pair-key normalization, the Cartesian-product rejection, and the rename
detection rule.

### Phase 3c — Read-only Registry Browser (2026-05-01)

Closes the "shadow taxonomy" gap: until now only admins could see the
canonical KPI registry. Phase 3c gives managers, HR PMS, management,
auditors, and skip-level reviewers a read-only view at `/registry`.

**Backend.**
- `get_public_registry_view(p_search, p_category_id)` — SECURITY DEFINER
  RPC. Returns `{ definitions: [{ id, canonical_kra_name,
  canonical_kpi_name, category_id, category_name, category_color,
  aliases: [{ kra_name, kpi_name }], alias_count, usage_count }],
  total_count }`. **No employee identifiers, scores, evidence URLs, or
  per-employee data ever leak.** Authenticated users only — anon raises
  `access denied`.
- `usage_count` is computed via `is_canonical_enforcement_period()` so
  it agrees exactly with the trigger and the admin Health dashboard
  (§88D). Pre-May-2026 KPIs are excluded by design.
- `menu_access_config` seeded with `registry-browser` granting visibility
  to admin/manager/hr_pms/management/auditor/skip_level. Plain Employee
  is intentionally excluded; admins can opt them in via the existing
  menu admin UI.

**Frontend.**
- `useRegistryBrowser(search, categoryId)` — react-query wrapper around
  the RPC. 5-min staleTime; throws on error so the page can show the
  inline error alert.
- `src/pages/RegistryBrowser.tsx` — search + category filter + table
  with `GitMerge` "Also known as" tooltip listing alias variants.
  Uses the existing `PageHeader` and `Card` shells for visual parity
  with reports.
- Route `/registry` is gated by `ProtectedRoute` with allowedRoles
  matching the menu_access_config defaults; the menu key allows admins
  to override per role without a code change.
- Sidebar entry "KPI Registry" under the `main` section, using the
  same `GitMerge` icon as the admin standardization page for visual
  continuity.

**Read-only by contract.** No edit, delete, or promote action exists on
this page. Admins continue to manage the registry from
`/admin/kpi-standardization` — exactly one write surface (§88G).

**Tests:** `src/hooks/useRegistryBrowser.test.ts` (4 tests) locks the
`RegistryDefinitionView` shape against accidental sensitive-field
widening, asserting that none of the forbidden keys (`employee_id`,
`*_score`, `achieved_value`, `r0`–`r5`, etc.) ever appear.

### Phase 4a/4b — Auto-Merge Suggestions (2026-05-01)

The exact-match scan (`scan_kpi_duplicate_groups`) only catches
definitions with identical text after `LOWER(TRIM())`. Phase 4 adds a
fuzzy suggestion engine on top, so admins can find duplicate
canonical definitions ("On-Time Delivery" vs "OTD %") and unlinked
signatures that closely resemble an existing canonical entry.

- DB layer (Phase 4a): `pg_trgm` extension + three SECURITY DEFINER,
  admin-only RPCs (`suggest_definition_merges`, `suggest_alias_candidates`,
  `dismiss_suggestion`) plus the `registry_suggestion_dismissals` table
  with admin-only RLS. All forward-only via
  `is_canonical_enforcement_period` and constrained to same-category
  comparisons.
- UI layer (Phase 4b): A 6th `Suggestions` tab on
  `/admin/kpi-standardization`. Threshold sliders (definition merge
  default 0.55, alias default 0.6) persist to localStorage. The
  definition-merge table shows alias and linked-KPI counts per side so
  admins can judge merge impact; its **Merge** button is intentionally
  stubbed pending Phase 4c. The alias-candidate table promotes via the
  existing `promote_signature_to_definition` RPC and surfaces a
  "Different text from signature" warning when the canonical text and
  the unlinked signature do not match — historical text is never
  silently rewritten.
- Hooks: `useRegistrySuggestions` parallel-loads both endpoints (fails
  open, mirrors `useRegistryHealth`); `useDismissSuggestion` wraps the
  idempotent dismiss RPC. Pair canonicalization (`LEAST(id), GREATEST(id)`)
  is enforced both in `suggest_definition_merges` and in the dismiss RPC
  so dismissals stay stable regardless of click order.

**Tests:** `src/hooks/useRegistrySuggestions.test.ts` (6 tests) locks
the localStorage threshold persistence helper against bad inputs
(non-numeric, < 0, > 1) so a corrupted setting can never crash the tab.

### Phase 4c — Transactional Merge Engine + Registry Audit (2026-05-01)

Phase 4c finishes the auto-merge story by giving admins a single, safe
code path for actually collapsing two canonical definitions and a
permanent record of every merge.

- **`kpi_registry_audit_log`** — append-only table for registry-level
  admin actions. Admin-only INSERT/SELECT, no UPDATE/DELETE policies.
  Every successful merge writes one `KPI_DEFINITION_MERGED` row with
  `performed_by`, kept/dropped definition snapshots, re-parented alias
  count, dropped alias-conflict count, re-pointed KPI count, and the
  backfill alias id (if one was inserted).
- **`merge_definitions(p_keep_id, p_drop_id, p_reason)`** — transactional
  SECURITY DEFINER RPC, admin-gated. Locks both definition rows
  `FOR UPDATE` in deterministic UUID order to prevent concurrent-admin
  races, refuses cross-category merges, re-parents aliases (deleting any
  that would collide with an existing alias on the kept side), inserts a
  backfill alias preserving the dropped canonical text, re-points
  `kpis.kpi_definition_id`, deletes the dropped definition, writes the
  audit row, and auto-dismisses the suggestion pair so it cannot
  resurface. Returns a JSON summary of all counts.
- **`get_registry_pending_suggestion_count()`** — lightweight aggregate
  used by the Health dashboard tile. Returns `{ merge_count, alias_count,
  total }` at default thresholds. Fails open to zeros for non-admins.
- **UI:** `SuggestionsTab` now has per-row **Keep A** / **Keep B**
  buttons that pre-select which definition survives, then a
  `ConfirmDestructiveDialog` confirms before calling
  `useMergeDefinitions`. The Health tab gains a "Pending Auto-Merge
  Suggestions" tile that highlights when there is review work waiting.

The Phase 4b stubbed Merge button (which intentionally did nothing) is
gone — every Merge action now goes through the transactional RPC and
produces an audit row.

### Phase 5 — Definition Split + Recent Activity (2026-05-01)

The inverse of Phase 4c merge. When the Alias Drift card flags a
canonical definition whose aliases span unrelated KRAs, an admin can
now split it apart safely.

- **`split_definition`** RPC (admin-only, transactional, deterministic
  row locks): validates the alias partition (every alias placed exactly
  once, move side non-empty), inserts a new `kpi_definitions` row in the
  same category, re-parents the moved aliases, re-points
  `kpis.kpi_definition_id` based on which alias each KPI's
  `(kra_name, kpi_name)` signature now matches, optionally renames the
  source canonical text, and writes one `KPI_DEFINITION_SPLIT` row to
  `kpi_registry_audit_log`. Forward-only — historical text is never
  touched (§88B).
- **`preview_split_definition`** RPC: cheap dry-run powering the
  dialog's live "X will move, Y will stay" counter.
- **`get_recent_registry_audit(p_limit)`** RPC: admin-only reader for
  the new "Recent Registry Activity" card on the Health tab.
- **UI:** Alias Drift rows on the Health tab now expose a **Split**
  button that opens `SplitDefinitionDialog` — a two-column alias
  partition with live KPI-impact preview, required reason, and optional
  source rename. The Health tab also shows a 5-row Recent Registry
  Activity feed combining merges and splits.

**Tests:** `src/hooks/useDefinitionSplit.test.ts` (8 tests) locks the
`validateAliasPartition` pure function against empty-move, count
mismatch, overlap, unknown ids, and the move-all edge case so the
dialog's client-side gate stays in sync with the server check.

### HR Review Notes — Inline Edit (2026-05-01)

`AddReviewNoteSheet` now supports `mode="edit"` and a `note` prop. The
`/hr/review-notes` table renders a Pencil icon (gated by
`useReviewNoteAccess().canEdit`) beside the trash button on each row.
Selecting it opens the same sheet pre-filled from the row and patches
via `useUpdateReviewNote`. Subject employee is intentionally locked
post-creation; only category, title, details, priority, and
`applicable_from` are editable. Server-side `applicable_from`
normalisation (first-of-month) and the existing completion-stamp
trigger remain authoritative.

**Tests:** `src/test/reviewNotes/edit.test.ts` covers the patch shape,
subject-lock, and month snapping.

### KPI Weightage Dashboard — Pagination (May 2026)

The dashboard at `/admin/kpi-weightage-dashboard` paginates by **employee** to keep cold-load fast as headcount grows (see POLICY §114).

- **Hook split**: `useKpiWeightageMatrix(fiscalYear, filters, { page, pageSize })` returns only the current page's employees. A separate `useWeightageVarianceSummary(fiscalYear, filters)` returns `{ varianceCount, acknowledgedCount, totalEmployees }` aggregated across the **full filter set** so the summary badges stay honest while the user pages.
- **Query plan**: Step 1 fetches a page of `profiles` server-side (filters applied, `.range(from, to)`, `count: 'exact'`). Step 2 fetches `kpis` for the fiscal year scoped by `.in('employee_id', pageIds)` only. The previous client-side filter pass is gone.
- **UI**: Filter changes reset to page 1. Free-text employee search is debounced 300 ms. A footer shows `Page X of Y · N employees` with `Per page` (25/50/100) and Prev/Next controls. Expand/Collapse All operate on the visible page.
- **Cache invalidation**: All mutations (cell edit, acknowledge variance, add KPI to month, AdminKpiEditDialog close) invalidate the `['kpi-weightage-matrix']` prefix; the variance summary key (`['kpi-weightage-variance-summary']`) refreshes on its own staleTime or can be invalidated by callers when needed.
- **Export**: The Excel export reflects the **current page only**. A future enhancement (out of scope here) is a "Export all (filter-scoped)" path using the aggregate query.
- **Mapped employees only (May 2026 v5.1.1)**: Both `useKpiWeightageMatrix` and `useWeightageVarianceSummary` first resolve the distinct set of `employee_id`s present in `kpis` for the selected fiscal-year pair (and category, if filtered) via `fetchEmployeesWithKpis()`, then constrain the profiles query with `.in('id', eligibleIds)`. This removes the long tail of unassigned profiles (was 2532, now ~mapped count) from the list, badges and Export — POLICY §114.5.

### KPI Standardization — Idempotent Approve as Canonical (May 2026)

`useBuildRegistry.createDefinitionWithAliases` no longer fails with a duplicate-key error when a `kpi_definitions` row already exists for the chosen canonical `(kra_name, kpi_name)` pair (e.g., from a prior approval, registry import, or merge/split). The hook now:

1. Looks up the existing definition first; if found, reuses its `id`. A `23505` race during insert is also caught and resolved by re-reading.
2. De-duplicates the canonical + variant list case- and whitespace-insensitively.
3. Fetches existing aliases for the resolved `definition_id` and inserts only the missing rows.
4. Surfaces a contextual toast: *"Linked to existing canonical entry"* (reuse) or *"Registry entry created"* (new), with `<n> aliases linked (<m> already present)`.

The pure helper `diffAliasInserts(canonical, variants, categoryId, existingAliases)` is exported from `src/hooks/useKpiRegistry.ts` and locked by `src/hooks/useBuildRegistry.test.ts` (5 tests: fresh insert, partial overlap, full overlap, internal duplicates, distinct category). Policy: §88A.6.

## KPI Standardization — Phase 5b: History, Undo & Edit (v2.66.7.24)

The `/admin/kpi-standardization` page now has 7 tabs. **History & Undo** is the new 7th tab.

### What changed
- **Edit canonical names** — every entry in *Review Registry* has a pencil icon that opens `EditDefinitionDialog`. Two propagation modes: *Registry only* or *Registry + propagate to current KPIs*. Propagation skips pre-May-2026 rows.
- **Inline canonical editing on approval** — the *Build Registry* tab now lets admins override the canonical KRA/KPI text before clicking *Approve as Canonical*.
- **Per-alias unlink** — *Review Registry* now exposes a `Link2Off` icon next to each non-canonical alias. Logged + undoable.
- **Drill-in to KPI rows** — every duplicate variant (Build Registry), every registry entry (Review Registry), and every unlinked signature (Correct May KPIs) has a *View KPIs / View affected employees* expander backed by the shared paginated `AffectedKpisTable` (25/page).
- **Append-only action history** — every standardization mutation logs to `public.kpi_standardization_actions`. Admin-only SELECT/INSERT; no UPDATE/DELETE policy.
- **Undo** — `reverse_standardization_action(uuid)` is the single sanctioned undo path (SECURITY DEFINER, admin-gated). Reversed rows remain visible in the history (dimmed) for audit.
- **`correct_may_kpis` v2** — same signature, now also captures a complete before-image (affected `kpi.id`s + prior `kpi_definition_id`) into the action payload so each rename can be reverted exactly.

Policy: **§88I**. Locked by `src/hooks/useStandardizationHistory.test.ts` (10 tests).

---

## Performance Architecture (Lean-Load)

Anchored by **POLICY §120**. Audit baseline (2026-05-04): 754 `.select(...)` calls across 211 files; only ~11 raw `select('*')` for actual row reads (the rest are zero-row count calls); 499 `useMemo` / 128 `useCallback` already in place; 94 lazy route splits; 317 Skeleton usages; 25 sanctioned full-org `fetchAllPaged` sites.

### Conventions
- **Debounced inputs** — wrap text-input search/filter values in `useDebouncedValue(value, 300)` (`src/hooks/useDebouncedValue.ts`) before they reach `useMemo` deps or React Query keys. Categorical filters (role/status/dept) recompute immediately.
- **Slim KPI projection** — `useAllKpis` and `useKpisByPeriod` select only `SLIM_KPI_SELECT` (id, status, scoring fields, lightweight refs); heavy text (`evidence_url`, `remarks`) is loaded on open.
- **Pagination first** — new lists use `.range(...)` with `count: 'exact'` (`SafetyAudits`, `KpiWeightageDashboard`, `EmailLogs`, `AffectedKpisTable` are reference patterns).
- **Skeletons over spinners** for page/list loads; `Loader2` stays inside buttons.

### Sanctioned full-fetch sites
Documented in `mem/architecture/profiles-query-policy`. Capping these to 20 rows would silently hide the majority of the 2,533-employee roster from pickers and break weighted scoring math. Examples: CopyKrasDialog, OrgKpiAddEmployeeDialog, KPI Mapping Matrix, KPI Employee Matrix, multi-period aggregations.

### Why we did NOT do
- **Global `select('*')` rewrite** — 162 hits are dominated by `count: 'exact', head: true` (zero-row reads). Hand-listing columns across 211 files would risk breaking `types.ts` inference with no measurable runtime gain.
- **Blanket 20-row caps** — break PMS pickers and scoring engines (POLICY §94 / §120.2).
- **Blanket spinner→skeleton swap** — degrades UX on mutation buttons.

### Regression tests
- `src/test/useDebouncedValue.test.tsx` — 5 tests, verifies initial value, delay, latest-wins coalescing, custom delay, unmount cleanup.
- `src/test/kpiWeightageDashboardPagination.test.ts` — guards employee-paginated dashboards.
- `src/components/admin/__tests__/employeePickerPaging.test.ts` — guards full-org picker contract.

## Version History
- **v2.66.7.50 (2026-05-07):** Org KPI Data Entry empty-state RCA for Vivek Kumar Dansena (admin, 101784). Despite 862 backend rows / 170 unique definitions for April 2026, the page rendered the generic "No org-level KPIs found" card. Root cause: the empty card fired without distinguishing loading vs. ownership-loading vs. stale UI filters. Fix: new pure classifier `src/lib/orgKpiEmptyState.ts` (`deriveOrgKpiEmptyState`); page now waits for `authLoading || !isReady || kpisLoading || ownershipLoading` before any empty card; stale `selectedCategoryId`/`selectedOwnerId` self-clear via `useEffect`; empty card now shows one of `no-backend-rows` / `masked-admin` / `all-frequency-locked` / `filtered-out`, plus admin-only diagnostics counts and a Clear-Filters button. POLICY §98 added; regression tests in `src/test/orgKpiEmptyState.test.ts` (7 tests).
- **v2.66.7.49 (2026-05-07):** BUG-048 fixed a false Unified Issues flag for Vivek Kumar Tripathi (100665). `useSystemIssues` now routes pending-KRA classification through `shouldCreatePendingKraIssue()`, excluding Org KPI `kra_set` rows and non-terminal multi-month placeholders while retaining regular employee KPI pending flags. POLICY §97 added; regression tests added to `src/test/bugBountyFixes.test.ts`.
- **v2.66.7.45+lean-load (2026-05-04):** POLICY §120 Lean-Load Policy added. Shared `useDebouncedValue` hook introduced (`src/hooks/useDebouncedValue.ts`) with 5 unit tests. Wired into `UserManagement` (2,533-row in-memory filter) and `useReviewPageState` (period-scoped KPI filter). `useAllKpis` slim projection (`SLIM_KPI_SELECT`) confirmed and codified. Audit findings document why blanket `select('*')` removal, 20-row caps on pickers, and blanket spinner→skeleton swaps were rejected.
- **changelog-2026 (2026-05-05):** Created `CHANGELOG_2026.md` at repo root — executive weekly roadmap grouped by Month → Week, populated Feb→May 2026 from this Version History + migrations + `mem/`. Maintenance protocol pinned in `mem/preferences/changelog-protocol`: every future shipped change appends to the current week's row in the same step as a Version History entry.
- **v2.66.10 (2026-05-05):** Skip-aware PA3 partial-propagation toast in `OrgKpiDataEntry.executeSaveAndPropagate`. Benign `not_in_kra_set` skips (employee already self-reviewed) no longer trigger the destructive "may have mismatched KPI names" toast — the "Already propagated" summary (§88.1) remains the canonical notice. Hard skips and truly unaccounted gaps still surface as destructive. POLICY §88.2 added; regression locked in `src/test/orgKpiPropagationToast.test.ts`. Reported by Vivek Kumar Dansena (8/8 false-alarm "mismatch" toast on a Mar-2026 Org KPI where every employee was already at `self_review`).

