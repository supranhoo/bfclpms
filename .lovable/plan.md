
# User Profile Settings & Dashboard Contact Card

## Overview

Two coordinated features:
1. **My Profile Settings** — A private settings page where any logged-in user can update their profile picture, mobile number, and password. Email updates for non-admins go through a standard email verification flow.
2. **Dashboard Contact Card** — When a reviewer (manager, admin, HR PMS, auditor, management) clicks an employee's name in the Team/HR/Audit/Management view, a small popover shows that employee's email and mobile number.

---

## Database Changes (Migration Required)

### Add `mobile_number` to `profiles` table

The `profiles` table currently has no phone/mobile field. We need to add one:

```sql
ALTER TABLE public.profiles 
ADD COLUMN mobile_number text;
```

No new table is needed — `mobile_number` belongs on `profiles` alongside `email`.

### Add a storage bucket for profile avatars

Currently no dedicated avatar bucket exists (`branding-assets` and `review-evidence` are the existing buckets). A new `avatars` bucket needs to be created:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

-- RLS: users can upload their own avatar
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'avatars');

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
```

### RLS Policy for `mobile_number` on `profiles`

The `profiles` table already has RLS. The existing update policy (if any) should allow users to update their own row. We need to verify and add a targeted policy for users updating their own sensitive fields (mobile, avatar_url):

```sql
-- Users can update their own profile fields
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());
```

---

## New Edge Function: `update-user-profile`

A secure server-side edge function to handle:
- Email change (calls `supabase.auth.admin.updateUserById` with `email_confirm: false` so the new email requires verification — unlike the admin's `update-user-email` function which bypasses verification)
- Password change (verifies current password by re-authenticating, then calls `updateUser`)
- Mobile number update (direct profile update)

This follows the same pattern as `supabase/functions/update-user-email/index.ts`.

```
supabase/functions/update-user-profile/index.ts
```

Operations supported:
- `update_mobile` → updates `profiles.mobile_number`
- `update_email` → calls auth `updateUser` (triggers verification email to new address)
- `update_password` → verifies current password, then calls `updateUser({ password })`

---

## New Page: `/profile` — My Profile Settings

A new protected page accessible to all authenticated roles.

### Route Addition
In `src/App.tsx`, add:
```tsx
<Route path="/profile" element={<ProtectedRoute allowedRoles={['admin','manager','employee','auditor','management','hr_pms']}><ProfileSettings /></ProtectedRoute>} />
```

### Sidebar Link Addition
In `src/components/layout/AppSidebar.tsx`, add a "My Profile" link in the footer's profile card area (clicking the avatar/name navigates to `/profile`), or add it to the `main` section menu items under My Dashboard.

### UI Layout of `/profile` Page (`src/pages/ProfileSettings.tsx`)

```
┌─────────────────────────────────────────────────────────┐
│  My Profile Settings                                    │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┐        │
│  │  PROFILE PICTURE                            │        │
│  │  [Avatar circle with camera overlay]        │        │
│  │  Click to upload · JPG/PNG · Max 5MB        │        │
│  └─────────────────────────────────────────────┘        │
│                                                         │
│  ┌─────────────────────────────────────────────┐        │
│  │  CONTACT INFORMATION                        │        │
│  │  Email ID     [firoz@example.com]  [Edit]   │        │
│  │  Mobile No.   [+91 9876543210  ]  [Edit]    │        │
│  │                     [Save Changes]          │        │
│  └─────────────────────────────────────────────┘        │
│                                                         │
│  ┌─────────────────────────────────────────────┐        │
│  │  CHANGE PASSWORD                            │        │
│  │  Current Password  [................]       │        │
│  │  New Password      [................]       │        │
│  │  Confirm Password  [................]       │        │
│  │                     [Update Password]       │        │
│  └─────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

### Component Details

**Profile Picture Upload:**
- Circular `<Avatar>` with a hover overlay showing a `Camera` icon
- On click → hidden `<input type="file" accept="image/*">` triggers
- Client-side preview before upload (using `URL.createObjectURL`)
- On confirm → upload to `avatars/{userId}/{timestamp}.jpg` in the `avatars` bucket
- Then update `profiles.avatar_url` with the public URL
- Old avatar is deleted from storage on new upload

**Contact Information Section (Email + Mobile):**
- Email field: displayed as read-only text with an "Edit" button. On click, an inline input appears with regex validation (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`). On save, calls `update-user-profile` edge function with `update_email` operation. A toast confirms "A verification email has been sent to your new address."
- Mobile field: displayed as read-only text with an "Edit" button. On click, an inline input appears with numeric-only validation (`/^\+?[0-9\s\-()]{7,15}$/`). On save, calls `update-user-profile` with `update_mobile`.
- Single "Save Changes" button saves both mobile + email if either has changed.

**Change Password Section:**
- Three password inputs: Current Password, New Password, Confirm New Password
- Validation:
  - All fields required
  - New password ≥ 8 characters
  - New password must contain at least one number or special character
  - Confirm must match New
- On submit, calls `update-user-profile` edge function with `update_password` (includes `currentPassword` for server-side re-auth verification)
- Password strength indicator (weak/medium/strong) shown below New Password field

---

## Dashboard Integration: Employee Contact Card

### Where it appears

In `EmployeeSelectorGrid.tsx`, the employee card already shows `member.full_name` as plain text. We make the name a clickable element that opens a small popover contact card — **without navigating away** and **without opening the full review panel**.

### What the Contact Card shows

```
┌──────────────────────────────────────────┐
│  [Avatar]  Jaspal Singh                  │
│            Senior Manager                │
│            Finance Department            │
│  ────────────────────────────────────    │
│  📧  jaspal.singh@company.com            │
│  📱  +91 98765 43210                     │
│  ────────────────────────────────────    │
│  [Copy Email]  [Copy Mobile]             │
└──────────────────────────────────────────┘
```

### Data Source

The `EmployeeSelectorGrid` already fetches full employee profiles via `useProfiles()` / `useTeamMembers()`. We need to add `mobile_number` to those queries so it is available in the contact card without any extra network call.

The `EmployeeProfile` interface gains `mobile_number?: string | null`.

### Access Control

- The contact card popover is **only visible to roles that can view other employees' profiles**: `manager`, `admin`, `hr_pms`, `auditor`, `management`.
- Employees in `self` view mode do not see clickable names on other employees.
- The data is protected at the DB level: existing `profiles` RLS already allows managers/admins to read employee profiles.

### Implementation

A new small component `src/components/review/EmployeeContactCard.tsx`:
- Uses `<Popover>` from Radix (already installed)
- Triggered by clicking the employee's name text in the `EmployeeSelectorGrid` card
- The click does NOT propagate to the parent card's `onClick` (which opens the full review panel) — uses `e.stopPropagation()`
- Shows a "View KPIs →" button at the bottom which does trigger the full panel open

---

## Files to Create / Modify

| File | Action | Description |
|---|---|---|
| `supabase/migrations/YYYYMMDD_add_mobile_number_to_profiles.sql` | CREATE | Add `mobile_number` column, avatars bucket, RLS policies |
| `supabase/functions/update-user-profile/index.ts` | CREATE | Edge function for profile updates (email, mobile, password) |
| `src/pages/ProfileSettings.tsx` | CREATE | Full profile settings page |
| `src/components/review/EmployeeContactCard.tsx` | CREATE | Popover contact card component |
| `src/App.tsx` | MODIFY | Add `/profile` route |
| `src/components/layout/AppSidebar.tsx` | MODIFY | Make profile card in footer clickable → navigates to `/profile` |
| `src/components/review/EmployeeSelectorGrid.tsx` | MODIFY | Include `mobile_number` in query, add name-click to show `EmployeeContactCard` |
| `src/hooks/useOrganization.ts` | MODIFY | Add `mobile_number` to `useTeamMembers` / `useProfiles` select |
| `DOCUMENTATION.md` | MODIFY | Version bump to 1.45.11 + feature docs |

---

## Security Considerations

- **Password change**: Current password is verified server-side via `supabase.auth.signInWithPassword` inside the edge function before calling `updateUser`. This prevents unauthorized password changes if a session is stolen.
- **Email change**: Uses Supabase's built-in verification flow (non-admin path) — the old email remains active until the new one is confirmed.
- **Mobile number**: No PII exposure to unauthorized roles. The contact card is only rendered for reviewer roles. The `profiles` RLS permits managers and admins to read all profile fields.
- **Avatar uploads**: Scoped to `avatars/{userId}/` folder — users can only write to their own folder. Public read is acceptable as avatars are already displayed publicly throughout the UI.
- **No role stored on profiles** — this plan does not touch the `user_roles` table or store roles anywhere except `user_roles`.

---

## Behaviour Notes

- The sidebar footer profile card (currently shows name + role + logout) will become clickable on the name/avatar area, navigating to `/profile`. The logout button stays as-is.
- The Profile Settings page is read-only by default — fields switch to edit mode only when the user clicks "Edit".
- The `AuthContext` `profile` object is refreshed after a successful profile save so the sidebar avatar and name update instantly without a page reload.
- For the password section, all three fields are cleared after a successful update.
- Mobile number is displayed formatted but stored raw (digits + optional `+`, spaces, dashes).
