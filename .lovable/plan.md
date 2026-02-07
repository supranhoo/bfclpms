

# Plan: Mobile Sidebar Improvements - Auto-Hide & Expandable Sections

## Overview

This plan improves the mobile sidebar experience with two key features:
1. **Auto-hide on navigation**: Sidebar automatically closes after tapping a menu item
2. **Expandable sections**: Menu groups can collapse/expand to reduce scrolling

---

## Current Issues

| Issue | Impact |
|-------|--------|
| Sidebar stays open after navigation | User must manually close it every time |
| All menu groups always expanded | Long scroll, especially for admins with 14+ items |
| Hard to find current section | No visual indication of which group is active |

---

## Solution 1: Auto-Hide on Navigation (Mobile)

### How It Works

When on mobile, after tapping any menu item, the sidebar will automatically close after a brief delay to let the user see the selection.

### Implementation

**AppSidebar.tsx changes:**

1. Import `useSidebar` hook:
```tsx
import { useSidebar } from '@/components/ui/sidebar';
```

2. Add auto-close logic:
```tsx
export function AppSidebar() {
  const { setOpenMobile, isMobile } = useSidebar();
  
  const handleNavigation = (path: string) => {
    navigate(path);
    // Auto-close sidebar on mobile after navigation
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  
  // Use handleNavigation instead of direct navigate() calls
}
```

3. Update all `SidebarMenuButton` onClick handlers:
```tsx
<SidebarMenuButton
  isActive={location.pathname === item.path}
  onClick={() => handleNavigation(item.path)}  // Changed from navigate()
>
```

---

## Solution 2: Expandable/Collapsible Menu Sections

### How It Works

- Each menu group (Main, Manager, Admin, Reports, etc.) becomes collapsible
- Clicking the group header toggles expand/collapse
- The group containing the current route auto-expands
- Other groups stay collapsed to reduce scrolling

### Visual Design

```
+---------------------------+
| [Logo] App Name           |
| [←] Back to Hub           |
+---------------------------+
| ▼ Main                    |  <- Expanded (active route)
|   • Dashboard             |
|   • My KPIs ←(active)     |
|   • Inbox [3]             |
|   • PMS Policy            |
+---------------------------+
| ► Manager                 |  <- Collapsed
+---------------------------+
| ► Administration (14)     |  <- Collapsed, shows count
+---------------------------+
| ► Reports                 |  <- Collapsed
+---------------------------+
| [User Profile] Sign Out   |
+---------------------------+
```

### Implementation

**AppSidebar.tsx changes:**

1. Import Collapsible components:
```tsx
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
```

2. Create state to track which sections are open:
```tsx
// Determine which section contains the current path
const getCurrentSection = () => {
  if (menuItems.main.some(item => location.pathname === item.path)) return 'main';
  if (menuItems.manager.some(item => location.pathname === item.path)) return 'manager';
  if (menuItems.management.some(item => location.pathname === item.path)) return 'management';
  if (menuItems.audit.some(item => location.pathname === item.path)) return 'audit';
  if (menuItems.admin.some(item => location.pathname.startsWith(item.path))) return 'admin';
  if (menuItems.reports.some(item => location.pathname.startsWith(item.path))) return 'reports';
  return 'main';
};

const [openSections, setOpenSections] = useState<Set<string>>(
  new Set([getCurrentSection()])
);

// Auto-open section when route changes
useEffect(() => {
  const section = getCurrentSection();
  if (!openSections.has(section)) {
    setOpenSections(prev => new Set([...prev, section]));
  }
}, [location.pathname]);

const toggleSection = (section: string) => {
  setOpenSections(prev => {
    const next = new Set(prev);
    if (next.has(section)) {
      next.delete(section);
    } else {
      next.add(section);
    }
    return next;
  });
};
```

3. Create a reusable CollapsibleSidebarGroup component:
```tsx
function CollapsibleSidebarGroup({ 
  label, 
  sectionKey, 
  items, 
  isOpen, 
  onToggle,
  filterByRole,
  currentPath,
  onNavigate,
  badge,
  inboxBadgeCount
}: {
  label: string;
  sectionKey: string;
  items: typeof menuItems.main;
  isOpen: boolean;
  onToggle: () => void;
  filterByRole: (items: typeof menuItems.main) => typeof menuItems.main;
  currentPath: string;
  onNavigate: (path: string) => void;
  badge?: number;
  inboxBadgeCount?: number;
}) {
  const filteredItems = filterByRole(items);
  if (filteredItems.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <SidebarGroup className="py-0">
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="cursor-pointer hover:bg-sidebar-accent/50 rounded-md px-2 flex justify-between items-center">
            <span>{label}</span>
            <div className="flex items-center gap-1">
              {badge && badge > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {badge}
                </Badge>
              )}
              <ChevronDown 
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-200",
                  isOpen && "rotate-180"
                )} 
              />
            </div>
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={currentPath === item.path}
                    onClick={() => onNavigate(item.path)}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                    {'showBadge' in item && item.showBadge && inboxBadgeCount && inboxBadgeCount > 0 && (
                      <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1 flex items-center justify-center text-xs">
                        {inboxBadgeCount}
                      </Badge>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
```

4. Replace static SidebarGroups with CollapsibleSidebarGroup:
```tsx
<SidebarContent>
  <CollapsibleSidebarGroup
    label="Main"
    sectionKey="main"
    items={menuItems.main}
    isOpen={openSections.has('main')}
    onToggle={() => toggleSection('main')}
    filterByRole={filterByRole}
    currentPath={location.pathname}
    onNavigate={handleNavigation}
    inboxBadgeCount={inboxBadgeCount}
  />
  
  {(role === 'manager' || role === 'management' || role === 'admin') && (
    <CollapsibleSidebarGroup
      label="Manager"
      sectionKey="manager"
      items={menuItems.manager}
      isOpen={openSections.has('manager')}
      onToggle={() => toggleSection('manager')}
      filterByRole={filterByRole}
      currentPath={location.pathname}
      onNavigate={handleNavigation}
    />
  )}
  
  {/* ... similar for other sections ... */}
  
  {role === 'admin' && (
    <CollapsibleSidebarGroup
      label="Administration"
      sectionKey="admin"
      items={menuItems.admin}
      isOpen={openSections.has('admin')}
      onToggle={() => toggleSection('admin')}
      filterByRole={filterByRole}
      currentPath={location.pathname}
      onNavigate={handleNavigation}
      badge={menuItems.admin.length}  // Shows (14) count when collapsed
    />
  )}
</SidebarContent>
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/layout/AppSidebar.tsx` | Add auto-close, collapsible groups |

---

## Mobile UX After Implementation

### Before
1. Tap hamburger → Sidebar opens
2. Tap "My KPIs" → Page loads, sidebar stays open
3. Tap X or outside → Sidebar closes
4. **3 taps total**

### After  
1. Tap hamburger → Sidebar opens
2. Tap "My KPIs" → Page loads, sidebar auto-closes
3. **2 taps total** (33% fewer taps!)

### Collapsed Sections Benefit

For admins with 14+ items in Administration:
- **Before**: Scroll ~400px to reach Reports section
- **After**: Click to collapse Admin, see all sections at once

---

## Testing Checklist

- [ ] Mobile: Sidebar auto-closes after tapping any menu item
- [ ] Desktop: Sidebar behavior unchanged (stays open)
- [ ] Collapsible groups expand/collapse on click
- [ ] Active route's group auto-expands
- [ ] Multiple groups can be open simultaneously
- [ ] Chevron icon rotates on expand/collapse
- [ ] Admin section shows item count badge when collapsed
- [ ] "Back to Hub" link still works
- [ ] Inbox badge count displays correctly

