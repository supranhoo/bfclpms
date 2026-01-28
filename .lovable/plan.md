
# Add Module Hub Page Between Login and PMS

## Overview

Transform the application from a single-module PMS app to a **multi-module enterprise platform**. After logging in, users will see a **Module Hub** page where they can select which module to access.

## Current Flow
```
Login (/auth) → PMS Dashboard (/dashboard)
```

## Proposed Flow
```
Login (/auth) → Module Hub (/home) → PMS Dashboard (/dashboard)
                                   → [Future: HRMS, LMS, etc.]
```

## Database Changes

### 1. Add `enabled_modules` to `app_settings` table
Store which modules are enabled for the organization:
```sql
ALTER TABLE app_settings 
ADD COLUMN enabled_modules jsonb DEFAULT '["pms"]'::jsonb;
```

### 2. Create `modules` table for module configuration
```sql
CREATE TABLE modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,           -- 'pms', 'hrms', 'lms'
  name text NOT NULL,                  -- 'Performance Management'
  description text,                    -- 'Track KPIs, reviews...'
  icon text NOT NULL,                  -- 'Target', 'Users', 'GraduationCap'
  color text DEFAULT 'primary',        -- For card styling
  route text NOT NULL,                 -- '/dashboard'
  is_enabled boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Seed PMS module
INSERT INTO modules (code, name, description, icon, route, display_order)
VALUES ('pms', 'Performance Management', 'Track KPIs, conduct reviews, and drive organizational growth', 'Target', '/dashboard', 1);
```

### 3. Create `user_module_access` table (optional - for role-based module access)
```sql
CREATE TABLE user_module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  module_code text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, module_code)
);
```

## New Pages & Components

### 1. Module Hub Page (`src/pages/ModuleHub.tsx`)
A visually appealing landing page showing available modules as cards:

| Feature | Description |
|---------|-------------|
| Module Cards | Large, clickable cards with icon, name, description |
| User Welcome | Display user name and quick profile access |
| Module Access Control | Show only modules the user has access to |
| Responsive Grid | 1 column mobile, 2-3 columns desktop |

**UI Design:**
- Clean, modern card-based layout
- Module cards with gradient backgrounds
- Hover effects and animations
- Quick access to user profile/settings

### 2. Module Card Component (`src/components/modules/ModuleCard.tsx`)
Reusable card component for each module:
```tsx
interface ModuleCardProps {
  code: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  route: string;
  onClick: () => void;
}
```

### 3. Minimal Header Component (`src/components/layout/MinimalHeader.tsx`)
Simple header for the Module Hub (no full sidebar):
- Logo + App name
- User avatar with dropdown (profile, logout)

## Routing Changes

### Update `App.tsx`:
```tsx
// New route for Module Hub
<Route path="/home" element={<ModuleHub />} />

// Update root redirect
<Route path="/" element={<Navigate to="/home" replace />} />
```

### Update `Auth.tsx`:
After successful login, redirect to `/home` instead of `/dashboard`:
```tsx
if (user) {
  return <Navigate to="/home" replace />;
}
```

### Update `DashboardLayout.tsx`:
Add a "Back to Hub" link in the sidebar header.

## Hooks

### `useModules.ts`
Fetch enabled modules and user access:
```typescript
export function useModules() {
  // Fetch all enabled modules
  // Filter by user access if user_module_access is used
}
```

## Admin Configuration

### Add Module Management Section
In **System Settings**, add a section to:
- Enable/disable modules
- Configure module display order
- (Future) Assign modules to roles

## Files to Create/Modify

| File | Action |
|------|--------|
| **New Files** | |
| `src/pages/ModuleHub.tsx` | Create - Main module selection page |
| `src/components/modules/ModuleCard.tsx` | Create - Module card component |
| `src/components/layout/MinimalHeader.tsx` | Create - Simple header for hub |
| `src/hooks/useModules.ts` | Create - Module data fetching |
| **Modified Files** | |
| `src/App.tsx` | Add /home route, update redirects |
| `src/pages/Auth.tsx` | Redirect to /home after login |
| `src/components/layout/AppSidebar.tsx` | Add "Back to Hub" link |
| `src/hooks/useAppSettings.ts` | Add enabled_modules field |
| `DOCUMENTATION.md` | Document multi-module architecture |

## User Experience

### Module Hub Page Layout
```
┌─────────────────────────────────────────────────────────┐
│  [Logo] App Name                    [Avatar] John Doe ▼ │
├─────────────────────────────────────────────────────────┤
│                                                         │
│              Welcome back, John!                        │
│         Select a module to get started                  │
│                                                         │
│   ┌─────────────────┐    ┌─────────────────┐           │
│   │    🎯           │    │    👥           │           │
│   │   Performance   │    │     HRMS        │           │
│   │   Management    │    │   (Coming Soon) │           │
│   │                 │    │                 │           │
│   │   Track KPIs... │    │   Manage HR...  │           │
│   └─────────────────┘    └─────────────────┘           │
│                                                         │
│   ┌─────────────────┐    ┌─────────────────┐           │
│   │    🎓           │    │    📊           │           │
│   │     LMS         │    │   Analytics     │           │
│   │   (Coming Soon) │    │   (Coming Soon) │           │
│   │                 │    │                 │           │
│   │   Learning...   │    │   Reports...    │           │
│   └─────────────────┘    └─────────────────┘           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Future Extensibility

This architecture enables:
1. **Adding new modules** - Just add rows to `modules` table
2. **Role-based access** - Use `user_module_access` table
3. **Module-specific settings** - Add module_config jsonb column
4. **Cross-module navigation** - Consistent header with module switcher

## Summary

This implementation adds a clean intermediary page between login and the PMS module, setting up the architecture for a multi-module enterprise application. The PMS functionality remains unchanged - it's just accessed through the new Module Hub.
