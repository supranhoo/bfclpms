
# Plan: Complete Query Workflow Enhancement

## Overview

This plan implements all 4 requested features to complete the KPI query resolution workflow:

1. **Two-step query resolution**: `open` → `responded` → `resolved`
2. **Intermediate visibility**: Managers see read-only queries raised by higher levels
3. **Query History component**: Chronological view of all queries/responses per KPI
4. **Response notifications**: Alert query raiser when employee responds

---

## Current State Analysis

| Component | Current Behavior | Gap |
|-----------|-----------------|-----|
| `kpi_queries.status` | `open` → `resolved` (one step) | Missing `responded` status |
| Query resolution | Employee responds and marks resolved immediately | Reviewer should approve response |
| Manager visibility | Only sees queries raised to/by them | Should see queries raised to their subordinates (read-only) |
| Query history | Not consolidated - scattered across tabs | Need unified per-KPI history view |
| Response notifications | None | Raiser should be notified when response is submitted |

---

## Implementation Plan

### Phase 1: Database Schema Changes

**1.1 Add `responded` status to `query_status` enum**

```sql
ALTER TYPE public.query_status ADD VALUE IF NOT EXISTS 'responded';
```

**1.2 Update `notify_on_query_resolved` trigger**

Replace the current trigger logic to:
- When status changes `open` → `responded`: Notify the **raiser** that a response was submitted
- When status changes `responded` → `resolved`: Keep current resolved notification

**1.3 Create intermediate visibility view (optional)**

Add a column or computed access for managers to see queries raised to their subordinates.

---

### Phase 2: Two-Step Query Resolution Flow

**2.1 Update `QueryInbox.tsx` - Employee Response Flow**

Current flow:
```
Employee clicks "Respond & Resolve" → status = 'resolved' immediately
```

New flow:
```
Employee clicks "Respond" → status = 'responded' (awaiting approval)
Raiser clicks "Accept" → status = 'resolved'
```

**Changes to `src/pages/QueryInbox.tsx`:**

| Element | Change |
|---------|--------|
| Button label | "Respond & Resolve" → "Submit Response" |
| Status update | Set to `responded` instead of `resolved` |
| Raiser view | Add "Accept Response" button for responded queries |
| Badge colors | Add yellow/amber for `responded` status |

**2.2 New UI States in Query Card**

```typescript
// Query status states
type QueryStatusExtended = 'open' | 'responded' | 'resolved';

// Badge styling
const queryStatusColors = {
  open: 'bg-orange-100 text-orange-800',
  responded: 'bg-amber-100 text-amber-800',  // NEW
  resolved: 'bg-green-100 text-green-800',
};
```

**2.3 Accept Response Action (for query raiser)**

Add to the "Sent" tab in QueryInbox:
- When query status is `responded`, show "Accept" button
- Clicking Accept → updates status to `resolved`, sets `resolved_at`

---

### Phase 3: Intermediate Visibility for Managers

**3.1 Visibility Logic**

When Auditor or Management raises a query to Employee:
- The Employee's reporting manager should see it in their Inbox
- Manager view is **read-only** (no respond/resolve buttons)
- Labeled as "For Information" or "FYI"

**3.2 Query Fetch Logic Update**

Current query in `QueryInbox.tsx`:
```typescript
.or(`raised_to.eq.${user.id},raised_by.eq.${user.id}`)
```

Enhanced query:
```typescript
// Get queries where:
// 1. I am the raiser or recipient, OR
// 2. I am the reporting manager of the recipient (subordinate)
```

This requires a database function or modified query to check `profiles.reporting_manager_id`.

**3.3 UI Changes for FYI Queries**

```typescript
const isFYIQuery = query.raised_to !== user.id && 
                   query.raised_by !== user.id &&
                   isSubordinateQuery(query);

// Render differently
{isFYIQuery && (
  <Badge variant="outline" className="text-blue-600">
    <Eye className="h-3 w-3 mr-1" /> For Information
  </Badge>
)}
```

**3.4 New Tab: "Subordinate Queries"**

Add a fourth tab to QueryInbox:
- "Notifications" | "Queries" | "Sent" | **"Team Queries"** (new)
- Shows queries raised to the user's direct reports
- Read-only view with no action buttons

---

### Phase 4: Query History Component

**4.1 New Component: `QueryHistoryDialog.tsx`**

Location: `src/components/review/QueryHistoryDialog.tsx`

```typescript
interface QueryHistoryDialogProps {
  kpiId: string;
  kpiName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

**4.2 Dialog Content**

Shows a chronological timeline of all queries for the KPI:

```
┌─────────────────────────────────────────────────────────────┐
│  Query History: [KPI Name]                                   │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 📩 Query Raised                       15 Jan 2026    │   │
│  │ From: Auditor Name                                   │   │
│  │ To: Employee Name                                    │   │
│  │ "Please clarify the calculation methodology..."      │   │
│  │ [View Attachment]                                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                      ↓                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 💬 Response Submitted                 17 Jan 2026    │   │
│  │ From: Employee Name                                  │   │
│  │ "The calculation uses the formula..."               │   │
│  │ [View Attachment]                                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                      ↓                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ✅ Query Resolved                     18 Jan 2026    │   │
│  │ Accepted by: Auditor Name                            │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**4.3 Integration Points**

Add "View History" button to:
- `EmployeeScorecard.tsx` (Team Review - Manager view)
- `AuditScorecard.tsx` (Audit Panel)
- `ManagementScorecard.tsx` (Management Review)
- `MyKpis.tsx` (Employee view)

---

### Phase 5: Response Notification Trigger

**5.1 Update Database Trigger**

Modify `notify_on_query_resolved()` to handle the new `responded` status:

```sql
CREATE OR REPLACE FUNCTION public.notify_on_query_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_kpi_name TEXT;
  v_responder_name TEXT;
  v_raiser_name TEXT;
BEGIN
  -- CASE 1: Employee responds (open → responded)
  IF OLD.status = 'open' AND NEW.status = 'responded' THEN
    -- Notify the query raiser
    INSERT INTO notifications (user_id, type, title, message, ...)
    VALUES (
      NEW.raised_by,
      'query_response_submitted',
      'Query Response Received',
      'Employee responded to your query on KPI: ' || v_kpi_name,
      ...
    );
    
    -- Also notify intermediate managers (FYI)
    -- Get reporting manager of raised_to employee
    -- Insert FYI notification if manager exists
  END IF;
  
  -- CASE 2: Raiser accepts response (responded → resolved)
  IF OLD.status = 'responded' AND NEW.status = 'resolved' THEN
    -- Notify the responder that their response was accepted
    INSERT INTO notifications (...)
    VALUES (
      NEW.raised_to,
      'query_resolved',
      'Query Response Accepted',
      ...
    );
  END IF;
  
  RETURN NEW;
END;
$$;
```

---

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/components/review/QueryHistoryDialog.tsx` | Timeline view of query history |
| `src/hooks/useQueryWorkflow.ts` | Hooks for respond, accept, and query visibility |

### Modified Files

| File | Changes |
|------|---------|
| `src/pages/QueryInbox.tsx` | Add "Team Queries" tab, two-step resolution UI, accept button |
| `src/hooks/useKpis.ts` | Add `useRespondToQuery` and `useAcceptQueryResponse` mutations |
| `src/components/review/EmployeeScorecard.tsx` | Add Query History button |
| `src/components/review/AuditScorecard.tsx` | Add Query History button |
| `src/components/review/ManagementScorecard.tsx` | Add Query History button |
| `src/pages/MyKpis.tsx` | Add Query History button |
| `DOCUMENTATION.md` | Update query workflow documentation |

### Database Migration

| Change | SQL |
|--------|-----|
| Add `responded` enum value | `ALTER TYPE query_status ADD VALUE 'responded'` |
| Update notification trigger | Replace `notify_on_query_resolved` with expanded logic |

---

## UI Flow Summary

### Employee Flow (responding to query)

```
1. Employee sees open query in Inbox → Queries tab
2. Clicks "Respond" → Response dialog opens
3. Enters resolution notes + optional evidence
4. Clicks "Submit Response"
5. Status changes: open → responded
6. Query raiser receives notification
7. Manager sees FYI notification (if applicable)
```

### Raiser Flow (accepting response)

```
1. Raiser receives "Response Received" notification
2. Goes to Inbox → Sent tab
3. Sees query with status "Responded" and employee's response
4. Reviews the response
5. Clicks "Accept Response" → status becomes "resolved"
6. Employee receives confirmation notification
```

### Manager FYI Flow

```
1. Auditor raises query to Employee X (Manager Y's subordinate)
2. Employee X receives query notification
3. Manager Y sees query in "Team Queries" tab (read-only)
4. When Employee X responds, Manager Y sees the response (FYI)
5. When Auditor accepts, Manager Y sees final resolution (FYI)
```

---

## Technical Details

### Query Status Extended Type

```typescript
export type QueryStatusExtended = 'open' | 'responded' | 'resolved';
```

### New Hooks

```typescript
// Submit response (employee action)
export function useRespondToQuery() {
  return useMutation({
    mutationFn: async ({ query_id, resolution_notes, resolution_evidence_url }) => {
      await supabase
        .from('kpi_queries')
        .update({
          status: 'responded',
          resolution_notes,
          resolution_evidence_url,
          // Note: resolved_at is NOT set yet
        })
        .eq('id', query_id);
    }
  });
}

// Accept response (raiser action)
export function useAcceptQueryResponse() {
  return useMutation({
    mutationFn: async ({ query_id }) => {
      await supabase
        .from('kpi_queries')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', query_id);
    }
  });
}
```

### Subordinate Query Detection

```typescript
function useSubordinateQueries() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['subordinate-queries', user?.id],
    queryFn: async () => {
      // Get all subordinates
      const { data: subordinates } = await supabase
        .from('profiles')
        .select('id')
        .eq('reporting_manager_id', user.id);
      
      const subordinateIds = subordinates?.map(s => s.id) || [];
      
      if (subordinateIds.length === 0) return [];
      
      // Get queries raised TO subordinates (not BY the current user)
      const { data: queries } = await supabase
        .from('kpi_queries')
        .select('*, kpi:kpi_id(kpi_name, kra_name)')
        .in('raised_to', subordinateIds)
        .neq('raised_by', user.id);
      
      return queries;
    }
  });
}
```

---

## Testing Checklist

1. **Two-Step Resolution**
   - [ ] Employee submits response → status becomes `responded`
   - [ ] Raiser can see response in "Sent" tab
   - [ ] Raiser clicks "Accept" → status becomes `resolved`
   - [ ] Employee cannot re-respond after `responded` status

2. **Notifications**
   - [ ] Raiser gets notification when employee responds
   - [ ] Employee gets notification when response is accepted
   - [ ] Manager gets FYI notification for subordinate queries

3. **Manager Visibility**
   - [ ] Manager sees "Team Queries" tab
   - [ ] Subordinate queries are visible but read-only
   - [ ] No action buttons for FYI queries

4. **Query History**
   - [ ] History shows all queries for a KPI
   - [ ] Timeline is chronological
   - [ ] Shows query, response, and resolution events
   - [ ] Attachments are viewable
