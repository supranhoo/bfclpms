

# Plan: Fix Missing RLS Policies for KPI Status Updates

## Problem Summary

When a manager (JASPAL) tries to approve a KPI for their direct report (Dummy):
1. **Step 1**: Update `review_submissions` table ✅ (RLS policy allows managers)
2. **Step 2**: Update `kpis` table status to `manager_check` ❌ (RLS blocks - no policy for managers)

The validation we added catches the failure on Step 2, but by then Step 1 has already committed. This results in:
- Data partially saved (manager review data stored)
- Error shown to user
- KPI status NOT updated (stuck at `self_review`)

### Root Cause: Missing RLS Policies on `kpis` Table

Current UPDATE policies on `kpis`:
| Policy | Allowed By |
|--------|-----------|
| `Users can update their own KPIs` | `employee_id = auth.uid()` |
| `Admins can manage all KPIs` | Admin role only |

**Missing**: Managers, Auditors, and Management cannot update KPI status.

---

## Solution

Add three new RLS policies to allow workflow progression on the `kpis` table.

### Policy 1: Managers Can Update Their Reports' KPI Status

```sql
CREATE POLICY "Managers can update reports KPI status"
ON public.kpis
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role) 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = kpis.employee_id 
    AND profiles.reporting_manager_id = auth.uid()
  )
);
```

### Policy 2: Auditors Can Update KPI Status

```sql
CREATE POLICY "Auditors can update KPI status"
ON public.kpis
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'auditor'::app_role)
);
```

### Policy 3: Management Can Update KPI Status During Review

```sql
CREATE POLICY "Management can update KPI status during review"
ON public.kpis
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'management'::app_role)
  AND status = 'management_review'
);
```

---

## Complete Migration SQL

```sql
-- Policy 1: Managers can update their reports' KPIs
CREATE POLICY "Managers can update reports KPI status"
ON public.kpis
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role) 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = kpis.employee_id 
    AND profiles.reporting_manager_id = auth.uid()
  )
);

-- Policy 2: Auditors can update any KPI status
CREATE POLICY "Auditors can update KPI status"
ON public.kpis
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'auditor'::app_role)
);

-- Policy 3: Management can update KPIs during management_review
CREATE POLICY "Management can update KPI status during review"
ON public.kpis
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'management'::app_role)
  AND status = 'management_review'
);
```

---

## Permission Matrix After Fix

| Role | Can Update KPI Status | Condition |
|------|----------------------|-----------|
| Employee | ✅ | Only their own KPIs |
| Manager | ✅ | Only their direct reports' KPIs |
| Auditor | ✅ | Any KPI (for workflow progression) |
| Management | ✅ | Only KPIs in `management_review` stage |
| Admin | ✅ | All KPIs |

---

## Data Flow After Fix

```text
Manager clicks "Approve" on report's KPI
         ↓
1. Update review_submissions (manager data)
   → RLS: "Managers can update their reports' submissions" ✅
         ↓
2. Update kpis.status to 'manager_check'
   → RLS: "Managers can update reports KPI status" ✅ (NEW)
         ↓
3. Log audit entry
         ↓
4. Toast: "KPI approved successfully"
```

---

## Files to Modify

| File | Change |
|------|--------|
| Database Migration | Add 3 new RLS policies for `kpis` table |
| `DOCUMENTATION.md` | Update RLS policy documentation |

---

## Validation Checklist

After implementation:
- [ ] Manager can approve their direct report's KPI without errors
- [ ] KPI status correctly changes from `self_review` to `manager_check`
- [ ] Auditor can forward KPIs to management review
- [ ] Management can approve KPIs in `management_review` stage
- [ ] Non-managers still cannot update other users' KPIs
- [ ] No silent failures - error messages are descriptive when permission denied

