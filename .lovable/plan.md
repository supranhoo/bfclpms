

# Plan: Workflow Progress Tracker with Clickable Filters

## Summary

Replace the current compact badge-based `ReviewStatusTracker` with a visual workflow pipeline that matches the provided mockup. Each stage becomes a clickable card that filters KPIs by that status, with connecting arrows showing flow progression and a colored progress bar at the bottom of each card.

---

## Design Reference

Based on the mockup, each stage card has:
- **Icon** in a circular container (top-left)
- **Count** as a large number (top-right)
- **Stage name** in uppercase (bottom-left)
- **Progress bar** at bottom with stage-specific color
- **Arrow (→)** between cards showing workflow direction

```text
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ ┌────────┐    ┌────────┐    ┌─────────────┐    ┌────────┐    ┌──────────┐          │
│ │ ☑   4 │→   │ 👤  0  │→   │ 🔍    2     │→   │ ✓   1  │→   │ ✓    2   │          │
│ │ KRA SET│    │SELF REV│    │MANAGER CHECK│    │ AUDIT  │    │APPROVED  │          │
│ │ ▬▬▬▬▬▬ │    │        │    │ ▬▬▬▬▬▬▬▬▬▬ │    │ ▬▬     │    │ ▬▬▬▬▬▬▬▬ │          │
│ └────────┘    └────────┘    └─────────────┘    └────────┘    └──────────┘          │
│                                                                                     │
│ [============================================================] 44% Complete         │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### 1. Create New WorkflowProgressTracker Component

**File:** `src/components/review/WorkflowProgressTracker.tsx`

This will be a complete redesign with:

```tsx
interface WorkflowProgressTrackerProps {
  kpis: KPI[];
  queries?: KpiQuery[];
  activeFilter?: string | null;          // Currently selected stage filter
  onFilterChange?: (stage: string | null) => void;  // Callback when stage clicked
  compact?: boolean;                      // For scorecard headers
}

// Stage configuration with icons
const stageConfig = [
  { key: 'kra_set', label: 'KRA SET', icon: ClipboardCheck, color: '#6B7280', borderColor: 'border-gray-300' },
  { key: 'self_review', label: 'SELF REVIEW', icon: User, color: '#3B82F6', borderColor: 'border-blue-300' },
  { key: 'manager_check', label: 'MANAGER CHECK', icon: Search, color: '#F97316', borderColor: 'border-orange-300' },
  { key: 'audit', label: 'AUDIT', icon: Shield, color: '#8B5CF6', borderColor: 'border-purple-300' },
  { key: 'management_review', label: 'MANAGEMENT', icon: Briefcase, color: '#10B981', borderColor: 'border-emerald-300' },
  { key: 'approved', label: 'APPROVED', icon: CheckCircle, color: '#22C55E', borderColor: 'border-green-300' },
];
```

### 2. Stage Card Component (Internal)

Each stage card structure:

```tsx
<div 
  className={cn(
    "bg-card rounded-lg border-2 p-3 cursor-pointer transition-all hover:shadow-md",
    isActive && "ring-2 ring-primary ring-offset-2",
    borderColor
  )}
  onClick={() => onFilterChange?.(isActive ? null : stage.key)}
>
  {/* Top row: Icon + Count */}
  <div className="flex items-start justify-between mb-2">
    <div className={cn(
      "h-8 w-8 rounded-full flex items-center justify-center",
      iconBgClass
    )}>
      <Icon className="h-4 w-4" />
    </div>
    <span className="text-2xl font-bold text-foreground">{count}</span>
  </div>
  
  {/* Stage Label */}
  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
    {stage.label}
  </p>
  
  {/* Progress Bar */}
  <div 
    className="h-1 rounded-full mt-2" 
    style={{ 
      backgroundColor: count > 0 ? stage.color : 'hsl(var(--muted))',
      width: `${(count / totalKpis) * 100}%`
    }} 
  />
</div>
```

### 3. Arrow Connector

Between stage cards:

```tsx
<div className="flex items-center px-1 text-muted-foreground">
  <ChevronRight className="h-5 w-5" />
</div>
```

### 4. Query Indicator on Stage Cards

If a stage has open queries, show a small orange dot:

```tsx
{hasOpenQuery && (
  <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-orange-500 border-2 border-background" />
)}
```

### 5. Overall Progress Bar

Below the stage cards, add a summary progress bar:

```tsx
<div className="mt-3 flex items-center gap-2">
  <Progress value={completionPercent} className="flex-1 h-2" />
  <span className="text-xs text-muted-foreground font-medium">
    {completionPercent.toFixed(0)}% Complete
  </span>
</div>
```

---

## Integration Points

### Dashboard.tsx

Replace current `ReviewStatusTracker` with new component AND add filter state:

```tsx
const [statusFilter, setStatusFilter] = useState<string | null>(null);

// Modify fullyFilteredKpis to include status filter
const fullyFilteredKpis = useMemo(() => {
  let filtered = periodFilteredKpis;
  
  if (activeCategory !== 'All') {
    const cat = categories?.find(c => c.name === activeCategory);
    filtered = filtered.filter(k => k.category_id === cat?.id);
  }
  
  // NEW: Apply status filter from workflow tracker
  if (statusFilter) {
    filtered = filtered.filter(k => k.status === statusFilter);
  }
  
  return filtered;
}, [periodFilteredKpis, activeCategory, categories, statusFilter]);

// In render:
<WorkflowProgressTracker 
  kpis={periodFilteredKpis}  // Use period-filtered for counts
  activeFilter={statusFilter}
  onFilterChange={setStatusFilter}
/>
```

### Scorecard Components (Compact Mode)

For `EmployeeScorecard`, `AuditScorecard`, `ManagementScorecard`:

```tsx
<WorkflowProgressTracker 
  kpis={kpis} 
  queries={queries}
  compact
/>
```

In compact mode:
- Smaller cards (reduced padding)
- Smaller icons and text
- Arrows hidden on mobile
- No click-to-filter (read-only display)

---

## Visual States

### Default State
- All stage cards visible with counts
- Arrows connecting stages
- Progress bar shows overall completion

### Active Filter State
- Selected stage has ring highlight
- Other stages remain visible but slightly dimmed
- Clicking active stage again clears filter

### Query Indicator
- Orange dot on any stage with open queries
- Tooltip shows count on hover

---

## Responsive Design

### Desktop (≥768px)
```text
[KRA] → [Self] → [Manager] → [Audit] → [Mgmt] → [Approved]
[=================== 67% Complete ===================]
```

### Mobile (<768px)
```text
[KRA] [Self] [Mgr]
[Audit] [Mgmt] [Done]
[===== 67% =====]
```

- 3 columns on mobile, no arrows
- Abbreviated labels
- Smaller text and icons

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/review/WorkflowProgressTracker.tsx` | Main workflow visualization component |

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Replace ReviewStatusTracker, add status filter state |
| `src/components/review/EmployeeScorecard.tsx` | Replace with WorkflowProgressTracker |
| `src/components/review/AuditScorecard.tsx` | Replace with WorkflowProgressTracker |
| `src/components/review/ManagementScorecard.tsx` | Replace with WorkflowProgressTracker |
| `src/components/review/ReviewStatusTracker.tsx` | Delete (replaced by new component) |
| `DOCUMENTATION.md` | Document new component and filter behavior |

---

## Stage Configuration

| Stage Key | Label | Icon | Color | Progress Bar |
|-----------|-------|------|-------|--------------|
| `kra_set` | KRA SET | ClipboardCheck | Gray | Gray bar |
| `self_review` | SELF REVIEW | User | Blue | Blue bar |
| `manager_check` | MANAGER CHECK | Search | Orange | Orange bar |
| `audit` | AUDIT | Shield | Purple | Purple bar |
| `management_review` | MANAGEMENT | Briefcase | Emerald | Emerald bar |
| `approved` | APPROVED | CheckCircle | Green | Green bar |

---

## Technical Notes

1. **Filter State**: Dashboard manages filter state; clicking a stage updates `statusFilter`
2. **Dual Data Sources**: Workflow shows counts from `periodFilteredKpis` (unaffected by status filter), while KPI table uses `fullyFilteredKpis` (affected by status filter)
3. **Query Detection**: Same logic as current—map open queries to KPI status to show indicator
4. **Dark Mode**: All colors have dark variants for accessibility
5. **Workflow Templates**: For future, stages can be dynamic based on `useEmployeeWorkflow` hook

---

## Testing Checklist

- [ ] Dashboard shows workflow tracker with all 5 stages + approved
- [ ] Clicking a stage filters the KPI table to that status
- [ ] Clicking active stage again clears filter
- [ ] Counts are accurate for each stage
- [ ] Progress bars reflect relative proportions
- [ ] Overall completion bar shows approved/total percentage
- [ ] Query indicators (●) appear on correct stages
- [ ] EmployeeScorecard shows compact tracker
- [ ] AuditScorecard shows compact tracker
- [ ] ManagementScorecard shows compact tracker
- [ ] Mobile layout shows 3-column grid without arrows
- [ ] Dark mode renders correctly
- [ ] Hover states on stage cards work

