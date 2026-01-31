

# Plan: Admin Data Entry on Behalf of Users (No Restrictions)

## Overview

This feature enables Admin users to enter/edit KPI data on behalf of any user (Employee, Manager, Auditor, Management) **without any date or period restrictions**. All actions will be logged for full audit traceability.

---

## Key Requirement: No Restrictions for Admin

| Restriction | Normal User | Admin |
|-------------|-------------|-------|
| Daily submission window | Today + Yesterday only | **Any day of the month** |
| Past review periods | Cannot edit closed periods | **Can edit any period** |
| Resubmission lock | Cannot edit after resubmit | **Can override lock** |
| Weekly submission window | Current/previous week only | **Any week** |
| Monthly submission deadline | Must submit before period closes | **No deadline** |

---

## Implementation Plan

### Phase 1: Database Schema Changes

**Add columns to `kpi_audit_logs` for on-behalf tracking:**

```sql
ALTER TABLE public.kpi_audit_logs 
ADD COLUMN IF NOT EXISTS on_behalf_of UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS on_behalf_role TEXT;

COMMENT ON COLUMN public.kpi_audit_logs.on_behalf_of IS 'Target user whose data was modified by admin';
COMMENT ON COLUMN public.kpi_audit_logs.on_behalf_role IS 'Role level: self, manager, auditor, management, daily_submission';
```

### Phase 2: New Components

**2.1 AdminDataEntryDialog.tsx**

Dialog for entering review submission data at any role level.

```text
┌─────────────────────────────────────────────────────────────────┐
│  Admin Data Entry - [KPI Name]                                  │
│  Employee: [Employee Name] ([Employee Code])                    │
│  Period: [Month Year]                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Data Entry Level:                                              │
│  ○ Self Review  ○ Manager  ○ Auditor  ○ Management             │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Achieved Value: [_________]                               │ │
│  │ Rating: [Dropdown: R5-R0]                                 │ │
│  │ Score: [Auto-calculated / Editable]                       │ │
│  │ Remarks: [Textarea]                                       │ │
│  │ Evidence: [Upload Button]                                 │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Reason for Admin Entry: *                                      │
│  [Required textarea - logged for audit purposes]                │
│                                                                 │
│  ⚠ This action is logged and will notify the employee          │
│                                                                 │
│                              [Cancel] [Save & Log]              │
└─────────────────────────────────────────────────────────────────┘
```

**2.2 AdminDailyEntryDialog.tsx**

Calendar-based dialog for entering daily/weekly submissions - **NO DATE RESTRICTIONS**.

```text
┌─────────────────────────────────────────────────────────────────┐
│  Admin Daily Entry - [KPI Name]                                 │
│  Employee: [Employee Name]                                      │
│  Period: January 2026                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Sun   Mon   Tue   Wed   Thu   Fri   Sat              │   │
│  │  [1]   [2]   [3]   [4]   [5]   [6]   [7]              │   │
│  │  [8]   [9]   [10]  [11]  [12]  [13]  [14]             │   │
│  │  [15]  [16]  [17]  [18]  [19]  [20]  [21]             │   │
│  │  [22]  [23]  [24]  [25]  [26]  [27]  [28]             │   │
│  │  [29]  [30]  [31]                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Selected: 15 January 2026                                      │
│  Current Value: 5 (Yes) ✓ Final                                │
│                                                                 │
│  New Value: [Dropdown/Input] ___________                        │
│  Remarks: [Optional textarea]                                   │
│                                                                 │
│  Reason for Override: *                                         │
│  [Required - e.g., "Correcting data entry error"]               │
│                                                                 │
│  ⚠ Admin override - bypasses all restrictions                  │
│                                                                 │
│                              [Cancel] [Save & Log]              │
└─────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- All days of the month are clickable (no greying out)
- Can edit "Final" (locked) entries
- Can select any past month via period selector
- Clear indicator showing current value and lock status
- Mandatory reason field for audit

### Phase 3: Admin Data Entry Hooks

**New file: `src/hooks/useAdminDataEntry.ts`**

| Hook | Purpose |
|------|---------|
| `useAdminSubmitReviewData` | Submit/update review_submissions for any role level |
| `useAdminSubmitSubPeriod` | Submit daily/weekly data - **bypasses all restrictions** |

**Key Implementation - No Date Restrictions:**

```typescript
export function useAdminSubmitSubPeriod() {
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({
      kpi_id,
      employee_id,
      sub_period_type,
      sub_period_value, // Any date - no restriction
      achieved_value,
      remarks,
      reason,
      review_month,
      review_year,
    }: AdminSubPeriodParams) => {
      
      // 1. Get existing submission for audit trail
      const { data: existing } = await supabase
        .from('sub_period_submissions')
        .select('*')
        .eq('kpi_id', kpi_id)
        .eq('sub_period_value', sub_period_value)
        .maybeSingle();

      // 2. Admin can override is_resubmitted lock
      // Use upsert with NO date validation
      const { data, error } = await supabase
        .from('sub_period_submissions')
        .upsert({
          kpi_id,
          sub_period_type,
          sub_period_value,
          achieved_value,
          remarks,
          review_month,
          review_year,
          submitted_by: employee_id, // Still track as employee's data
          submitted_at: new Date().toISOString(),
          // Reset resubmission flag so data can be edited again if needed
          is_resubmitted: false,
          update_reason: `Admin override: ${reason}`,
        }, {
          onConflict: 'kpi_id,sub_period_type,sub_period_value,review_month,review_year',
        })
        .select()
        .single();

      if (error) throw error;

      // 3. Create audit log with admin context
      await supabase.from('kpi_audit_logs').insert({
        kpi_id,
        action: 'ADMIN_DAILY_ENTRY_OVERRIDE',
        performed_by: user?.id,
        on_behalf_of: employee_id,
        on_behalf_role: 'daily_submission',
        old_value: existing || null,
        new_value: data,
        metadata: {
          reason,
          sub_period_value,
          bypassed_restrictions: [
            'date_window',
            existing?.is_resubmitted ? 'resubmission_lock' : null,
          ].filter(Boolean),
        },
      });

      // 4. Notify employee
      await supabase.from('notifications').insert({
        user_id: employee_id,
        type: 'admin_data_override',
        title: 'Daily Data Updated by Admin',
        message: `Admin updated your daily entry for ${sub_period_value}. Reason: ${reason}`,
        kpi_id,
        related_user_id: user?.id,
      });

      return data;
    },
  });
}
```

### Phase 4: Integration into AllKpis.tsx

**Add action buttons in the expanded KPI row:**

| Button | When Shown | Opens |
|--------|-----------|-------|
| "Enter Data" | Always for admin | AdminDataEntryDialog |
| "Enter Daily Data" | For daily-frequency KPIs | AdminDailyEntryDialog |
| "Enter Weekly Data" | For weekly-frequency KPIs | AdminDailyEntryDialog (weekly mode) |

**UI Changes:**

```tsx
// In the expanded KPI actions area
{profile?.role === 'admin' && (
  <div className="flex gap-2">
    <Button 
      size="sm" 
      variant="outline"
      onClick={() => openAdminDataEntry(kpi)}
    >
      <PenLine className="h-4 w-4 mr-1" />
      Enter Data
    </Button>
    
    {kpi.frequency === 'daily' && (
      <Button 
        size="sm" 
        variant="outline"
        onClick={() => openAdminDailyEntry(kpi)}
      >
        <Calendar className="h-4 w-4 mr-1" />
        Daily Data
      </Button>
    )}
  </div>
)}
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/admin/AdminDataEntryDialog.tsx` | Dialog for review submission data entry |
| `src/components/admin/AdminDailyEntryDialog.tsx` | Calendar dialog for daily/weekly data entry |
| `src/hooks/useAdminDataEntry.ts` | Hooks for admin mutations with audit logging |

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/admin/AllKpis.tsx` | Add "Enter Data" and "Daily Data" buttons |
| `DOCUMENTATION.md` | Document admin data entry feature |

## Database Migration

```sql
-- Add on-behalf tracking columns to kpi_audit_logs
ALTER TABLE public.kpi_audit_logs 
ADD COLUMN IF NOT EXISTS on_behalf_of UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS on_behalf_role TEXT;

-- Add index for querying on-behalf actions
CREATE INDEX IF NOT EXISTS idx_audit_logs_on_behalf 
ON public.kpi_audit_logs(on_behalf_of) 
WHERE on_behalf_of IS NOT NULL;
```

---

## Audit Trail Structure

Every admin data entry creates an audit log:

```json
{
  "id": "uuid",
  "kpi_id": "uuid",
  "action": "ADMIN_DAILY_ENTRY_OVERRIDE",
  "performed_by": "admin-user-uuid",
  "on_behalf_of": "employee-uuid",
  "on_behalf_role": "daily_submission",
  "old_value": { 
    "achieved_value": 5, 
    "is_resubmitted": true 
  },
  "new_value": { 
    "achieved_value": 0, 
    "is_resubmitted": false 
  },
  "metadata": {
    "reason": "Employee reported incorrect data entry",
    "sub_period_value": "2026-01-15",
    "bypassed_restrictions": ["date_window", "resubmission_lock"]
  },
  "created_at": "2026-01-31T14:30:00Z"
}
```

---

## Testing Checklist

1. **No Date Restrictions**
   - [ ] Admin can enter data for any day of the month
   - [ ] Admin can enter data for past months
   - [ ] Admin can edit "Final" (locked) entries
   - [ ] Admin can enter weekly data for any week

2. **Audit Trail**
   - [ ] Every admin entry creates audit log
   - [ ] on_behalf_of correctly set to employee
   - [ ] Old/new values captured
   - [ ] Reason is mandatory and logged

3. **Notifications**
   - [ ] Employee notified of admin changes
   - [ ] Notification includes reason

4. **Role Security**
   - [ ] Only admin role sees "Enter Data" buttons
   - [ ] Non-admins cannot access admin hooks

