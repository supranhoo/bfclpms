
# Plan: Complete Mobile Optimization for Review Pages

## Current State Analysis

### Already Mobile-Optimized ✅
| Component | Mobile Strategy |
|-----------|-----------------|
| `Dashboard.tsx` | Uses `useIsMobile()` → Shows `MobileKpiCard` for KPI list |
| `MyKpis.tsx` | Uses `useIsMobile()` → Shows `MobileMyKpiCard` for KPI list |
| `InboxTable.tsx` | Uses `useIsMobile()` → Shows `MobileInboxList` for query inbox |
| `EmployeeFilters.tsx` | Uses Tailwind responsive → 2-column grid on mobile, inline on desktop |
| `MobileKpiCard.tsx` | Purpose-built touch-friendly component with multiple view types |
| `EmployeeScorecard.tsx` | Uses `useIsMobile()` → Shows mobile card layout in review sheet |

### Partially Optimized ⚠️
| Component | Current State | Issue |
|-----------|---------------|-------|
| `TeamReview.tsx` | Responsive grid for employee cards | ✅ Already good - no table |
| `AuditPanel.tsx` | Responsive grid for employee cards | ✅ Already good - no table |
| `ManagementReview.tsx` | Responsive grid for employee cards | ✅ Already good - no table |

### Needs Optimization ❌
| Component | Issue |
|-----------|-------|
| `SelfReview.tsx` | Uses full Table with 9 columns - **unreadable on mobile** |

---

## Detailed Finding

After analysis, the **main review pages (TeamReview, AuditPanel, ManagementReview)** are already well-optimized:
- They use employee card grids that adapt to `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- Stats cards use `grid-cols-2` on mobile
- The actual KPI review happens inside Scorecard components which already use `MobileKpiCard`

**The only page with a significant mobile issue is `SelfReview.tsx`**, which renders a 9-column Table that is unusable on small screens.

---

## Implementation Plan

### Phase 1: Create Mobile Self-Review KPI Card

**New Component:** `src/components/review/MobileSelfReviewCard.tsx`

A simplified mobile card for the Self Review page that shows:
- Category + Status badges
- KRA/KPI names (truncated)
- Target, Weight, Achieved, Score
- Submit/Edit/View actions

```
┌─────────────────────────────────────────────┐
│ [🔵 Category] [Employee Name]    [Status]   │
├─────────────────────────────────────────────┤
│ KRA Name (truncated)                        │
│ KPI Name (truncated, smaller)               │
├─────────────────────────────────────────────┤
│ Target: 100 | Weight: 15% | Score: 4        │
├─────────────────────────────────────────────┤
│ [Submit] [View] [Timeline]                  │
└─────────────────────────────────────────────┘
```

### Phase 2: Update SelfReview.tsx with Mobile Detection

**File:** `src/pages/SelfReview.tsx`

Changes:
1. Import `useIsMobile` hook
2. Add `isMobile` state
3. Conditionally render:
   - **Desktop:** Existing 9-column Table
   - **Mobile:** Stack of `MobileSelfReviewCard` components

```typescript
// At top of component
const isMobile = useIsMobile();

// In render
{isMobile ? (
  <div className="space-y-3">
    {filteredKpis?.map(kpi => (
      <MobileSelfReviewCard
        key={kpi.id}
        kpi={kpi}
        submission={submissionMap.get(kpi.id)}
        employee={kpi.employee}
        onSubmit={() => openReviewDialog(kpi)}
        onView={() => openViewDialog(kpi)}
        onTimeline={() => openTimeline(kpi)}
        onShowLogic={() => openLogicModal(kpi)}
        isLocked={...}
        canEdit={...}
      />
    ))}
  </div>
) : (
  <Table>
    {/* Existing table code */}
  </Table>
)}
```

### Phase 3: Verify Review Status Overview on Mobile

The "Review Status Overview" section in SelfReview (admin view) uses a 5-column grid:
```typescript
<div className="grid gap-4 md:grid-cols-5">
```

This already collapses to single column on mobile, but we should update it to:
```typescript
<div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
```

This creates a better 2-column layout on mobile phones.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/review/MobileSelfReviewCard.tsx` | Touch-friendly card for Self Review KPIs |

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/SelfReview.tsx` | Add `useIsMobile()`, conditionally render mobile cards vs table, update admin grid |
| `DOCUMENTATION.md` | Document mobile optimization |

---

## Technical Details

### MobileSelfReviewCard.tsx

```typescript
interface MobileSelfReviewCardProps {
  kpi: KPI;
  submission?: ReviewSubmission;
  employee?: { full_name: string | null; employee_code: string | null } | null;
  onSubmit?: () => void;
  onView?: () => void;
  onTimeline?: () => void;
  onShowLogic?: () => void;
  isLocked?: boolean;
  isAdmin?: boolean;
}
```

The component will:
1. Show employee info only if `isAdmin` is true
2. Display N/A badge if `submission.is_na`
3. Show Lock badge if `isLocked`
4. Provide Submit/Edit buttons based on KPI status
5. Include View and Timeline action buttons
6. Make KRA/KPI names clickable to open logic modal

---

## Validation Checklist

After implementation:
- [ ] SelfReview page renders cards on mobile, table on desktop
- [ ] All actions (Submit, Edit, View, Timeline) work on mobile
- [ ] Employee info shows for admin users
- [ ] Locked KPIs show appropriate UI
- [ ] N/A KPIs display correctly
- [ ] Review Status grid is 2-column on mobile
- [ ] No horizontal scrolling required on mobile

---

## Scope Clarification

The following pages do **NOT** need changes as they are already optimized:
- `TeamReview.tsx` - Uses card grid, good on mobile
- `AuditPanel.tsx` - Uses card grid, good on mobile
- `ManagementReview.tsx` - Uses card grid, good on mobile
- `EmployeeFilters.tsx` - Already has mobile-responsive layout

The Scorecard components (`EmployeeScorecard`, `AuditScorecard`, `ManagementScorecard`) already use `useIsMobile()` and render `MobileKpiCard` on mobile.

---

## Estimated Effort

| Task | Effort |
|------|--------|
| Create MobileSelfReviewCard component | 1-2 hours |
| Update SelfReview.tsx with mobile detection | 30 minutes |
| Update admin status grid layout | 15 minutes |
| Testing on multiple screen sizes | 30 minutes |

**Total: 2-3 hours**
