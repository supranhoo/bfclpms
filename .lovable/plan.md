
# Plan: Display Admin Names in Audit Trail and All Required Locations

## Problem Analysis

When an Admin performs actions on behalf of users, the system correctly stores:
- `performed_by` = Admin's user ID
- `on_behalf_of` = Employee's user ID (who the action was for)
- `on_behalf_role` = The role level being modified (self/manager/auditor/management)

**However, the UI does not currently:**
1. Fetch the `on_behalf_of` profile information
2. Display admin actions distinctively in timelines
3. Show "on behalf of" context in audit views

---

## Components That Need Updates

| Component | Current Issue | Required Fix |
|-----------|---------------|--------------|
| `KpiTimeline.tsx` | Missing admin action configs; doesn't show on-behalf info | Add admin actions; fetch & display on_behalf_of profile |
| `AuditLogs.tsx` | Only shows performer name | Add "On Behalf Of" column for admin actions |
| `AuditTrailReport.tsx` | Missing admin action labels; no on-behalf context | Add action labels; show on-behalf info |
| `QueryHistoryDialog.tsx` | May need admin context if queries are admin-raised | Check and add if needed |

---

## Implementation Details

### 1. Update KpiTimeline.tsx

**a) Update AuditLog interface to include on_behalf fields:**
```typescript
interface AuditLog {
  id: string;
  kpi_id: string;
  action: string;
  performed_by: string;
  on_behalf_of: string | null;      // Add
  on_behalf_role: string | null;    // Add
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
```

**b) Add admin action configurations:**
```typescript
const actionConfig = {
  // ... existing configs ...
  
  // Admin Actions - Pink/Rose color theme for visibility
  'ADMIN_DATA_ENTRY_SELF': { icon: UserCog, color: 'bg-rose-500', label: 'Admin Entered Self Data' },
  'ADMIN_DATA_ENTRY_MANAGER': { icon: UserCog, color: 'bg-rose-500', label: 'Admin Entered Manager Data' },
  'ADMIN_DATA_ENTRY_AUDITOR': { icon: UserCog, color: 'bg-rose-500', label: 'Admin Entered Auditor Data' },
  'ADMIN_DATA_ENTRY_MANAGEMENT': { icon: UserCog, color: 'bg-rose-500', label: 'Admin Entered Management Data' },
  'ADMIN_DAILY_ENTRY_OVERRIDE': { icon: UserCog, color: 'bg-rose-500', label: 'Admin Daily Entry Override' },
  'ADMIN_STATUS_OVERRIDE': { icon: UserCog, color: 'bg-rose-600', label: 'Admin Status Override' },
  'ADMIN_OVERRIDE': { icon: UserCog, color: 'bg-rose-500', label: 'Admin Override' },
  'MANAGER_DAILY_OVERRIDE': { icon: User, color: 'bg-purple-500', label: 'Manager Daily Override' },
};
```

**c) Fetch on_behalf_of profiles alongside performed_by:**
```typescript
// Collect both performer and on_behalf_of IDs
const performerIds = [...new Set(auditLogs.map(log => log.performed_by))];
const onBehalfIds = [...new Set(auditLogs.filter(log => log.on_behalf_of).map(log => log.on_behalf_of!))];
const allIds = [...new Set([...performerIds, ...onBehalfIds])];

// Single query for all profiles
const { data: profiles } = await supabase
  .from('profiles')
  .select('id, full_name, email')
  .in('id', allIds);
```

**d) Update timeline item display to show admin context:**
```tsx
{/* Show "by Admin Name (on behalf of Employee)" for admin actions */}
<p className="text-sm text-muted-foreground mt-1">
  by {performer?.full_name || performer?.email || 'Unknown user'}
  {log.on_behalf_of && (
    <span className="text-rose-600 dark:text-rose-400">
      {' '}(on behalf of {onBehalfProfile?.full_name || 'Employee'})
    </span>
  )}
</p>
```

**e) Show admin reason in details:**
```typescript
// In formatDetails function
if (log.metadata?.reason) details.push(`Admin Reason: ${log.metadata.reason}`);
```

---

### 2. Update AuditLogs.tsx (Admin Audit Logs Page)

**a) Update AuditLog interface:**
```typescript
interface AuditLog {
  // ... existing fields ...
  on_behalf_of: string | null;
  on_behalf_role: string | null;
  on_behalf_profile: { id: string; full_name: string | null; email: string } | null;
}
```

**b) Fetch on_behalf profiles:**
```typescript
// Also collect on_behalf_of IDs
const onBehalfIds = new Set<string>();
data.forEach(log => {
  if (log.on_behalf_of) onBehalfIds.add(log.on_behalf_of);
});

// Include in profile fetch
const allUserIds = [...performerIds, ...onBehalfIds];
```

**c) Add action icons and labels for admin actions:**
```typescript
const actionIcons = {
  // ... existing ...
  ADMIN_DATA_ENTRY_SELF: <UserCog className="h-4 w-4 text-rose-500" />,
  ADMIN_DATA_ENTRY_MANAGER: <UserCog className="h-4 w-4 text-rose-500" />,
  // ... etc.
};

const actionLabels = {
  // ... existing ...
  ADMIN_DATA_ENTRY_SELF: 'Admin: Self Data Entry',
  ADMIN_DATA_ENTRY_MANAGER: 'Admin: Manager Data Entry',
  ADMIN_DAILY_ENTRY_OVERRIDE: 'Admin: Daily Override',
  ADMIN_STATUS_OVERRIDE: 'Admin: Status Override',
  ADMIN_OVERRIDE: 'Admin: KPI Override',
};

const actionColors = {
  // ... existing ...
  ADMIN_DATA_ENTRY_SELF: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  // ... etc.
};
```

**d) Update table to show "On Behalf Of" column:**
```tsx
<TableHead>On Behalf Of</TableHead>

{/* In row */}
<TableCell>
  {log.on_behalf_of && log.on_behalf_profile ? (
    <div className="flex items-center gap-2">
      <User className="h-4 w-4 text-rose-500" />
      <span className="text-sm">
        {log.on_behalf_profile.full_name || log.on_behalf_profile.email}
      </span>
    </div>
  ) : (
    <span className="text-muted-foreground">—</span>
  )}
</TableCell>
```

---

### 3. Update AuditTrailReport.tsx

**a) Add admin action labels:**
```typescript
const actionLabels: Record<string, string> = {
  // ... existing ...
  'ADMIN_DATA_ENTRY_SELF': 'Admin: Self Data Entry',
  'ADMIN_DATA_ENTRY_MANAGER': 'Admin: Manager Data Entry',
  'ADMIN_DATA_ENTRY_AUDITOR': 'Admin: Auditor Data Entry',
  'ADMIN_DATA_ENTRY_MANAGEMENT': 'Admin: Management Data Entry',
  'ADMIN_DAILY_ENTRY_OVERRIDE': 'Admin: Daily Override',
  'ADMIN_STATUS_OVERRIDE': 'Admin: Status Override',
  'ADMIN_OVERRIDE': 'Admin: KPI Override',
  'MANAGER_DAILY_OVERRIDE': 'Manager: Daily Override',
};

const actionColors: Record<string, string> = {
  // ... existing ...
  'ADMIN_DATA_ENTRY_SELF': 'bg-rose-100 text-rose-800',
  // ... similar for all admin actions
};
```

**b) Update query to include on_behalf fields:**
```typescript
const { data, error } = await supabase
  .from('kpi_audit_logs')
  .select(`
    id, kpi_id, action, performed_by,
    on_behalf_of, on_behalf_role,
    old_value, new_value, metadata, created_at
  `)
  .order('created_at', { ascending: false })
  .limit(1000);
```

**c) Fetch on_behalf profiles and update table:**
Add "On Behalf Of" column in table and Excel export.

**d) Update Excel export to include admin context:**
```typescript
const exportData = filteredLogs.map(log => ({
  // ... existing fields ...
  'On Behalf Of': log.on_behalf_profile?.full_name || 'N/A',
  'On Behalf Role': log.on_behalf_role || 'N/A',
  'Admin Reason': log.metadata?.reason || '',
}));
```

---

### 4. Import UserCog Icon

All files need to import the `UserCog` icon from lucide-react for admin action indicators:
```typescript
import { UserCog } from 'lucide-react';
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/dashboard/KpiTimeline.tsx` | Update interface, add admin action configs, fetch on_behalf profiles, display admin context |
| `src/pages/AuditLogs.tsx` | Add admin action icons/labels/colors, fetch on_behalf profiles, add "On Behalf Of" column |
| `src/pages/reports/AuditTrailReport.tsx` | Add admin action labels/colors, include on_behalf in query and display, update Excel export |
| `DOCUMENTATION.md` | Document admin audit trail visibility |

---

## Visual Example After Implementation

**KPI Timeline Entry (Admin Action):**
```
┌────────────────────────────────────────────────────────┐
│ 🔧 Admin Entered Self Data                   01 Feb 2026 │
│                                                10:30 AM │
│ by John Admin (on behalf of Jane Employee)              │
│                                                          │
│ • Admin Reason: Employee was on leave                    │
│ • Self Score: 4                                          │
│ • Self Rating: green                                     │
└────────────────────────────────────────────────────────┘
```

**Audit Logs Table Row:**
| Timestamp | Action | KPI | Performed By | On Behalf Of | Details |
|-----------|--------|-----|--------------|--------------|---------|
| 01 Feb 10:30 | Admin: Self Data Entry | Sales Target | John Admin | Jane Employee | Score: 4 |

---

## Validation Checklist

After implementation, verify:
- [ ] Admin actions appear with rose/pink color theme in all views
- [ ] KPI Timeline shows "on behalf of" text for admin entries
- [ ] Audit Logs page has "On Behalf Of" column
- [ ] Audit Trail Report includes admin context in table and Excel export
- [ ] Admin reason from metadata is displayed in details
- [ ] All admin action types have proper labels (not showing raw action names)
