
# Plan: Full Dark Mode Implementation

## Summary

Add a dark mode toggle to the top-right corner of the app and ensure all screens, tables, and components are fully compatible with dark mode. The project already has `next-themes` installed and dark mode CSS variables defined in `index.css`, but the ThemeProvider is not wired up and several components use hardcoded colors that need dark mode variants.

---

## Current State

| Component | Status |
|-----------|--------|
| CSS Variables (index.css) | Dark mode variables already defined |
| next-themes package | Installed but not configured |
| ThemeProvider | **NOT WIRED UP** in App.tsx |
| Components with `dark:` classes | 47 files already have partial dark mode support |
| Hardcoded colors (text-white, bg-*) | 24+ files need review |

---

## Implementation Steps

### 1. Create ThemeProvider Wrapper

Create a new component that wraps next-themes:

**File:** `src/components/ThemeProvider.tsx`

```tsx
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

### 2. Create Dark Mode Toggle Component

Create a toggle button for the header:

**File:** `src/components/ui/ThemeToggle.tsx`

```tsx
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
```

### 3. Wire ThemeProvider in App.tsx

Wrap the app with ThemeProvider:

```tsx
import { ThemeProvider } from "@/components/ThemeProvider";

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <QueryClientProvider client={queryClient}>
      {/* ... rest of app */}
    </QueryClientProvider>
  </ThemeProvider>
);
```

### 4. Add Theme Toggle to Headers

**DashboardLayout.tsx** - Add toggle to the header:
```tsx
<header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
  <SidebarTrigger className="-ml-1" />
  <Separator orientation="vertical" className="mr-2 h-4" />
  <div className="flex-1" />
  <ThemeToggle /> {/* ADD THIS */}
</header>
```

**MinimalHeader.tsx** - Add toggle before user menu:
```tsx
<div className="flex items-center gap-2">
  <ThemeToggle /> {/* ADD THIS */}
  <DropdownMenu>
    {/* User menu */}
  </DropdownMenu>
</div>
```

**Auth.tsx** - Add toggle in top-right corner for login page

---

## 5. Component Dark Mode Audit & Fixes

### Files Requiring Updates

The following files use hardcoded Tailwind colors that need dark mode variants:

| File | Issue | Fix |
|------|-------|-----|
| `src/pages/reports/AuditTrailReport.tsx` | Uses `bg-gray-100`, `bg-yellow-100`, etc. | Add `dark:bg-*-900` variants |
| `src/components/dashboard/KpiTimeline.tsx` | Uses `bg-slate-500`, `bg-sky-500` | Already contrast-safe, but verify |
| `src/pages/Dashboard.tsx` | Status badges with light backgrounds | Already has dark mode variants |
| `src/components/admin/ScoringSimulatorPopover.tsx` | `bg-blue-500 text-white`, etc. | These are fine (white on color) |
| `src/components/review/QualitativeValueInput.tsx` | `text-white` on colored badges | These are fine |
| Multiple Badge usages | `bg-*-100 text-*-800` pattern | Add `dark:bg-*-900 dark:text-*-200` |

### Pattern to Apply

For status/category badges using the pattern:
```tsx
// Before
className="bg-blue-100 text-blue-800"

// After
className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
```

### Files Already Dark-Mode Ready

These 47 files already have `dark:` classes and need minimal or no changes:
- Most scorecard components
- Review components
- Many admin components

---

## 6. Specific Component Fixes

### AuditTrailReport.tsx - Action Colors

```tsx
const actionColors: Record<string, string> = {
  'kpi_created': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  'kpi_updated': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200',
  // ... add dark variants to all entries
};
```

### Status Color Maps (Multiple Files)

Ensure all status color maps include dark mode variants:

```tsx
const statusColors: Record<string, string> = {
  kra_set: 'bg-muted text-muted-foreground',
  self_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  manager_check: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  audit: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};
```

### Table Styling

Tables use semantic colors (`bg-muted`, `border-border`) which automatically adapt. No changes needed for base table components.

### Card & Sheet Components

Already use semantic tokens (`bg-card`, `bg-background`). No changes needed.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/ThemeProvider.tsx` | Wrapper for next-themes |
| `src/components/ui/ThemeToggle.tsx` | Dark/light mode toggle button |

## Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Add ThemeProvider wrapper |
| `src/components/layout/DashboardLayout.tsx` | Add ThemeToggle to header |
| `src/components/layout/MinimalHeader.tsx` | Add ThemeToggle before user menu |
| `src/pages/Auth.tsx` | Add ThemeToggle in top-right corner |
| `src/pages/reports/AuditTrailReport.tsx` | Add dark mode variants to action colors |
| `src/pages/MyKpis.tsx` | Verify/add dark variants to badges |
| `src/pages/SelfReview.tsx` | Verify/add dark variants to badges |
| `src/pages/Dashboard.tsx` | Already has dark variants - verify |
| `src/pages/TeamReview.tsx` | Add dark variants to status badges |
| `src/pages/AuditPanel.tsx` | Already has dark variants - verify |
| `src/pages/ManagementReview.tsx` | Already has dark variants - verify |
| `src/components/review/EmployeeScorecard.tsx` | Add dark variants to score badges |
| `src/components/review/AuditScorecard.tsx` | Already has dark variants - verify |
| `src/components/review/ManagementScorecard.tsx` | Already has dark variants - verify |
| `src/components/dashboard/KpiTrackerModal.tsx` | Add dark variants to rating badges |
| `src/components/admin/AdminDailyEntryDialog.tsx` | Verify dark mode compatibility |
| `DOCUMENTATION.md` | Document dark mode feature |

---

## Visual Result

After implementation:
- Sun/Moon toggle button in top-right corner of all pages
- All backgrounds, text, and borders adapt to theme
- Charts use theme-aware colors via CSS variables
- Smooth transition between light and dark modes
- User preference persisted in localStorage

---

## Technical Notes

1. **CSS Variables**: Already defined in `index.css` - no changes needed
2. **Tailwind Config**: Already has `darkMode: ["class"]` - no changes needed
3. **Chart Colors**: Use `--chart-*` variables which are theme-aware
4. **Sonner Toast**: Already uses `useTheme` hook - will work automatically
5. **localStorage Persistence**: Handled by next-themes automatically

---

## Testing Checklist

After implementation, verify dark mode works on:

- [ ] Login page (Auth.tsx)
- [ ] Module Hub page
- [ ] Dashboard page
- [ ] My KPIs page with all status badges
- [ ] Team Review page with employee cards
- [ ] Audit Panel with all review states
- [ ] Management Review page
- [ ] All admin pages (User Management, Import Data, Settings, etc.)
- [ ] All report pages (Audit Trail, Performance, etc.)
- [ ] All modals, sheets, and dialogs
- [ ] All dropdowns and select menus
- [ ] Charts and graphs
- [ ] Tables with hover states
- [ ] Toast notifications
