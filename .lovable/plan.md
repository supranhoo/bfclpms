

# Store and Display PMS Policy Document In-App

## Summary

Replace the current iframe/URL-based PMS Policy page with a fully in-app document stored in the database. The policy content will be rendered as formatted HTML, editable by admins, and accessible to all employees via the sidebar.

## Before

- PMS Policy page loads an external URL via iframe
- Only accessible to admins in sidebar
- No policy content stored in the system
- Policy URL field in Global Branding settings

## Changes

### 1. Database: Add `pms_policy_content` column

Add a `text` column to `app_settings` to store the full policy document as markdown/HTML content. Seed it with the provided policy text.

### 2. Sidebar: Make PMS Policy visible to all roles

Change the sidebar entry from `roles: ['admin']` to all roles so every employee can read the policy.

Update the route in `App.tsx` to allow all authenticated roles.

### 3. Rewrite `PMSPolicy.tsx`

**Before**: Iframe loading an external URL, admin-only access, no inline content.

**After**:
- Renders the stored policy content directly as formatted HTML with proper headings, tables, and structure
- All employees see a read-only beautifully formatted document with a Table of Contents sidebar
- Admins see an "Edit Policy" button that opens a full-screen editor dialog with a large textarea
- PDF export button for downloading the policy
- Print-friendly styling
- Falls back to the URL-based iframe if only `pms_policy_url` is set (backward compatibility)

### 4. Create `PolicyEditor` admin component

A dialog/sheet with:
- Large textarea for editing the policy content (markdown-style)
- Live preview toggle
- Save button that updates `app_settings.pms_policy_content`
- Version note field (optional)

### 5. Create `PolicyRenderer` component

Parses the stored text and renders it as structured HTML:
- Headings (h1-h4) from lines starting with `#`
- Tables from pipe-delimited text
- Bullet lists, numbered lists
- Bold/italic formatting
- Checkbox items
- Code blocks for flowcharts (monospace)
- Auto-generated Table of Contents with anchor links

### 6. Update hooks and types

- Add `pms_policy_content` to `AppSettings` interface
- Add it to the `useUpdateAppSettings` mutation's allowed fields

### 7. Update `DOCUMENTATION.md`

Document the new in-app policy storage and rendering system.

## After

- **All employees**: See "PMS Policy" in sidebar under Main section. Clicking it shows the full formatted policy document with a clickable Table of Contents, professional typography, and styled tables.
- **Admins**: See an additional "Edit Policy" button in the top-right corner. Clicking opens a full-screen editor where they can modify the policy text and save it back to the database.
- The policy is a self-contained document inside the app -- no external URLs needed.

## Technical Details

### Files to Create
| File | Purpose |
|---|---|
| `src/components/policy/PolicyRenderer.tsx` | Markdown-to-HTML renderer for policy content |
| `src/components/policy/PolicyEditorDialog.tsx` | Admin editor dialog with textarea |

### Files to Modify
| File | Change |
|---|---|
| Database migration (SQL) | Add `pms_policy_content` text column, seed with full policy |
| `src/pages/PMSPolicy.tsx` | Rewrite to use stored content + PolicyRenderer |
| `src/hooks/useAppSettings.ts` | Add `pms_policy_content` to interface and mutation |
| `src/components/layout/AppSidebar.tsx` | Change PMS Policy roles to all roles |
| `src/App.tsx` | Update route to allow all authenticated roles |
| `DOCUMENTATION.md` | Document the feature |

### Risk
Low -- additive changes. The iframe fallback is preserved for backward compatibility if only a URL is configured.
