
# Sync Profile Changes to User Management

## What the User Wants

When an employee updates their **Mobile Number** or **Profile Picture** from the `/profile` page, those changes should:
1. **Persist to the database** (already happening for mobile via edge function, avatar via direct storage upload)
2. **Be visible in User Management** (Admin table) — the mobile number column is missing from the table
3. **Be editable by admins** from the Edit User dialog in User Management
4. **Reflect instantly** (via query invalidation) without page reload

---

## Current State Analysis

### What already works
- `mobile_number` column EXISTS on `profiles` table (migration ran)
- `useProfiles()` does `select('*')` — so `mobile_number` is already fetched
- Avatar URL is already shown in User Management's User column
- Profile Settings page correctly saves mobile → DB via edge function and avatar → storage + profiles table
- `queryClient.invalidateQueries({ queryKey: ['profiles'] })` is called after both saves in ProfileSettings.tsx

### What is missing
1. **User Management table**: No "Mobile" column displayed — the table has: User, Employee Code, Department, Designation, PMS Grade, Role, Reporting To, Actions. Mobile is fetched but never shown.
2. **Admin Edit User dialog**: Has fields for Full Name, Email, Employee Code, Role, Department, Reporting Manager, Designation, PMS Grade — but NO mobile number field. Admin cannot view or edit an employee's mobile from here.
3. **updateUser mutation** in UserManagement.tsx: Does not include `mobile_number` in the `supabase.from('profiles').update({...})` call.
4. **`AuthContext.fetchProfile`** in ProfileSettings.tsx: The `refreshProfile` function dispatches a custom event but doesn't actually call `fetchProfile` from context. Should call `fetchProfile(user.id)` to refresh the in-memory auth profile.

---

## All Changes Required

### 1. Add "Mobile" column to the User Management table

**Location**: `src/pages/admin/UserManagement.tsx` — the `<TableHeader>` and `<TableBody>` rows

Add a "Mobile" column between "PMS Grade" and "Role":

```
| User | Code | Department | Designation | PMS Grade | Mobile | Role | Reporting To | Actions |
```

The mobile value is already available as `profile.mobile_number` (since `useProfiles` does `select('*')`).

Display: if no mobile, show `—`. If present, show as a clickable `tel:` link or plain text.

### 2. Add Mobile field to the Admin Edit User Dialog

**Location**: Same file, the Edit Dialog `<Dialog open={editDialogOpen}>` section (~line 764)

- Add state: `const [editMobile, setEditMobile] = useState('')`
- In `openEditDialog()`: set `setEditMobile((user as any).mobile_number || '')`
- In the Edit Dialog JSX: add a Phone input field after PMS Grade
- In `updateUser` mutation `mutationFn`: add `mobile_number` to the profile update

```typescript
// Mutation params type — add:
mobileNumber?: string;

// In profile update — add:
mobile_number: mobileNumber || null,
```

- In `handleSaveUser`: pass `mobileNumber: editMobile`

### 3. Fix the ProfileSettings `refreshProfile` to use AuthContext's `fetchProfile`

**Location**: `src/pages/ProfileSettings.tsx` line 128 and 160–166

Currently:
```typescript
const { user, profile, fetchProfile: _fetchProfile } = useAuth() as any;
// ...
const refreshProfile = useCallback(async () => {
  if (!user) return;
  await supabase.from('profiles').select('*').eq('id', user.id).single();
  queryClient.invalidateQueries({ queryKey: ['profiles'] });
  window.dispatchEvent(new Event('profile-updated'));
}, [user, queryClient]);
```

The `fetchProfile` is aliased as `_fetchProfile` (never used). The profile in AuthContext is never updated with the new mobile number. Fix:

```typescript
const { user, profile, fetchProfile } = useAuth() as any;
// ...
const refreshProfile = useCallback(async () => {
  if (!user) return;
  await fetchProfile(user.id);                              // updates AuthContext profile state
  queryClient.invalidateQueries({ queryKey: ['profiles'] }); // updates User Management list
}, [user, queryClient, fetchProfile]);
```

This ensures:
- The sidebar avatar/name updates instantly
- The mobile number in AuthContext profile updates so the page shows the new value without reload
- The User Management `['profiles']` cache is invalidated so the admin sees the new number immediately

### 4. Add `mobile_number` to the `updateUser` mutation type signature

**Location**: `src/pages/admin/UserManagement.tsx` lines 140–189

```typescript
// ADD to mutation params:
mobileNumber?: string;

// ADD to profile update object:
mobile_number: mobileNumber !== undefined ? (mobileNumber || null) : undefined,
```

---

## Files to Modify

| File | What Changes |
|---|---|
| `src/pages/admin/UserManagement.tsx` | (1) Add `editMobile` state + populate in `openEditDialog`; (2) Add mobile field to Edit Dialog JSX; (3) Update `updateUser` mutation to include `mobile_number`; (4) Add Mobile column header + cell to the table |
| `src/pages/ProfileSettings.tsx` | Fix `refreshProfile` to call `fetchProfile(user.id)` from AuthContext instead of discarding it |
| `DOCUMENTATION.md` | Version bump to 1.45.12 + note about admin mobile visibility |

---

## Technical Notes

- No database migration needed — `mobile_number` column already exists
- No edge function changes needed — admin can update `profiles.mobile_number` directly via Supabase client (RLS policy "Users can update own profile" covers admins too; if not, admin has broader `has_role(auth.uid(), 'admin')` policies)
- The `useProfiles()` query uses `select('*')` so `mobile_number` is already being fetched — zero query changes needed
- The Mobile column in the table is optional (not all users will have it) — gracefully show `—` when null
- The mobile input in the Edit Dialog does NOT go through the `update-user-profile` edge function (that's for self-service with format validation). Admin updates go directly via `supabase.from('profiles').update(...)` — same as all other profile fields the admin edits
- The column ordering in the table: Mobile fits naturally after PMS Grade before Role. The table currently has 9 columns including checkbox and actions — adding Mobile makes 10. This is acceptable but we can consider making it compact (Phone icon + number) to save space.
- Format: Display mobile as-is (raw stored format) with a Phone icon prefix for visual clarity
