
# Plan: Mobile Sidebar Fix + Dashboard Enhancement

## Overview

This plan addresses the three issues:
1. Fix mobile sidebar toggle visibility
2. Confirm unified dashboard is working (already done)
3. Optionally merge "My KPIs" submission into Dashboard

---

## Part 1: Fix Mobile Sidebar Toggle

### Problem
The floating `SidebarTrigger` only appears when desktop sidebar is collapsed. On mobile, the sidebar uses a `Sheet` component with separate `openMobile` state, so the trigger never shows.

### Solution

**File**: `src/components/layout/DashboardLayout.tsx`

Update the condition to handle both mobile and desktop scenarios:

```tsx
function DashboardContent() {
  const { state, isMobile, openMobile, setOpenMobile } = useSidebar();
  
  // Show floating trigger when:
  // - Mobile: sidebar sheet is closed (openMobile === false)
  // - Desktop: sidebar is collapsed (state === 'collapsed')
  const showFloatingTrigger = isMobile ? !openMobile : state === 'collapsed';
  
  return (
    <>
      {showFloatingTrigger && (
        <div className="fixed top-4 left-4 z-50">
          <SidebarTrigger className="bg-background border shadow-sm rounded-md p-2 hover:bg-accent" />
        </div>
      )}
      <SidebarInset>
        ...
      </SidebarInset>
    </>
  );
}
```

---

## Part 2: Dashboard Submission Capability (Optional)

If you want to eliminate "My KPIs" and make Dashboard the single entry point:

### Changes Required

1. **Add "Review" action to Dashboard KPI table**
   - Add a "Submit" button in the Actions column
   - Opens the `KpiReviewPanel` sheet (already exists)

2. **Import submission hooks in Dashboard**
   - `useSubmitSelfReview` from `useKpis`
   - `useSubPeriodSubmissionsByKpis` for daily/weekly KPIs

3. **Remove "My KPIs" from sidebar navigation**
   - Remove the menu item from `AppSidebar.tsx`
   - Optionally redirect `/my-kpis` to `/dashboard`

### Impact
- Single unified workspace for all users
- Dashboard becomes the primary KPI management interface
- Simpler navigation with fewer pages

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/layout/DashboardLayout.tsx` | Fix mobile sidebar trigger visibility |
| `src/pages/Dashboard.tsx` | (Optional) Add submission capability |
| `src/components/layout/AppSidebar.tsx` | (Optional) Remove "My KPIs" menu item |
| `src/App.tsx` | (Optional) Redirect `/my-kpis` to `/dashboard` |

---

## Recommended Approach

**Phase 1 (Immediate)**: Fix mobile sidebar trigger - quick fix
**Phase 2 (Your Choice)**: Decide whether to merge My KPIs into Dashboard

Would you like to:
- Just fix the mobile sidebar issue?
- Also add submission to Dashboard and remove My KPIs?
