

# Fix: Review Timeline UI Issues

## Root Cause Analysis

After inspecting the Review Timeline dialog, I identified **5 UI issues**:

### Issue 1: Dialog Description Overflows with Raw KPI Text
The `DialogDescription` renders `kpi.kpi_name` which contains the full KPI description, formula, and scoring logic. This creates a wall of text in the dialog header. It should show just the KRA name and a truncated KPI title.

### Issue 2: Missing Action Configurations
The `actionConfig` map is missing entries for 3 action types that exist in the database:
- `ADMIN_STATUS_STEP_BACK` -- shows as "ADMIN STATUS STEP BACK" with a plain gray dot
- `AUDITOR_FORWARDED` -- not styled
- `MANAGER_FORWARDED` -- not styled

These fall through to the default handler which uses a plain gray icon and uppercased text.

### Issue 3: Raw Status Values in Details
The timeline details show raw database values like "New Status: self_review" and "New Status: kra_set" instead of human-readable labels like "Self Review" and "KRA Set".

### Issue 4: Workflow Progress Connector Line Layout
The connector lines between workflow stages use a nested `flex-1` layout where both the stage container and the connector compete for space. The last stage also gets wrapped in a `flex-1` container unnecessarily, causing uneven spacing.

### Issue 5: Timeline Dot Misalignment
The timeline vertical line is at `left-4` (16px center) while the timeline dot is at `left-2` with `w-5` (center at 18px), causing a 2px offset between the line and dot centers.

## Fix Plan

### File: `src/components/dashboard/KpiTimeline.tsx`

**Fix 1 -- Truncate Dialog Description (line 192-194)**
Replace the raw `kpi.kpi_name` dump with just the KRA name as context. Truncate long names with `line-clamp-2`.

**Fix 2 -- Add missing action configs (after line 81)**
Add entries for:
```
ADMIN_STATUS_STEP_BACK: { icon: UserCog, color: 'bg-rose-600', label: 'Admin Status Step Back' }
AUDITOR_FORWARDED: { icon: CheckCircle, color: 'bg-indigo-500', label: 'Auditor Forwarded' }
MANAGER_FORWARDED: { icon: CheckCircle, color: 'bg-green-500', label: 'Manager Forwarded' }
```

**Fix 3 -- Format raw status values (in formatDetails function, ~line 157)**
Add a status label map and format "New Status: xxx" values to human-readable labels.

**Fix 4 -- Fix workflow progress layout (lines 201-232)**
Restructure the flex layout so connector lines sit between stage items rather than being nested inside the same flex container. Use a flat approach where stages and connectors alternate.

**Fix 5 -- Fix timeline dot alignment (lines 254, 267)**
Adjust the timeline line position to `left-[18px]` and the dot to `left-[9px]` (centering the 20px dot at 19px, matching the line at 18.5px). Or use consistent centering with the `pl-10` content offset.

### File: `DOCUMENTATION.md`
Update to reflect the new action config entries.

## Summary of Changes

| Fix | Issue | File | Lines |
|-----|-------|------|-------|
| 1 | Description overflow | KpiTimeline.tsx | 192-194 |
| 2 | Missing action configs | KpiTimeline.tsx | 81 (add after) |
| 3 | Raw status values | KpiTimeline.tsx | ~157 |
| 4 | Workflow progress layout | KpiTimeline.tsx | 201-232 |
| 5 | Timeline dot alignment | KpiTimeline.tsx | 254, 267 |
| 6 | Documentation sync | DOCUMENTATION.md | Relevant section |

