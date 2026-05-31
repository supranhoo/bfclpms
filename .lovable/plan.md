# Investigation: "Confirmation Date" and "Location" not visible

## Finding — the code is already in place

The previously approved plan was fully implemented in the source tree. I re-verified every claim:

| Surface | File | Lines | Status |
|---|---|---|---|
| Add User → Confirmation Date | `src/pages/admin/UserManagement.tsx` | 1615–1626 | ✅ rendered after DOJ |
| Add User → Location | `src/pages/admin/UserManagement.tsx` | 1709–1717 | ✅ rendered after Employment Status |
| Edit User → Confirmation Date | `src/pages/admin/UserManagement.tsx` | 1353 | ✅ present |
| Edit User → Location | `src/pages/admin/UserManagement.tsx` | 1435 | ✅ present |
| Create mutation payload | `src/pages/admin/UserManagement.tsx` | 740–741 | ✅ sends both |
| Edit mutation payload | `src/pages/admin/UserManagement.tsx` | 711–712 | ✅ sends both |
| Edge function accepts both | `supabase/functions/create-employee/index.ts` | 27, 149 | ✅ |
| Excel template (download) | `src/pages/admin/ImportData.tsx` | 1775, 1781 | ✅ `location` and `confirmationDate` columns |
| Excel parser | `src/pages/admin/ImportData.tsx` | 759–879 | ✅ |
| Excel export | `src/pages/admin/ImportData.tsx` | 1800, 1863, 1868 | ✅ `location` & `confirmationDate` columns emitted |
| Help text | `src/pages/admin/ImportData.tsx` | 2190 | ✅ |

There is no code gap to fix.

## Most likely reason the user can't see it

The current browser session is on `/auth` (sign-in page), and the published URLs (`bfclpms.lovable.app`, `pms.bfclalloys.com`) only reflect a build at the time of the last **Publish** action. The fields were merged after that publish, so:

1. The **live preview** (id-preview…lovable.app) should already show them — likely needs a hard refresh to bust the cached bundle.
2. The **published site** will keep showing the old UI until the project is republished.

## Risk & Impact Report

- **Data**: None.
- **Workflow**: None.
- **UI**: No changes — UI is already correct.
- **Regression**: Nil — no code change.
- **Mitigation**: Republish so end-users see the fields; verify on preview with a hard refresh.

## Plan

### Step 1 — Verify the live preview
- Hard refresh the preview (Ctrl/Cmd+Shift+R).
- Admin → Users → **Add New User** → confirm **Confirmation Date** sits after DOJ and **Location** sits after Employment Status.
- Admin → Import/Export Data → **Download Employee Template** → confirm `location` and `confirmationDate` columns exist.
- **Export Employees** → confirm both columns are populated.

### Step 2 — Publish so the change reaches `bfclpms.lovable.app` / `pms.bfclalloys.com`
After approval I will surface the Publish action so the change goes live for end-users.

### Step 3 — Only if the preview still misses something
Drop into build mode and fix the specific missing surface. (None observed today.)

## UI Changes
No new UI changes. Only republishing.

## Files Touched
None unless Step 3 is triggered.

## Rollback
Not applicable (no code change in this plan).
