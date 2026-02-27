

# System Settings -- Vertical Sidebar Layout Redesign

## Problem

The System Settings page crams **10 tabs** into a single horizontal `grid-cols-10` TabsList. On most screens, the tab labels are hidden (icon-only via `hidden sm:inline`), making them hard to identify. As more settings are added (export, observations, etc.), this will only get worse.

## Solution: Resizable Two-Panel Layout

Replace the horizontal tab bar with a **vertical sidebar + content panel** layout using the existing `react-resizable-panels` library (already installed). This gives each section room to breathe and makes the page feel like a proper settings experience.

```text
+---------------------------+----------------------------------------+
|  [drag handle]            |                                        |
|  System Settings          |    [Active Section Content]            |
|                           |                                        |
|  > Branding        (*)    |    Global Branding Settings            |
|    General                |    ...                                 |
|    Scoring                |                                        |
|    Cycles                 |                                        |
|    Controls               |                                        |
|    Report Access          |                                        |
|    Email                  |                                        |
|    Templates              |                                        |
|    Passwords              |                                        |
|    Backups                |                                        |
+---------------------------+----------------------------------------+
```

## Key Design Decisions

1. **Vertical nav list on the left** -- Each item shows icon + full label at all times. Active item is highlighted with primary background. No more guessing which icon is which.

2. **Resizable panels** -- Uses `ResizablePanelGroup` (already in the project) so admins can drag to resize the sidebar vs content area. Default split: 20% sidebar / 80% content.

3. **Mobile: dropdown selector** -- On mobile (`< md`), the vertical sidebar collapses into a `Select` dropdown at the top, followed by the content below. This maintains full usability on small screens.

4. **Remove max-w-4xl constraint** -- The current `max-w-4xl` container limits the page to ~896px. With a sidebar layout, the page should use the full available width (`max-w-6xl` or full width), giving the content panel significantly more room.

5. **URL hash sync (optional enhancement)** -- Active tab stored in URL hash (`#branding`, `#scoring`) so users can bookmark or share direct links to specific settings sections.

## Changes

### 1. Rewrite `src/pages/admin/SystemSettings.tsx` Layout

- Replace `Tabs` + horizontal `TabsList` with `ResizablePanelGroup` (horizontal direction)
- Left panel: Vertical navigation list with icons + labels, styled as clickable items
- Right panel: Renders the active section component
- State managed with `useState` for `activeSection`
- On mobile (`useIsMobile()`): render a `Select` dropdown instead of the sidebar panel

### 2. Widen Container

Change `max-w-4xl` to `max-w-7xl` (or remove entirely) to give the content panel more horizontal space.

### 3. Mobile Adaptation

- Detect mobile via existing `useIsMobile()` hook
- Render a `Select` component with all 10 sections as options
- Content renders below the selector, using full width

---

## Technical Details

### Navigation Items Config

```text
const SETTINGS_SECTIONS = [
  { key: 'branding',  label: 'Branding',       icon: Building2 },
  { key: 'general',   label: 'General',         icon: RefreshCw },
  { key: 'scoring',   label: 'Scoring',         icon: Calculator },
  { key: 'cycles',    label: 'Cycles',          icon: CalendarDays },
  { key: 'controls',  label: 'Controls',        icon: SlidersHorizontal },
  { key: 'reports',   label: 'Report Access',   icon: Shield },
  { key: 'email',     label: 'Email',           icon: Mail },
  { key: 'templates', label: 'Templates',       icon: FileText },
  { key: 'passwords', label: 'Passwords',       icon: KeyRound },
  { key: 'backups',   label: 'Backups',         icon: Database },
];
```

### Desktop Layout Structure

```text
ResizablePanelGroup (horizontal)
  ResizablePanel (defaultSize=18, minSize=14, maxSize=25)
    -> Vertical nav list with scroll
  ResizableHandle (withHandle)
  ResizablePanel (defaultSize=82)
    -> Active section content (same components as today)
```

### Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/pages/admin/SystemSettings.tsx` | Rewrite layout | Replace horizontal tabs with vertical resizable sidebar + content panel |

No new files, no database changes, no new dependencies. All existing section components (`GlobalBrandingSettings`, `WorkflowSettingsTab`, etc.) remain completely untouched.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Regression | None | Section components are unchanged; only the container layout changes |
| Mobile | None | Falls back to Select dropdown, same as current icon-only tabs but more usable |
| Performance | None | No additional data fetching; same lazy-loaded content |

