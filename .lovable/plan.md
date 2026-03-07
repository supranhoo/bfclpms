

# Plan: Redesign User Management as a Full-Page Form Layout

## Current State
The User Management page uses a **table + small dialog popups** for editing/creating users. The edit dialog is a compact modal with fields stacked vertically in a narrow container. This feels cramped and hard to use for a feature that involves many fields.

## Proposed Design
Convert the Edit and Create dialogs from small modal popups into **full-page, large form layouts** using a wide `DialogContent` (or a Sheet/full-screen dialog). The form fields will be organized in a **multi-column grid layout** with clear sections.

### Changes to `src/pages/admin/UserManagement.tsx`

**1. Edit Dialog -- Convert to Large Form**
- Change `<DialogContent>` to use `className="max-w-3xl"` (wide dialog) or `max-w-4xl`
- Organize fields into **sections with grid layouts**:
  - **Personal Information** (2-col grid): Full Name, Email, Employee Code, Mobile Number
  - **Organization** (2-col grid): Department, Designation, PMS Grade, Reporting Manager
  - **Access & Role** (2-col grid): Role dropdown, Account Status switch
- Add section headers with subtle dividers for visual grouping
- Use `ScrollArea` for the form body to handle overflow gracefully

**2. Create Dialog -- Same Large Form Treatment**
- Expand from `max-w-md` to `max-w-3xl`
- Same section-based grid layout as the Edit dialog
- Consistent look and feel

**3. Visual Improvements**
- Section titles (e.g., "Personal Details", "Organization", "Access Control") with `text-sm font-semibold text-muted-foreground` styling
- 2-column grid (`grid grid-cols-1 md:grid-cols-2 gap-4`) for form fields
- Account Status section gets a highlighted card-style container (already exists, keep it)

### Files Modified
| File | Change |
|------|--------|
| `src/pages/admin/UserManagement.tsx` | Widen Edit & Create dialogs, reorganize fields into sectioned 2-col grid layout |

### Risk Assessment
- **Regression Risk**: None -- only visual/layout changes to existing dialogs. All mutation logic and state management unchanged.
- **UI/UX**: Improves form usability by giving fields more space and logical grouping.

