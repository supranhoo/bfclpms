
# Phase 4 & 5: Dashboard Integration and Route Updates

## Overview

This plan integrates the newly created components (`ViewModeToggle`, `EmployeeSelectorGrid`, `UnifiedScorecard`) into the Dashboard and updates the routing/navigation to create a unified experience.

---

## Current State

**What's Built (Phases 1-3):**
- `ViewModeToggle.tsx` - Tab switcher component with role-based modes
- `EmployeeSelectorGrid.tsx` - Employee selection grid with level-specific stats
- `UnifiedScorecard.tsx` - Consolidated scorecard for manager/auditor/management views

**What's Missing (Phases 4-5):**
- Dashboard.tsx doesn't use these new components yet
- Routes still point to separate TeamReview, AuditPanel, ManagementReview pages
- Sidebar still shows separate navigation items

---

## Phase 4: Dashboard Enhancement

### Changes to `src/pages/Dashboard.tsx`

**New Imports:**
```typescript
import { useSearchParams } from 'react-router-dom';
import { ViewModeToggle, ViewMode } from '@/components/review/ViewModeToggle';
import { EmployeeSelectorGrid } from '@/components/review/EmployeeSelectorGrid';
import { UnifiedScorecard } from '@/components/review/UnifiedScorecard';
```

**New State:**
```typescript
const [searchParams] = useSearchParams();
const [viewMode, setViewMode] = useState<ViewMode>('self');
const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfile | null>(null);

// Initialize from URL query param
useEffect(() => {
  const viewFromUrl = searchParams.get('view') as ViewMode | null;
  if (viewFromUrl && availableModes.includes(viewFromUrl)) {
    setViewMode(viewFromUrl);
  }
}, [searchParams, availableModes]);
```

**Role-Based Available Modes:**
```typescript
const availableModes = useMemo(() => {
  const modes: ViewMode[] = ['self'];
  if (['manager', 'admin', 'management'].includes(role || '')) modes.push('team');
  if (['auditor', 'admin'].includes(role || '')) modes.push('audit');
  if (['management', 'admin'].includes(role || '')) modes.push('management');
  return modes;
}, [role]);
```

**Conditional Rendering Logic:**
```typescript
// At the top of the component return
{availableModes.length > 1 && (
  <ViewModeToggle
    currentMode={viewMode}
    availableModes={availableModes}
    onModeChange={(mode) => {
      setViewMode(mode);
      setSelectedEmployee(null);
    }}
  />
)}

// Main content
{viewMode === 'self' ? (
  // Current self-dashboard UI (unchanged)
) : selectedEmployee ? (
  <UnifiedScorecard
    viewLevel={viewMode === 'team' ? 'manager' : viewMode}
    employee={selectedEmployee}
    selectedPeriod={selectedPeriod}
    selectedYear={selectedYear}
    onPeriodChange={setSelectedPeriod}
    onYearChange={setSelectedYear}
    onBack={() => setSelectedEmployee(null)}
  />
) : (
  <EmployeeSelectorGrid
    viewLevel={viewMode}
    selectedPeriod={selectedPeriod}
    selectedYear={selectedYear}
    onPeriodChange={setSelectedPeriod}
    onYearChange={setSelectedYear}
    onSelectEmployee={setSelectedEmployee}
  />
)}
```

---

## Phase 5: Routing & Navigation Updates

### Changes to `src/App.tsx`

**Convert legacy routes to redirects:**
```typescript
// Replace these routes with redirects
<Route path="/team-review" element={<Navigate to="/dashboard?view=team" replace />} />
<Route path="/audit" element={<Navigate to="/dashboard?view=audit" replace />} />
<Route path="/management-review" element={<Navigate to="/dashboard?view=management" replace />} />
```

### Changes to `src/components/layout/AppSidebar.tsx`

**Update menu items paths to use query params:**
```typescript
const menuItems = {
  // ... main stays the same
  manager: [
    { title: 'Team Review', icon: Users, path: '/dashboard?view=team', roles: ['manager', 'admin', 'management'] },
  ],
  management: [
    { title: 'Management Review', icon: Briefcase, path: '/dashboard?view=management', roles: ['management', 'admin'] },
  ],
  audit: [
    { title: 'Audit Panel', icon: Shield, path: '/dashboard?view=audit', roles: ['auditor', 'admin'] },
  ],
  // ...
};
```

**Update path matching logic** to handle query params:
```typescript
const getSectionForPath = (pathname: string, search: string): string => {
  const fullPath = pathname + search;
  if (fullPath.includes('view=team')) return 'manager';
  if (fullPath.includes('view=audit')) return 'audit';
  if (fullPath.includes('view=management')) return 'management';
  // existing logic...
};
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Dashboard.tsx` | Add view mode state, import new components, conditional rendering |
| `src/App.tsx` | Redirect legacy routes to `/dashboard?view=X` |
| `src/components/layout/AppSidebar.tsx` | Update navigation paths to use query params |

---

## User Experience After Implementation

| Role | Dashboard Tabs | Flow |
|------|---------------|------|
| Employee | (none - single mode) | Sees only self-dashboard |
| Manager | [My Dashboard] [Team Review] | Toggle between modes, employee grid → scorecard |
| Auditor | [My Dashboard] [Audit] | Toggle modes, employee grid → scorecard |
| Management | [My Dashboard] [Team Review] [Management] | All three modes available |
| Admin | [My Dashboard] [Team Review] [Audit] [Management] | Full access to all modes |

---

## Technical Benefits

1. **Single Entry Point**: One Dashboard component handles all views
2. **URL State**: View mode persisted in URL (`/dashboard?view=team`)
3. **Deep Links**: Legacy routes automatically redirect with preserved query params
4. **Consistent UX**: Same layout across all roles
5. **Code Reduction**: Leverages shared components instead of 4 separate pages

---

## Implementation Steps

1. Modify `Dashboard.tsx`:
   - Add imports for ViewModeToggle, EmployeeSelectorGrid, UnifiedScorecard
   - Add viewMode and selectedEmployee state
   - Add availableModes calculation based on role
   - Add URL query param initialization
   - Wrap existing self-dashboard content in conditional
   - Add ViewModeToggle at top
   - Add conditional rendering for reviewer modes

2. Modify `App.tsx`:
   - Change `/team-review`, `/audit`, `/management-review` routes to redirects

3. Modify `AppSidebar.tsx`:
   - Update paths to use query params
   - Update path matching to handle query params

4. Update `DOCUMENTATION.md`:
   - Document unified dashboard architecture
