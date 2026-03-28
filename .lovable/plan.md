

## Add Auditor Workload Summary to Admin Dashboard

### What You Asked For
Show auditor-wise pending KPI breakdown on the Admin Dashboard (`/admin/dashboard`) so admins can see how many KPIs are pending with each auditor — same data as the audit view's workload bar but displayed on the admin's own dashboard page.

### Current State
- The auditor workload bar already works on the **Audit Panel** (`/dashboard?view=audit`) inside `EmployeeSelectorGrid`
- The **Admin Dashboard** (`/admin/dashboard`) shows overall stats (total employees, KPIs by stage, etc.) but has no auditor-level breakdown
- The `useAuditorWorkloadSummary` hook already fetches all auditor-to-employee/KPI mappings

### Approach
Add a new **"Audit Workload by Auditor"** card section on the Admin Dashboard page, below the "KPIs by Review Stage" section. It reuses the existing `useAuditorWorkloadSummary` hook and cross-references with KPI stage data to show per-auditor pending/in-audit/forwarded counts.

### UI Design

```text
┌─────────────────────────────────────────────────────────┐
│  Audit Workload by Auditor                    ▼ collapse│
├─────────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│ │ Auditor001   │ │ Auditor002   │ │ Auditor003   │ ... │
│ │ 12 employees │ │ 8 employees  │ │ 15 employees │     │
│ │ 45 pending   │ │ 32 pending   │ │ 78 pending   │     │
│ │ 12 in audit  │ │ 5 in audit   │ │ 20 in audit  │     │
│ │ 8 done       │ │ 22 done      │ │ 10 done      │     │
│ └──────────────┘ └──────────────┘ └──────────────┘     │
└─────────────────────────────────────────────────────────┘
```

Compact cards in a horizontal scrollable row (consistent with the audit dashboard pattern). Clicking an auditor card navigates admin to `/dashboard?view=audit` with that auditor pre-selected.

### Implementation

#### 1. Update `AdminDashboard.tsx`
- Import `useAuditorWorkloadSummary` hook
- Fetch all KPIs at audit stage to compute per-auditor pending/in-audit/forwarded counts
- Render a new collapsible Card section "Audit Workload by Auditor" after the "KPIs by Review Stage" card
- Each auditor shown as a compact card with employee count + status badges
- Click navigates to `/dashboard?view=audit`

#### 2. No other file changes
The hook already exists. No DB changes needed.

### Files Changed
| File | Action |
|------|--------|
| `src/pages/admin/AdminDashboard.tsx` | Update — add auditor workload card section |

### Risk Assessment
- **Regression**: Zero — purely additive new section on admin dashboard
- **Data**: Read-only, reuses existing hook
- **Performance**: Hook has 60s staleTime, minimal additional queries

