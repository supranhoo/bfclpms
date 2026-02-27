

# Mobile and Tablet Responsiveness Improvement Plan

## Current State Assessment

The app already has some mobile foundations in place:
- A `useIsMobile` hook (768px breakpoint) used in ~9 components
- `MobileKpiCard` for the dashboard KPI list
- `MobileInboxList` for the inbox notifications
- Sidebar auto-closes on mobile navigation
- Auth page has mobile-specific background handling
- Touch-based tap-to-expand pattern for tooltips

However, many areas still use desktop-only layouts (full-width tables, dense grids, small touch targets) that break or become unusable on mobile and tablet devices.

---

## Phase 1: Foundation and Layout Fixes

**Goal:** Fix structural issues that affect every page on mobile.

### 1.1 Remove Legacy CSS Constraints
- `App.css` contains Vite's default `#root { max-width: 1280px; padding: 2rem; }` which conflicts with the full-width dashboard layout. Remove or override these stale rules.

### 1.2 Reduce Main Content Padding on Mobile
- `DashboardLayout.tsx` uses `p-6` padding on the `<main>` element for all screen sizes. On mobile, reduce to `p-3` or `p-4` to reclaim horizontal space.
  - Change: `p-3 sm:p-6`

### 1.3 Improve Sidebar Floating Trigger
- The floating sidebar trigger at `top-4 left-4` can overlap page content. Add safe padding or adjust position for mobile.

**Files:** `src/App.css`, `src/components/layout/DashboardLayout.tsx`

---

## Phase 2: Navigation and Core Controls

**Goal:** Make navigation and frequently-used controls thumb-friendly.

### 2.1 ViewModeToggle -- Horizontal Scroll on Mobile
- When a user has 4-5 modes (self, team, hr_pms, audit, management), the toggle bar overflows. Wrap it in a horizontally scrollable container on mobile and show labels as icons-only on small screens (already partially done with `hidden sm:inline`).

### 2.2 ReviewPeriodSelectorEnhanced -- Compact Mobile Layout
- The period selector toolbar (period + category filter + KPI count badge) stacks vertically on mobile but is still wide. Ensure selects use `w-full` on mobile instead of fixed widths.

### 2.3 PageHeader / ReviewPageHeader -- Stack on Mobile
- Headers with icon + title + description + period selector should stack vertically on mobile with reduced font sizes (`text-xl` instead of `text-2xl`).

**Files:** `src/components/review/ViewModeToggle.tsx`, `src/components/ui/ReviewPeriodSelectorEnhanced.tsx`, `src/components/review/ReviewPageHeader.tsx`

---

## Phase 3: Dashboard Self-View Mobile Optimization

**Goal:** Optimize the main employee dashboard for mobile and tablet.

### 3.1 Chart Row -- Stack on Mobile
- The `grid-cols-1 md:grid-cols-6` chart layout (Overall 1:5 Category) works but the Overall chart card is cramped. On mobile, ensure both cards get full width and adequate height.

### 3.2 WorkflowProgressTracker -- Scrollable Stages
- Already uses `useIsMobile` but verify that the stage pills are scrollable and touch targets are at least 44px.

### 3.3 KPI Detail Table Sort Control
- `KpiSortControl` is hidden on mobile (`!isMobile && <KpiSortControl />`). Add a simplified sort dropdown for mobile users.

### 3.4 Pending Period Alert -- Responsive Button Layout
- Alert buttons ("Switch to Jan 2026") already use `flex-wrap` but verify they don't overflow on narrow screens.

**Files:** `src/pages/Dashboard.tsx`, `src/components/review/WorkflowProgressTracker.tsx`, `src/components/ui/KpiSortControl.tsx`

---

## Phase 4: Inbox Mobile Experience

**Goal:** Polish the inbox/query page for touch devices.

### 4.1 Tab Bar -- Scrollable with Active Indicator
- 6 tabs (Notifications, Queries, Sent, Team, Snoozed, Insights) overflow on mobile. Already uses `overflow-x-auto` but needs `scrollbar-none` and `flex-nowrap` to prevent wrapping.

### 4.2 Use MobileInboxList Consistently
- `InboxTable` already switches to `MobileInboxList` on mobile -- verify all tabs (Snoozed, Team) pass through this path correctly.

### 4.3 Response Dialog -- Full-Screen on Mobile
- The response dialog (`sm:max-w-[500px]`) should use full-width on mobile with proper padding.

### 4.4 InboxFilters -- Collapsible on Mobile
- Filters take significant vertical space. Wrap them in a collapsible section on mobile with a "Filters" toggle button.

**Files:** `src/pages/QueryInbox.tsx`, `src/components/inbox/InboxFilters.tsx`, `src/components/inbox/InboxTable.tsx`

---

## Phase 5: Admin Pages Mobile Cards

**Goal:** Make admin pages usable on mobile (primarily for admin users on tablets).

### 5.1 UserManagement -- Mobile Card View
- The user table (1227 lines) uses a dense `<Table>` with 8+ columns. On mobile, switch to a card-based layout showing: avatar, name, role badge, department, and an edit button.

### 5.2 AllKpis -- Mobile Card View
- Similar table-to-card conversion for the KPI management table. Show KRA name, employee, status badge, and action buttons.

### 5.3 AdminDashboard -- Touch-Friendly Stat Cards
- Already uses responsive grid. Ensure "KPIs by Review Stage" icons and Quick Action buttons have adequate touch targets (min 44px height).

### 5.4 Admin Filter Bars -- Stacked on Mobile
- Multi-column filter bars (e.g., AllKpis has 5-column filter grid) should stack to 1-2 columns on mobile.

**Files:** `src/pages/admin/UserManagement.tsx`, `src/pages/admin/AllKpis.tsx`, `src/pages/admin/AdminDashboard.tsx`

---

## Phase 6: Review Sheets and Dialogs

**Goal:** Ensure all review interactions are fully usable on mobile.

### 6.1 SelfReviewSheet -- Full-Screen on Mobile
- The self-review Sheet should use full viewport width on mobile (`w-full` instead of the default sheet width). Already partially implemented per memory context.

### 6.2 KpiReviewPanel Sections -- Tighter Spacing
- Reduce vertical padding and font sizes within the KPI review panel on mobile. Ensure the "Review Journey" timeline uses tap-to-expand for remarks.

### 6.3 Score Selection Grid -- 2x2 on Mobile
- Per the existing design strategy, score selection grids should use 2x2 layout on mobile. Verify this is implemented consistently across all scorecard components (EmployeeScorecard, AuditScorecard, ManagementScorecard, UnifiedScorecard).

### 6.4 Dialogs -- Bottom Sheet Pattern
- Convert key dialogs (Add Observation, Query History, Rollback Request) to bottom-sheet drawers on mobile using the existing `Drawer` component from vaul.

**Files:** `src/components/review/SelfReviewSheet.tsx`, `src/components/review/KpiReviewPanel.tsx`, `src/components/review/UnifiedScorecard.tsx`, `src/components/review/RollbackRequestDialog.tsx`

---

## Phase 7: Reports and Miscellaneous Pages

**Goal:** Ensure reports and remaining pages work on mobile.

### 7.1 ReportsHub -- 1-Column Grid on Mobile
- Already uses `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`. Verify cards have adequate padding and touch targets on mobile.

### 7.2 Report Pages -- Horizontal Scroll for Tables
- Report tables (Performance, Monthly Scorecard, etc.) should wrap in a horizontal scroll container on mobile rather than squeezing columns.

### 7.3 Profile Settings -- Responsive Layout
- Ensure avatar upload, inline edit fields, and password change form stack properly on mobile.

### 7.4 ModuleHub -- Proper Spacing
- Already responsive (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`). No major changes needed.

### 7.5 Management Dashboard -- Charts Stack on Mobile
- The `lg:grid-cols-2` chart row should stack vertically on mobile. Verify recharts containers resize properly.

**Files:** `src/pages/reports/ReportsHub.tsx`, `src/pages/reports/PerformanceReport.tsx`, `src/pages/ProfileSettings.tsx`, `src/pages/ManagementDashboard.tsx`

---

## Phase 8: PWA and Touch Polish (Optional/Future)

**Goal:** App-like experience for frequent mobile users.

### 8.1 Install Prompt
- Add PWA manifest and service worker via `vite-plugin-pwa` so users can install the app to their home screen.

### 8.2 Pull-to-Refresh
- Add pull-to-refresh gesture on the dashboard and inbox pages.

### 8.3 Bottom Navigation Bar (Optional)
- For mobile, consider a fixed bottom nav bar with 4-5 key shortcuts (Dashboard, Inbox, Reports, Profile) to replace the sidebar for the most common actions.

---

## Implementation Priority

| Phase | Impact | Effort | Priority |
|-------|--------|--------|----------|
| Phase 1: Foundation | High | Low | Immediate |
| Phase 2: Navigation | High | Low | Immediate |
| Phase 3: Dashboard | High | Medium | High |
| Phase 4: Inbox | Medium | Medium | High |
| Phase 5: Admin Pages | Medium | High | Medium |
| Phase 6: Review Sheets | High | Medium | High |
| Phase 7: Reports | Low | Medium | Medium |
| Phase 8: PWA | Medium | High | Future |

---

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Regression | Medium | Mobile changes use Tailwind responsive prefixes; desktop layouts remain untouched |
| Data | None | No database or schema changes |
| Performance | Low | Card views may render more DOM nodes than table rows; mitigate with virtualization if needed |
| Workflow | None | No business logic changes |

## Documentation Updates

- Update `DOCUMENTATION.md` with the mobile/tablet responsive strategy
- Update the memory entry `design/responsive-ui-strategy` with new patterns introduced

