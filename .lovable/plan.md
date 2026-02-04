
# Complete Org-Level KPI Integration with Access Control

## Executive Summary

This plan addresses two major areas:
1. **Integration Gaps**: Fix the disconnected org-level KPI data flow so values propagate correctly to scorecards, dashboards, and scoring calculations
2. **Access Control**: Implement designated data owner access for org-level KPIs, with Management send-back capability

---

## Part 1: Database Schema Changes

### New Tables Required

#### 1. Org KPI Data Owners Table
Stores which users are authorized to enter data for specific org-level KPIs.

```text
┌─────────────────────────────────────────────────────────────────┐
│ org_kpi_data_owners                                             │
├─────────────────────────────────────────────────────────────────┤
│ id             UUID PRIMARY KEY                                 │
│ category_id    UUID FK → kra_categories(id)                     │
│ kra_name       TEXT                                             │
│ kpi_name       TEXT                                             │
│ owner_id       UUID FK → profiles(id)   -- The designated owner │
│ assigned_by    UUID FK → profiles(id)   -- Admin who assigned   │
│ created_at     TIMESTAMPTZ                                      │
│ UNIQUE(category_id, kra_name, kpi_name, owner_id)               │
└─────────────────────────────────────────────────────────────────┘
```

This allows:
- Multiple owners per KPI (e.g., primary + backup)
- Admin assignment tracking
- Easy lookup for access control

#### 2. Extend org_kpi_values Table
Add fields to support Management send-back workflow.

```text
Add columns to org_kpi_values:
- status: 'pending' | 'approved' | 'sent_back' (default: 'approved')
- sent_back_by: UUID FK → profiles(id)
- sent_back_at: TIMESTAMPTZ
- sent_back_reason: TEXT
- submission_count: INTEGER (default: 1)
```

---

## Part 2: Integration Fixes (From Previous Analysis)

### 2.1 Fix MyKpis.tsx Org Value Lookup
**Issue**: Key format mismatch causes lookup failures for scoped values

**File**: `src/pages/MyKpis.tsx` (line ~804)

```typescript
// CURRENT (broken for some cases):
const selectedKpiOrgValue = isSelectedKpiOrgLevel && selectedKpi
  ? orgKpiValuesMap.get(`${selectedKpi.category_id}||${selectedKpi.kra_name}||${selectedKpi.kpi_name}`)
  : null;

// FIX: Use the existing getOrgKpiValue helper
const selectedKpiOrgValue = isSelectedKpiOrgLevel && selectedKpi
  ? getOrgKpiValue(selectedKpi)
  : null;
```

### 2.2 Add Org-Level Integration to Scorecards

**Files to modify:**
- `src/components/review/EmployeeScorecard.tsx`
- `src/components/review/AuditScorecard.tsx`
- `src/components/review/ManagementScorecard.tsx`

**Changes for each:**
1. Import `useOrgKpiValues` hook
2. Create org value lookup map (same pattern as MyKpis.tsx)
3. Add `getOrgKpiValue(kpi)` helper function
4. Display org-level indicators (Building2 icon + badge)
5. Show org value as achieved value (read-only for org-level KPIs)

### 2.3 Add Org-Level Integration to Dashboard

**File**: `src/pages/Dashboard.tsx`

1. Import `useOrgKpiValues` hook
2. Create org value map for current period
3. Update score calculations to use org values when `kpi.is_org_level === true`
4. Add visual indicator on org-level KPI rows

### 2.4 Create Propagation Hook

**New file**: `src/hooks/usePropagateOrgKpiValue.ts`

When admin saves org value, auto-create/update review_submissions for affected employees:
- Find all KPIs matching (category_id, kra_name, kpi_name, review_period, review_year)
- Calculate score using `calculateRating()` function
- Upsert to `review_submissions` with achieved_value, self_score, self_rating
- Optionally update KPI status to `self_review`

---

## Part 3: Access Control Implementation

### 3.1 Admin UI for Assigning Data Owners

**New component**: `src/components/admin/OrgKpiOwnerDialog.tsx`

Features:
- Select users from profiles list (searchable)
- Shows existing owners with remove button
- Supports multiple owners per KPI
- Logs assignment in audit trail

**Integration point**: Add "Assign Owner" button to:
- `OrgKpiDataEntry.tsx` - per-row action
- `OrgKpiOverview.tsx` - per-row action

### 3.2 Access Control Hook

**New file**: `src/hooks/useOrgKpiDataOwner.ts`

```typescript
export function useIsOrgKpiDataOwner(categoryId: string, kraName: string, kpiName: string) {
  const { user } = useAuth();
  const { role } = useAuth();
  
  return useQuery({
    queryKey: ['org-kpi-owner-check', categoryId, kraName, kpiName, user?.id],
    queryFn: async () => {
      // Admins always have access
      if (role === 'admin') return { canEdit: true, isOwner: false, isAdmin: true };
      
      // Check if user is designated owner
      const { data } = await supabase
        .from('org_kpi_data_owners')
        .select('id')
        .eq('category_id', categoryId)
        .eq('kra_name', kraName)
        .eq('kpi_name', kpiName)
        .eq('owner_id', user?.id)
        .maybeSingle();
      
      return { canEdit: !!data, isOwner: !!data, isAdmin: false };
    },
  });
}
```

### 3.3 Update OrgKpiDataEntry.tsx

**File**: `src/pages/admin/OrgKpiDataEntry.tsx`

Changes:
1. Fetch current user's data ownership for visible KPIs
2. Show "locked" indicator for KPIs user cannot edit
3. Disable input fields for non-owned KPIs
4. Add "Assign Owner" action for admins
5. Show owner name(s) in table column
6. Filter view: "All" | "My KPIs" | "Unassigned"

### 3.4 Page Access Updates

**File**: `src/App.tsx` or route configuration

Currently org data entry is admin-only. Update to allow:
- Admins: Full access
- Designated owners: Access to their assigned KPIs only

Create a new route or modify existing:
- `/admin/org-kpi-data-entry` → Admin full access
- `/my-org-kpis` → Owner-only view (new page for non-admin owners)

**Alternative approach**: Single page with role-based filtering
- Admins see all KPIs
- Owners see only their assigned KPIs
- Read-only badge shows which KPIs user cannot edit

---

## Part 4: Management Send-Back Workflow

### 4.1 Org KPI Value Status Flow

```text
┌─────────────┐  Owner submits   ┌──────────────┐  Management rejects  ┌─────────────┐
│  PENDING    │ ──────────────► │   APPROVED   │ ◄───────────────────  │  SENT_BACK  │
└─────────────┘                  └──────────────┘  Owner resubmits     └─────────────┘
                                        │                                     │
                                        ▼                                     │
                                 Propagates to                                │
                                 review_submissions                           │
                                        │                                     │
                                        └──────────── Notify Owner ◄──────────┘
```

### 4.2 Send-Back Hook

**New file**: `src/hooks/useSendBackOrgKpiValue.ts`

```typescript
export function useSendBackOrgKpiValue() {
  return useMutation({
    mutationFn: async ({
      orgValueId,
      reason,
      sentBackBy,
    }) => {
      // 1. Update org_kpi_values status
      await supabase
        .from('org_kpi_values')
        .update({
          status: 'sent_back',
          sent_back_by: sentBackBy,
          sent_back_at: new Date().toISOString(),
          sent_back_reason: reason,
        })
        .eq('id', orgValueId);
      
      // 2. Create notification for data owner(s)
      const { data: owners } = await supabase
        .from('org_kpi_data_owners')
        .select('owner_id')
        .eq(/* match by category/kra/kpi */);
      
      // 3. Log audit trail
      await supabase.from('kpi_audit_logs').insert({
        action: 'ORG_KPI_SENT_BACK',
        performed_by: sentBackBy,
        metadata: { reason, org_value_id: orgValueId },
      });
      
      // 4. Send notifications
      // ...
    },
  });
}
```

### 4.3 Management UI for Send-Back

**Integration point**: Add to Management Review workflow

When reviewing an employee with org-level KPIs:
1. Show org-level indicator on those KPIs
2. Add "Send Back Org Data" action button
3. Opens dialog with:
   - KPI name display
   - Current value from `org_kpi_values`
   - Data owner name(s)
   - Reason textarea (required)
   - Submit button

**Component**: `src/components/review/SendBackOrgKpiDialog.tsx`

### 4.4 Data Owner Notification and Resubmission

When org value is sent back:
1. Create notification for data owner(s)
2. Show alert in OrgKpiDataEntry page
3. Owner can update value and resubmit
4. Status changes back to 'approved'
5. New submission triggers re-propagation to review_submissions

---

## Part 5: Visual Indicators

### 5.1 Org-Level KPI Badges

| Badge | Meaning |
|-------|---------|
| Building2 icon + "Org Level" | KPI has centrally managed value |
| Users icon + "Department" | Scoped to department |
| User icon + "Individual" | Scoped to specific employee |
| Lock icon + "Locked" | User cannot edit (not owner) |
| AlertTriangle + "Sent Back" | Value needs resubmission |

### 5.2 Data Source Indicator

Show data source and entered_by info:
- "Source: ERP System"
- "Entered by: John Admin on 01 Feb 2026"

---

## File Change Summary

### New Files to Create

| File | Purpose |
|------|---------|
| `src/hooks/useOrgKpiDataOwner.ts` | Access control hook for data owners |
| `src/hooks/usePropagateOrgKpiValue.ts` | Auto-propagate org values to submissions |
| `src/hooks/useSendBackOrgKpiValue.ts` | Management send-back workflow |
| `src/components/admin/OrgKpiOwnerDialog.tsx` | UI for assigning data owners |
| `src/components/review/SendBackOrgKpiDialog.tsx` | UI for sending back org values |

### Existing Files to Modify

| File | Changes |
|------|---------|
| `src/pages/MyKpis.tsx` | Fix org value lookup key mismatch |
| `src/pages/Dashboard.tsx` | Add org value integration for scores |
| `src/pages/SelfReview.tsx` | Add org value display |
| `src/components/review/EmployeeScorecard.tsx` | Add org value hook + display |
| `src/components/review/AuditScorecard.tsx` | Add org value hook + display |
| `src/components/review/ManagementScorecard.tsx` | Add org value hook + display + send-back |
| `src/pages/admin/OrgKpiDataEntry.tsx` | Add access control + owner assignment |
| `src/pages/admin/OrgKpiOverview.tsx` | Add owner column + status indicator |
| `DOCUMENTATION.md` | Document org-level KPI flow and access control |

---

## Database Migration Required

```sql
-- 1. Create org_kpi_data_owners table
CREATE TABLE public.org_kpi_data_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES kra_categories(id) ON DELETE CASCADE,
  kra_name TEXT NOT NULL,
  kpi_name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category_id, kra_name, kpi_name, owner_id)
);

-- 2. Add status columns to org_kpi_values
ALTER TABLE public.org_kpi_values
  ADD COLUMN status TEXT DEFAULT 'approved',
  ADD COLUMN sent_back_by UUID REFERENCES profiles(id),
  ADD COLUMN sent_back_at TIMESTAMPTZ,
  ADD COLUMN sent_back_reason TEXT,
  ADD COLUMN submission_count INTEGER DEFAULT 1;

-- 3. Enable RLS
ALTER TABLE public.org_kpi_data_owners ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies for org_kpi_data_owners
CREATE POLICY "Authenticated users can read org_kpi_data_owners"
  ON public.org_kpi_data_owners FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage org_kpi_data_owners"
  ON public.org_kpi_data_owners FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. Update org_kpi_values RLS to allow designated owners
CREATE POLICY "Data owners can update their assigned org_kpi_values"
  ON public.org_kpi_values FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (
      SELECT 1 FROM public.org_kpi_data_owners
      WHERE org_kpi_data_owners.category_id = org_kpi_values.category_id
        AND org_kpi_data_owners.kra_name = org_kpi_values.kra_name
        AND org_kpi_data_owners.kpi_name = org_kpi_values.kpi_name
        AND org_kpi_data_owners.owner_id = auth.uid()
    )
  );
```

---

## Validation Checklist

### Integration Fixes
- [ ] MyKpis shows correct org values for all scope types
- [ ] EmployeeScorecard displays org values (read-only)
- [ ] AuditScorecard displays org values (read-only)
- [ ] ManagementScorecard displays org values with send-back option
- [ ] Dashboard calculates scores using org values
- [ ] Org value propagation creates/updates review_submissions

### Access Control
- [ ] Admins can assign data owners to org KPIs
- [ ] Data owners can only edit their assigned KPIs
- [ ] Non-owners see read-only view
- [ ] Assignment is logged in audit trail
- [ ] Multiple owners per KPI works correctly

### Send-Back Workflow
- [ ] Management can send back org values with reason
- [ ] Data owner receives notification
- [ ] Sent-back status visible in data entry page
- [ ] Owner can resubmit value
- [ ] Resubmission re-propagates to review_submissions
- [ ] Send-back is logged in audit trail

---

## Implementation Sequence

1. **Phase 1 - Database**: Create migration for new table and columns
2. **Phase 2 - Core Hooks**: Create access control and propagation hooks
3. **Phase 3 - Integration Fixes**: Update scorecards and dashboard
4. **Phase 4 - Admin UI**: Add owner assignment functionality
5. **Phase 5 - Send-Back**: Add Management workflow
6. **Phase 6 - Testing**: End-to-end validation
7. **Phase 7 - Documentation**: Update DOCUMENTATION.md
