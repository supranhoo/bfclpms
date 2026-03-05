

# Bug Bounty Audit Report

## Category 1: Logic & Functional Bugs

### BUG-001: UserManagement `AppRole` type missing `hr_pms` and `skip_level` roles (CRITICAL)
**File**: `src/pages/admin/UserManagement.tsx` line 23
**Issue**: Local type `AppRole = 'admin' | 'manager' | 'employee' | 'auditor' | 'management'` is missing `hr_pms` and `skip_level`. The canonical definition in `src/lib/roles.ts` includes all 7 roles. This means:
- Admin cannot assign `hr_pms` or `skip_level` roles from the User Management page
- Role filter dropdown won't show these roles
- Role color badges will fall through to undefined styling for HR PMS users

**Fix**: Replace local type with import from `src/lib/roles.ts`. Add missing role colors.
```typescript
// Line 23: Replace local type
import type { AppRole } from '@/lib/roles';

// Line 25-31: Add missing colors
const roleColors: Record<AppRole, string> = {
  admin: 'bg-destructive/10 text-destructive',
  manager: 'bg-primary/10 text-primary',
  employee: 'bg-secondary text-secondary-foreground',
  auditor: 'bg-accent text-accent-foreground',
  management: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  hr_pms: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  skip_level: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
};
```
**Test**: Unit test that verifies all roles from `ALL_APP_ROLES` have a corresponding color entry. Verify role filter dropdown renders all roles. Verify assigning `hr_pms` role works.

---

### BUG-002: Create User form missing email validation (MEDIUM)
**File**: `src/pages/admin/UserManagement.tsx` line 410-424
**Issue**: `handleCreateUser` only checks `!newFullName || !newEmployeeCode`. It does not validate:
- Empty email (edge function will fail silently)
- Invalid email format
- Excessively long names (no `maxLength`)

**Fix**: Add email format validation and field length limits.
```typescript
const handleCreateUser = () => {
  if (!newFullName.trim() || !newEmployeeCode.trim()) {
    toast({ title: 'Full name and employee code are required', variant: 'destructive' });
    return;
  }
  if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
    toast({ title: 'Invalid email format', variant: 'destructive' });
    return;
  }
  // ... proceed
};
```
**Test**: Unit test for `handleCreateUser` with empty email, invalid email, whitespace-only name.

---

### BUG-003: PolicyRenderer uses `dangerouslySetInnerHTML` without sanitization (SECURITY)
**File**: `src/components/policy/PolicyRenderer.tsx` line 186
**Issue**: Admin-authored markdown content is rendered via `dangerouslySetInnerHTML`. While content is admin-controlled (not user-input), the `parseMarkdownLine` function does not escape HTML entities in non-code content, meaning injected `<script>` or `<img onerror>` tags in policy content would execute.

**Fix**: Escape HTML entities before applying markdown transformations in `parseMarkdownLine`, or add a lightweight sanitizer.
```typescript
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseMarkdownLine(line: string): string {
  let html = escapeHtml(line);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // ... rest of transforms
}
```
**Test**: Unit test confirming `<script>alert(1)</script>` in policy content is escaped to `&lt;script&gt;`.

---

### BUG-004: `SendBackDialog` textarea has no length limit (EDGE CASE)
**File**: `src/components/review/SendBackDialog.tsx` line 95-100
**Issue**: The reason textarea has no `maxLength`. Users can paste megabytes of text, causing DB insert failures or performance issues.

**Fix**: Add `maxLength={2000}` to the textarea and show a character counter.

**Test**: Unit test verifying the textarea rejects input beyond 2000 characters.

---

## Category 2: State Management

### BUG-005: UserManagement pagination doesn't reset on filter change (LOW)
**File**: `src/pages/admin/UserManagement.tsx`
**Issue**: When `searchQuery`, `roleFilter`, or `departmentFilter` changes, `currentPage` is not reset to 1. If user is on page 5 and applies a filter that yields 2 results, they see an empty page.

**Fix**: Reset `currentPage` to 1 when any filter changes:
```typescript
const handleSearchChange = (q: string) => { setSearchQuery(q); setCurrentPage(1); };
const handleRoleFilterChange = (r: string) => { setRoleFilter(r); setCurrentPage(1); };
const handleDepartmentFilterChange = (d: string) => { setDepartmentFilter(d); setCurrentPage(1); };
```

**Test**: Unit test: set page to 3, change search query, verify page resets to 1.

---

### BUG-006: QueryInbox unread count only reflects loaded page (LOW)
**File**: `src/pages/QueryInbox.tsx` line 120-123
**Issue**: `unreadNotificationsCount` counts only from the paginated `notifications` array (first 20), not the total unread count. As more notifications load, the count changes — misleading the user.

**Fix**: Use `notificationsTotalCount` minus read count from server, or add a dedicated unread count query.

---

## Category 3: UI/UX Consistency

### BUG-007: `TieredOptionsBuilder` uses array index as React key (LOW)
**File**: `src/components/admin/TieredOptionsBuilder.tsx` line 96
**Issue**: `key={index}` on a list where items can be reordered/deleted causes React to mix up component state when items are removed from the middle.

**Fix**: Use the option's score or a stable ID as the key: `key={option.score ?? index}`.

---

### BUG-008: Role filter dropdown in UserManagement missing `hr_pms` option (MEDIUM)
**Issue**: Cascading from BUG-001 — the role filter `Select` only shows roles from the local `AppRole` type. HR PMS users exist in the system but cannot be filtered for.

**Fix**: Resolved by BUG-001 fix (importing canonical `AppRole`). Also update the role filter Select to iterate over `ALL_APP_ROLES`.

---

## Category 4: Performance

### BUG-009: Dashboard fetches ALL submissions twice (LOW)
**File**: `src/pages/Dashboard.tsx` lines 76 and 192
**Issue**: `useReviewSubmissions(kpiIds)` is called with period-filtered KPI IDs at line 76, AND again with ALL KPI IDs at line 192 (`allSubmissions`). The second call fetches every submission across all periods. For users with 100+ KPIs across 12 months, this is ~1200 rows fetched on every dashboard load.

**Fix**: The `allSubmissions` query is used for KPI history. Consider lazy-loading it only when a KPI review panel is opened, rather than eagerly on page load.

---

## Summary Table

| ID | Severity | Category | Component | Description |
|---|---|---|---|---|
| BUG-001 | CRITICAL | Logic | UserManagement | Missing `hr_pms`/`skip_level` from local AppRole type |
| BUG-002 | MEDIUM | Validation | UserManagement | No email validation on create user |
| BUG-003 | SECURITY | XSS | PolicyRenderer | `dangerouslySetInnerHTML` without sanitization |
| BUG-004 | LOW | Edge Case | SendBackDialog | No textarea length limit |
| BUG-005 | LOW | State | UserManagement | Pagination not reset on filter change |
| BUG-006 | LOW | State | QueryInbox | Unread count only reflects loaded page |
| BUG-007 | LOW | UI | TieredOptionsBuilder | Array index as React key |
| BUG-008 | MEDIUM | UI | UserManagement | Role filter missing hr_pms option |
| BUG-009 | LOW | Performance | Dashboard | Eager full-history submission fetch |

## Implementation Plan

1. **Fix BUG-001 + BUG-008** (same file): Import `AppRole` from `src/lib/roles.ts`, add missing role colors, update role filter dropdown.
2. **Fix BUG-002**: Add email/name validation to `handleCreateUser`.
3. **Fix BUG-003**: Add HTML escaping to `PolicyRenderer`'s `parseMarkdownLine`.
4. **Fix BUG-004**: Add `maxLength` to SendBackDialog textarea.
5. **Fix BUG-005**: Reset pagination on filter change.
6. **Fix BUG-007**: Use stable keys in TieredOptionsBuilder.
7. **Create unit tests** for BUG-001 (role completeness), BUG-002 (validation), BUG-003 (XSS escaping).
8. **Defer BUG-006 and BUG-009** as optimizations for a follow-up pass.

### Risk Assessment
- **Data Impact**: None — all fixes are frontend display/validation logic
- **Regression Risk**: Low — BUG-001 fix extends type coverage (additive), BUG-003 adds escaping before transforms
- **Workflow Impact**: BUG-001 fix enables previously broken HR PMS role assignment

