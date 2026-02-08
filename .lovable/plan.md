
# Implementation Plan: Unified Dashboard for All Review Levels

## Overview

This plan unifies the four separate interfaces (Dashboard, TeamReview, AuditPanel, ManagementReview) into a single adaptive Dashboard that switches between view modes based on user role. The employee selector grid remains fully preserved for reviewer modes.

---

## Current Architecture Summary

| Page | Lines | Scorecard Component | Lines |
|------|-------|---------------------|-------|
| Dashboard.tsx | 523 | (inline) | - |
| TeamReview.tsx | 362 | EmployeeScorecard | 1081 |
| AuditPanel.tsx | 345 | AuditScorecard | 1100 |
| ManagementReview.tsx | 335 | ManagementScorecard | 1118 |

**Total: ~4,864 lines across 7 files**

The scorecard components share approximately 85% identical code with differences only in:
- Stats cards (different status labels)
- Score field names (manager_score vs auditor_score vs management_score)
- Send-back target options
- Score cascade logic (which prior level score to use)

---

## Unified Architecture

### New Component Structure

```text
Dashboard.tsx (Enhanced)
├── ViewModeToggle (new - for role-based switching)
├── [Self Mode] - Current self-dashboard UI
└── [Reviewer Mode]
    ├── [No employee selected] → EmployeeSelectorGrid (new)
    └── [Employee selected] → UnifiedScorecard (new)
```

### View Modes

| Mode | Visible To | Data Source | Primary Actions |
|------|-----------|-------------|-----------------|
| `self` | All | `useMyKpis()` | Review, Submit |
| `team` | Manager, Admin, Management | `useKpisByEmployee()` | Approve, Query, Send Back |
| `audit` | Auditor, Admin | `useKpisByEmployee()` | Verify, Forward, Send Back |
| `management` | Management, Admin | `useKpisByEmployee()` | Final Approve, Send Back |

---

## Phase 1: Create ViewModeToggle Component

**New File**: `src/components/review/ViewModeToggle.tsx`

A segmented control that shows available view modes based on user role:

```typescript
interface ViewModeToggleProps {
  currentMode: 'self' | 'team' | 'audit' | 'management';
  availableModes: Array<'self' | 'team' | 'audit' | 'management'>;
  onModeChange: (mode: ViewMode) => void;
}
```

**UI**: Horizontal tabs/pills with icons:
- Self: Home icon - "My Dashboard"
- Team: Users icon - "Team Review" 
- Audit: Shield icon - "Audit"
- Management: Briefcase icon - "Management"

---

## Phase 2: Create EmployeeSelectorGrid Component

**New File**: `src/components/review/EmployeeSelectorGrid.tsx`

Extracts the employee card grid from TeamReview/AuditPanel/ManagementReview into a reusable component:

```typescript
interface EmployeeSelectorGridProps {
  viewLevel: 'team' | 'audit' | 'management';
  employees: EmployeeProfile[];
  periodKpis: KPI[];
  selectedPeriod: string;
  selectedYear: number;
  onSelectEmployee: (employee: EmployeeProfile) => void;
}
```

**Features**:
- Reuses `EmployeeFilters` component (already shared)
- Stats cards adapt based on `viewLevel`:
  - Team: Open KPIs, Pending Review, Reviewed, Total
  - Audit: Pending Audit, In Audit, Forwarded
  - Management: Pending Review, Approved, Total
- Employee card badges show level-appropriate status counts

---

## Phase 3: Create UnifiedScorecard Component

**New File**: `src/components/review/UnifiedScorecard.tsx` (~600 lines)

This consolidates the 3 scorecard components (EmployeeScorecard, AuditScorecard, ManagementScorecard) into one, using `viewLevel` prop to control behavior:

```typescript
interface UnifiedScorecardProps {
  viewLevel: 'manager' | 'auditor' | 'management';
  employee: EmployeeProfile;
  selectedPeriod: string;
  selectedYear: number;
  onPeriodChange: (period: string) => void;
  onYearChange: (year: number) => void;
  onBack: () => void;
  autoOpenKpiId?: string | null;
}
```

**Key Differences Handled by viewLevel**:

| Aspect | Manager | Auditor | Management |
|--------|---------|---------|------------|
| Score field | manager_score | auditor_score | management_score |
| Prior score | self_score | manager_score | auditor_score |
| Forward status | manager_check | management_review | approved |
| Send-back targets | employee | manager, employee | auditor, manager, employee |
| Action labels | Approve | Forward | Final Approve |

**Score cascade logic (consolidated)**:
```typescript
const getRelevantScore = (submission, viewLevel) => {
  switch (viewLevel) {
    case 'manager': return submission?.manager_score || submission?.self_score || 0;
    case 'auditor': return submission?.auditor_score || submission?.manager_score || submission?.self_score || 0;
    case 'management': return submission?.management_score || submission?.auditor_score || submission?.manager_score || submission?.self_score || 0;
  }
};
```

---

## Phase 4: Enhance Dashboard.tsx

**Modified File**: `src/pages/Dashboard.tsx`

Add view mode state and conditional rendering:

```typescript
// New state
const [viewMode, setViewMode] = useState<'self' | 'team' | 'audit' | 'management'>('self');
const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfile | null>(null);

// Role-based available modes
const availableModes = useMemo(() => {
  const modes: ViewMode[] = ['self'];
  if (['manager', 'admin', 'management'].includes(role)) modes.push('team');
  if (['auditor', 'admin'].includes(role)) modes.push('audit');
  if (['management', 'admin'].includes(role)) modes.push('management');
  return modes;
}, [role]);
```

**Rendering Logic**:
```typescript
// Show mode toggle only if user has multiple modes
{availableModes.length > 1 && (
  <ViewModeToggle
    currentMode={viewMode}
    availableModes={availableModes}
    onModeChange={setViewMode}
  />
)}

// Conditional content
{viewMode === 'self' ? (
  // Current self-dashboard (unchanged)
) : selectedEmployee ? (
  // UnifiedScorecard for selected employee
  <UnifiedScorecard
    viewLevel={viewMode === 'team' ? 'manager' : viewMode}
    employee={selectedEmployee}
    onBack={() => setSelectedEmployee(null)}
    ...
  />
) : (
  // Employee selector grid
  <EmployeeSelectorGrid
    viewLevel={viewMode}
    onSelectEmployee={setSelectedEmployee}
    ...
  />
)}
```

---

## Phase 5: Update Routing & Navigation

**Modified Files**: 
- `src/App.tsx`: Redirect legacy routes to dashboard with query params
- `src/components/layout/AppSidebar.tsx`: Update navigation links

**Route Changes**:
```typescript
// Redirect legacy routes
<Route path="/team-review" element={<Navigate to="/dashboard?view=team" replace />} />
<Route path="/audit" element={<Navigate to="/dashboard?view=audit" replace />} />
<Route path="/management-review" element={<Navigate to="/dashboard?view=management" replace />} />
```

**URL-Based Mode Initialization** (in Dashboard.tsx):
```typescript
const [searchParams] = useSearchParams();
const viewFromUrl = searchParams.get('view') as ViewMode | null;

useEffect(() => {
  if (viewFromUrl && availableModes.includes(viewFromUrl)) {
    setViewMode(viewFromUrl);
  }
}, [viewFromUrl, availableModes]);
```

**Sidebar Navigation Changes**:
- Replace separate menu items with unified "Dashboard" entry
- Keep visual distinction using badges or secondary text for modes

---

## Phase 6: Permission Validation

Add role-based access control in Dashboard:

```typescript
// Validate mode access on mode change
const handleModeChange = (mode: ViewMode) => {
  if (!availableModes.includes(mode)) {
    toast({ title: 'Access denied', variant: 'destructive' });
    return;
  }
  setViewMode(mode);
  setSelectedEmployee(null);
};
```

---

## Files Summary

### New Files (3)
| File | Purpose | Est. Lines |
|------|---------|------------|
| `src/components/review/ViewModeToggle.tsx` | Mode switching tabs | ~80 |
| `src/components/review/EmployeeSelectorGrid.tsx` | Employee grid (extracted) | ~250 |
| `src/components/review/UnifiedScorecard.tsx` | Consolidated scorecard | ~600 |

### Modified Files (3)
| File | Changes |
|------|---------|
| `src/pages/Dashboard.tsx` | Add view mode state, conditional rendering |
| `src/App.tsx` | Redirect legacy routes |
| `src/components/layout/AppSidebar.tsx` | Update navigation |

### Deprecated Files (6) - Keep for Backward Compatibility
- `src/pages/TeamReview.tsx`
- `src/pages/AuditPanel.tsx`
- `src/pages/ManagementReview.tsx`
- `src/components/review/EmployeeScorecard.tsx`
- `src/components/review/AuditScorecard.tsx`
- `src/components/review/ManagementScorecard.tsx`

---

## User Experience Flow

### Employee View (role: employee)
1. Opens Dashboard → sees only "My Dashboard" mode
2. Reviews their own KPIs (unchanged experience)

### Manager View (role: manager)
1. Opens Dashboard → sees [My Dashboard] [Team Review] tabs
2. Clicks "Team Review" → sees employee selector grid with team members
3. Clicks an employee card → sees UnifiedScorecard for that employee
4. Clicks "Back" → returns to employee grid

### Auditor View (role: auditor)
1. Opens Dashboard → sees [My Dashboard] [Audit] tabs
2. Clicks "Audit" → sees all employees grid with audit-specific stats
3. Reviews employees with UnifiedScorecard in auditor mode

### Management View (role: management)
1. Opens Dashboard → sees [My Dashboard] [Team Review] [Management] tabs
2. Can switch between any available mode
3. Each mode shows appropriate data and actions

### Admin View (role: admin)
1. Sees all tabs: [My Dashboard] [Team Review] [Audit] [Management]
2. Full access to all review modes

---

## Technical Benefits

1. **Code Reduction**: ~4,800 lines → ~2,500 lines (~48% reduction)
2. **Single Source of Truth**: One scorecard component with consistent logic
3. **Easier Maintenance**: Bug fixes apply to all levels automatically
4. **Consistent UX**: Same layout, navigation, and patterns across roles
5. **Better Mobile**: Single responsive implementation
6. **Preserved Workflows**: All existing actions and permissions work identically

---

## Implementation Order

1. **ViewModeToggle** - Simple component, foundation for switching
2. **EmployeeSelectorGrid** - Extract from existing pages
3. **UnifiedScorecard** - Consolidate scorecard logic
4. **Dashboard Enhancement** - Wire everything together
5. **Routing Updates** - Redirect legacy routes
6. **Navigation Updates** - Update sidebar
7. **Testing** - Verify all role/mode combinations
8. **Documentation** - Update DOCUMENTATION.md

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Regression in review workflows | Keep old pages as fallback, thorough testing |
| Permission errors | Explicit role validation before mode switch |
| Mobile UX issues | Test each phase on mobile |
| Deep link breakage | Maintain route redirects with query param preservation |
