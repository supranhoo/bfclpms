

## RCA: Why Ashish Kataria (200226) Sees 84 KPIs / 54 Employees on Performance Report

### Finding: No Data Leak — But Misleading Aggregation

There is **no security issue**. The data shown is exactly what RLS permits for Ashish's `manager` role. However, the Performance Report aggregates unrelated data sources into what looks like a team performance view.

### Data Breakdown

| Source | KPIs | Employees | Why Visible |
|--------|------|-----------|-------------|
| Own KPIs | 60 | 1 (himself) | `employee_id = auth.uid()` policy |
| Org-level KPIs (data owner) | ~24 | ~14 | Ashish is a data owner for org-level KPIs — the `Data owners can view assigned org-level KPIs` policy |
| Direct reports' KPIs | 0 | 0 | His 20 reports have **zero KPIs assigned** |
| **Total** | **~84** | mixed | Matches screenshot |

The "54 Employees" count comes from `useProfiles()` which returns profiles visible via RLS: 1 (self) + 20 (direct reports) + 10 (skip-level reports) + ~12 (org data owner profiles) + ~6 (org value enterer profiles) ≈ 49-54 after dedup.

### The Problem

The Performance Report page (`PerformanceReport.tsx`) treats **all visible KPIs** as a single performance dataset. For Ashish, this means:
- His own 60 personal KPIs dominate the rating distribution and category charts
- 24 org-level KPIs (which he manages as data owner, not as a reviewer) are mixed in
- The "54 Employees" stat is from profiles, not from KPI data — creating a false impression

### Recommended Fix

**Scope the Performance Report to show only team data (direct reports' KPIs) for managers**, excluding own KPIs and org-level data owner KPIs.

**File: `src/pages/reports/PerformanceReport.tsx`**

1. Import `useAuth` and get the current user's ID and role
2. For `manager` role: filter `allKpis` to exclude KPIs where `employee_id === currentUserId` and exclude org-level KPIs (`is_org_level === true`)
3. For `admin`/`management`/`auditor` roles: show all KPIs (current behavior)
4. Update the "Employees" stat to count distinct employees from the **filtered KPIs**, not from `useProfiles()`
5. Add a small badge/indicator showing "Team Performance" vs "Organization Performance" based on role

### Why His Reports Show 0 KPIs

Ashish's 20 direct reports genuinely have **zero KPIs assigned** in the system. This is a separate data issue — KRAs haven't been issued to his team. Once KPIs are assigned, they'll appear correctly via the manager RLS policy.

### Files Changed
1. **`src/pages/reports/PerformanceReport.tsx`** — Filter KPIs by role scope; derive employee count from KPI data instead of profiles

