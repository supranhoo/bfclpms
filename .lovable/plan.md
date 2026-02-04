

# Plan: Make Entire App Mobile-Friendly

## Overview

Implement comprehensive responsive design patterns across all pages and components to ensure optimal mobile experience (< 768px) while strictly preserving the existing desktop layout.

---

## Design Principles

1. **Mobile-First Breakpoint Strategy**: Use Tailwind's `sm:`, `md:`, `lg:` prefixes to apply desktop layouts progressively
2. **Conditional Rendering**: Use `useIsMobile()` hook for component swaps (cards vs tables)
3. **Touch-Friendly Targets**: Minimum 44px tap targets for interactive elements
4. **No Horizontal Scroll**: Eliminate wide tables on mobile; use stacked cards instead
5. **Preserved Desktop**: All changes use breakpoints/conditionals - desktop unchanged

---

## Scope Analysis

### Pages Requiring Mobile Optimization

| Page | Current Issues | Priority |
|------|----------------|----------|
| **Dashboard** | Already optimized (previous iteration) | Done |
| **My KPIs** | Wide table, complex review sheet | High |
| **Team Review** | Stats cards, employee grid, scorecard | High |
| **Audit Panel** | Same pattern as Team Review | High |
| **Management Review** | Same pattern as Team Review | High |
| **Query Inbox** | Table layout, tabs, filters | High |
| **Module Hub** | Already responsive (sm:grid-cols) | Low |
| **Auth** | Already responsive | Done |
| **Reports Hub** | Grid cards, mostly responsive | Medium |
| **Admin Pages** | Tables with many columns | Medium |

### Shared Components Requiring Updates

| Component | Changes Required |
|-----------|------------------|
| `AppSidebar` | Already collapses via SidebarTrigger | Done |
| `EmployeeFilters` | Stack filters vertically | High |
| `KpiDetailsTable` | Convert to mobile cards | High |
| `EmployeeScorecard` | Responsive header, score cards, table | High |
| `ReviewPageHeader` | Stack title/selector | High |
| `InboxTable` | Mobile card layout | High |
| `Sheet` components | Full-width on mobile | Medium |

---

## Phase 1: Core Layout Components

### 1.1 DashboardLayout Header (Mobile Trigger)

**File:** `src/components/layout/DashboardLayout.tsx`

Already has `SidebarTrigger` in header - no changes needed.

### 1.2 ReviewPeriodSelector (Already Updated)

Previously optimized to stack vertically on mobile.

### 1.3 EmployeeFilters - Mobile Optimization

**File:** `src/components/review/EmployeeFilters.tsx`

**Current:** Horizontal flex-wrap with fixed-width dropdowns  
**Mobile:** Vertical stack, full-width inputs

```typescript
// Change filter controls container
<div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3">
  {/* Search - full width on mobile */}
  <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-sm">
    ...
  </div>
  
  {/* Dropdowns - 2-column grid on mobile, inline on desktop */}
  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
    <Select>
      <SelectTrigger className="w-full sm:w-[160px]">
        ...
      </SelectTrigger>
    </Select>
    {/* ...repeat for each dropdown */}
  </div>
</div>
```

---

## Phase 2: My KPIs Page

**File:** `src/pages/MyKpis.tsx`

### 2.1 Page Header - Stack Vertically

```typescript
<div className="flex flex-col gap-4">
  <div className="flex items-center gap-3">
    <Target className="h-6 w-6" />
    <h1 className="text-xl sm:text-2xl font-bold">My KPIs</h1>
  </div>
  <ReviewPeriodSelector ... />
</div>
```

### 2.2 Stats Cards - 2-Column Grid

```typescript
<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
  {/* Smaller padding on mobile */}
  <Card className="p-3 sm:p-4">
    ...
  </Card>
</div>
```

### 2.3 Category Breakdown - Horizontal Scroll or Collapse

```typescript
<div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
  {categoryBreakdown.map(cat => (
    <Badge key={cat.id} className="shrink-0">...</Badge>
  ))}
</div>
```

### 2.4 KPI Table - Mobile Cards

Create `MobileMyKpiCard` component similar to Dashboard's `MobileKpiCard`:

```typescript
{isMobile ? (
  <div className="space-y-3">
    {sortedKpis.map(kpi => (
      <MobileMyKpiCard
        key={kpi.id}
        kpi={kpi}
        submission={submissionMap.get(kpi.id)}
        onReview={openReviewDialog}
        onShowLogic={setSelectedKpiLogic}
        isLocked={isKpiLocked(kpi)}
      />
    ))}
  </div>
) : (
  <KpiDetailsTable ... />
)}
```

### 2.5 Review Sheet - Full Width on Mobile

```typescript
<Sheet open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
  <SheetContent 
    side="right" 
    className="w-full sm:w-[90vw] sm:max-w-4xl overflow-y-auto"
  >
    ...
  </SheetContent>
</Sheet>
```

---

## Phase 3: Team Review, Audit Panel, Management Review

These three pages share identical structure - create shared patterns.

### 3.1 Page Headers - Already Responsive

Current code already uses `flex flex-col md:flex-row` - no changes needed.

### 3.2 Stats Cards - Responsive Grid

**Files:** `TeamReview.tsx`, `AuditPanel.tsx`, `ManagementReview.tsx`

```typescript
// Change from md:grid-cols-2 lg:grid-cols-5 to include mobile
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
  <Card>
    <CardContent className="pt-4 sm:pt-6">
      {/* Smaller text/icons on mobile */}
      <p className="text-xs sm:text-sm font-medium text-muted-foreground">...</p>
      <p className="text-xl sm:text-3xl font-bold">...</p>
      <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full ...">
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
      </div>
    </CardContent>
  </Card>
</div>
```

### 3.3 Employee Cards Grid - Responsive

```typescript
// Already uses md:grid-cols-2 lg:grid-cols-3 - add single column for mobile
<div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
```

### 3.4 EmployeeScorecard - Mobile Layout

**File:** `src/components/review/EmployeeScorecard.tsx`

**Header Section:**
```typescript
<div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
  <Button variant="ghost" size="icon" onClick={onBack}>
    <ArrowLeft className="h-5 w-5" />
  </Button>
  <div className="flex items-center gap-3 flex-1">
    <Avatar className="h-10 w-10 sm:h-12 sm:w-12">...</Avatar>
    <div className="min-w-0">
      <h1 className="text-lg sm:text-2xl font-bold truncate">...</h1>
      <p className="text-sm text-muted-foreground truncate">...</p>
    </div>
  </div>
  <Badge className="self-start sm:self-auto">...</Badge>
</div>
```

**Score Overview Grid:**
```typescript
// Stack charts on mobile
<div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-3">
  <Card>
    <CardContent className="h-[140px] sm:h-[180px]">...</CardContent>
  </Card>
  <Card className="md:col-span-2">...</Card>
</div>
```

**Stats Row:**
```typescript
<div className="grid gap-3 grid-cols-2 md:grid-cols-4">
  <Card>
    <CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4">
      <p className="text-[10px] sm:text-xs font-medium">...</p>
      <p className="text-lg sm:text-2xl font-bold">...</p>
    </CardContent>
  </Card>
</div>
```

**KPI Table - Reuse Mobile Cards Pattern:**
```typescript
{isMobile ? (
  <MobileScorecardKpiList kpis={sortedKpis} ... />
) : (
  <KpiDetailsTable ... />
)}
```

---

## Phase 4: Query Inbox

**File:** `src/pages/QueryInbox.tsx`

### 4.1 Stats Cards - 2x2 Grid

```typescript
<div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
```

### 4.2 Tabs - Scrollable on Mobile

```typescript
<TabsList className="flex w-full overflow-x-auto scrollbar-none">
  <TabsTrigger className="flex-shrink-0 text-xs sm:text-sm">...</TabsTrigger>
</TabsList>
```

### 4.3 InboxTable - Mobile Card Layout

**File:** `src/components/inbox/InboxTable.tsx`

```typescript
interface InboxTableProps {
  // ... existing props
}

export function InboxTable({ ... }: InboxTableProps) {
  const isMobile = useIsMobile();
  
  // ... existing loading/empty states
  
  return isMobile ? (
    <MobileInboxList 
      groupedItems={groupedItems} 
      onViewItem={onViewItem} 
      enableGrouping={enableGrouping}
    />
  ) : (
    // Existing table code
    <div className="rounded-md border">
      <Table>...</Table>
    </div>
  );
}
```

**Create MobileInboxList Component:**
```typescript
function MobileInboxList({ groupedItems, onViewItem, enableGrouping }) {
  return (
    <div className="space-y-4">
      {groupedItems.map(group => (
        <div key={group.label}>
          {enableGrouping && group.label && (
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
              {group.label} ({group.items.length})
            </p>
          )}
          <div className="space-y-2">
            {group.items.map(item => (
              <Card 
                key={item.id} 
                className={cn(
                  "p-3 cursor-pointer hover:bg-muted/50",
                  !item.isRead && "border-l-2 border-l-primary bg-primary/5"
                )}
                onClick={() => onViewItem(item)}
              >
                <div className="flex items-start gap-3">
                  {/* Type icon */}
                  <div className="shrink-0 mt-0.5">
                    {item.type === 'notification' ? (
                      <Bell className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <MessageSquare className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm line-clamp-2",
                      !item.isRead && "font-medium"
                    )}>
                      {item.title}
                    </p>
                    {item.message && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {item.message}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatRelativeTime(item.createdAt)}
                    </p>
                  </div>
                  
                  {/* Status badge */}
                  {item.queryStatus && (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {item.queryStatus}
                    </Badge>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

### 4.4 InboxDetailSheet - Full Width Mobile

```typescript
<Sheet open={open} onOpenChange={onOpenChange}>
  <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
    ...
  </SheetContent>
</Sheet>
```

---

## Phase 5: Admin Pages

Admin pages are typically used on desktop, but we should still ensure basic usability.

### 5.1 UserManagement - Responsive Table

**File:** `src/pages/admin/UserManagement.tsx`

For tables with many columns, implement horizontal scrolling container:

```typescript
<Card>
  <CardContent>
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <div className="min-w-[800px] sm:min-w-0">
        <Table>...</Table>
      </div>
    </div>
  </CardContent>
</Card>
```

Alternative for key admin tables: Priority columns on mobile

```typescript
// Hide less important columns on mobile
<TableHead className="hidden md:table-cell">Department</TableHead>
<TableHead className="hidden lg:table-cell">Manager</TableHead>
```

### 5.2 AdminDashboard - Responsive Stats

```typescript
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
```

---

## Phase 6: Reports Pages

### 6.1 ReportsHub - Already Responsive

Current grid uses `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` - works well.

### 6.2 Individual Report Pages

Most report pages use tables - apply same pattern as admin:
- Horizontal scroll container with min-width
- Hide non-essential columns on mobile
- Consider card-based summary view for top metrics

---

## Phase 7: Shared UI Components

### 7.1 Sheet Component - Full Width Mobile Size

**File:** `src/components/ui/sheet.tsx`

Add a "mobile-full" variant:

```typescript
const sheetVariants = cva(
  "...",
  {
    variants: {
      side: { ... },
      size: {
        // ... existing sizes
        "mobile-full": "w-full sm:max-w-2xl sm:w-auto",
      },
    },
  }
);
```

### 7.2 Dialog - Responsive Padding

Dialogs already use `sm:max-w-md` etc. Ensure inner content has:

```typescript
<DialogContent className="w-[95vw] sm:max-w-md px-4 sm:px-6">
```

### 7.3 Tables - Responsive Pattern Helper

Create a reusable wrapper component:

```typescript
// src/components/ui/ResponsiveTable.tsx
export function ResponsiveTableWrapper({ children, minWidth = 600 }) {
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <div style={{ minWidth }} className="sm:min-w-0">
        {children}
      </div>
    </div>
  );
}
```

---

## Phase 8: Mobile-Specific Components to Create

### New Components

| Component | Purpose |
|-----------|---------|
| `MobileMyKpiCard` | Card-based KPI display for My KPIs page |
| `MobileScorecardKpiList` | Scorecard KPIs as cards for EmployeeScorecard |
| `MobileInboxList` | Card-based inbox items for Query Inbox |
| `MobileEmployeeCard` | Already exists in Team Review (uses Card) |

### Shared Mobile KPI Card Structure

```typescript
interface MobileKpiCardProps {
  kpi: KPI;
  submission?: ReviewSubmission;
  onAction: () => void;
  actionLabel: string;
  showScore?: boolean;
  isLocked?: boolean;
}

function MobileKpiCard({ kpi, submission, onAction, actionLabel, showScore, isLocked }: MobileKpiCardProps) {
  return (
    <Card className={cn("p-4", isLocked && "opacity-60")}>
      {/* Row 1: Category + Status */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: kpi.kra_categories?.color }} />
          <span className="text-xs text-muted-foreground">{kpi.kra_categories?.name}</span>
        </div>
        <Badge className={statusColors[kpi.status]}>{statusLabels[kpi.status]}</Badge>
      </div>
      
      {/* Row 2: KRA/KPI Names */}
      <p className="font-medium text-sm mb-1">{kpi.kra_name}</p>
      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{kpi.kpi_name}</p>
      
      {/* Row 3: Metrics */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex gap-4">
          <div>
            <span className="text-[10px] text-muted-foreground block">Target</span>
            <span className="font-mono">{kpi.target_value}</span>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground block">Weight</span>
            <span>{kpi.weightage}%</span>
          </div>
          {showScore && submission?.self_score && (
            <div>
              <span className="text-[10px] text-muted-foreground block">Score</span>
              <span className="font-medium">{submission.self_score}</span>
            </div>
          )}
        </div>
        
        {/* Action Button */}
        {!isLocked && (
          <Button size="sm" onClick={onAction}>{actionLabel}</Button>
        )}
        {isLocked && (
          <Badge variant="outline" className="text-muted-foreground">
            <Lock className="h-3 w-3 mr-1" /> Locked
          </Badge>
        )}
      </div>
    </Card>
  );
}
```

---

## Files to Modify

### High Priority (Core User Flows)

| File | Changes |
|------|---------|
| `src/pages/MyKpis.tsx` | Mobile hook, stats grid, KPI cards, sheet width |
| `src/pages/TeamReview.tsx` | Stats grid, employee grid responsive |
| `src/pages/AuditPanel.tsx` | Stats grid, employee grid responsive |
| `src/pages/ManagementReview.tsx` | Stats grid, employee grid responsive |
| `src/pages/QueryInbox.tsx` | Stats grid, tabs scroll, mobile inbox cards |
| `src/components/review/EmployeeFilters.tsx` | Vertical stack, full-width inputs |
| `src/components/review/EmployeeScorecard.tsx` | Header stack, charts stack, mobile KPI cards |
| `src/components/review/AuditScorecard.tsx` | Same pattern as EmployeeScorecard |
| `src/components/review/ManagementScorecard.tsx` | Same pattern as EmployeeScorecard |
| `src/components/inbox/InboxTable.tsx` | Add mobile card layout |
| `src/components/review/KpiDetailsTable.tsx` | Add isMobile conditional render slot |

### Medium Priority (Admin/Reports)

| File | Changes |
|------|---------|
| `src/pages/admin/UserManagement.tsx` | Table scroll wrapper, hide columns |
| `src/pages/admin/AllKpis.tsx` | Table scroll wrapper |
| `src/pages/reports/*.tsx` | Table scroll wrappers, responsive headers |

### New Components to Create

| File | Purpose |
|------|---------|
| `src/components/review/MobileKpiCard.tsx` | Reusable mobile KPI card |
| `src/components/inbox/MobileInboxList.tsx` | Mobile inbox items display |

### Documentation

| File | Changes |
|------|---------|
| `DOCUMENTATION.md` | Add Mobile Responsive Patterns section |

---

## Implementation Order

1. **Create shared mobile components** (MobileKpiCard, MobileInboxList)
2. **Update EmployeeFilters** - affects all review pages
3. **Update My KPIs page** - highest traffic user page
4. **Update Team Review + EmployeeScorecard** - manager flow
5. **Update Audit/Management Review** - copy Team Review patterns
6. **Update Query Inbox + InboxTable** - communication hub
7. **Update Admin pages** - table scroll wrappers
8. **Update Sheet component** - mobile-full variant
9. **Documentation update**

---

## Testing Checklist

After implementation:

- [ ] Test on iPhone SE (320px width) - smallest supported
- [ ] Test on iPhone 14 Pro (390px width) - common device
- [ ] Test on iPad Mini (768px) - tablet breakpoint
- [ ] Verify sidebar collapses and trigger works
- [ ] Verify all filters accessible on mobile
- [ ] Verify all action buttons have adequate tap targets
- [ ] Verify sheets don't overflow screen
- [ ] Verify no horizontal scroll on main content
- [ ] Verify charts render at reduced sizes
- [ ] Verify dark mode works correctly
- [ ] Verify desktop layout unchanged at 1024px+

---

## Desktop Preservation Guarantees

Every change uses one of these safe patterns:

1. **Breakpoint prefixes**: `sm:`, `md:`, `lg:` - only apply at specified widths
2. **Conditional rendering**: `{isMobile ? <Mobile /> : <Desktop />}` - completely separate paths
3. **CSS Grid columns**: `grid-cols-2 md:grid-cols-4` - mobile layout is additional, not replacement
4. **Additive classes**: Mobile styles added, desktop styles remain via breakpoints

No destructive changes to desktop layouts will be made.

