

# Add `query_type` Column to Distinguish Send-Backs from Queries

## Problem

When a reviewer or admin sends back a KPI, the system creates a `kpi_queries` entry with an "open" status. This causes:
- Send-back reasons to appear as actionable queries in the employee's Query Inbox
- Inflated open query counts (badge on sidebar, dashboard cards)
- Employees seeing "Respond" buttons on items that are purely informational notifications

## Solution

Add a `query_type` column to `kpi_queries` with values `'query'` (default) and `'send_back'`. Then filter send-backs out of active query counts and inbox listings, while still preserving them in the KPI journey/history for audit purposes.

## Changes

### 1. Database Migration
- Add column: `query_type TEXT NOT NULL DEFAULT 'query'` to `kpi_queries`
- Backfill existing rows: set `query_type = 'send_back'` where reason starts with `[SENT BACK]` or `[ADMIN SENT BACK]`
- Auto-resolve send-backs: set `status = 'resolved'` and `resolved_at = now()` for send-back entries (they don't need a response)

### 2. Insert Points -- Tag Send-Backs

**`src/hooks/useKpis.ts`** (manager send-back, ~line 912):
- Add `query_type: 'send_back'` to the insert
- Set `status: 'resolved'` and `resolved_at` immediately (no response needed)

**`src/hooks/useAdminDataEntry.ts`** (admin step-back, ~line 451):
- Same changes: add `query_type: 'send_back'`, set resolved status

### 3. Query Filtering -- Exclude Send-Backs from Active Counts

**`src/hooks/useOpenQueryCount.ts`**:
- Add `.eq('query_type', 'query')` filter so send-backs don't inflate the open count

**`src/pages/QueryInbox.tsx`** (~line 131):
- Add `.eq('query_type', 'query')` to the main query fetch so send-backs don't appear in the inbox

**`src/hooks/useKpis.ts`** (`useOpenQueryCounts`, ~line 999):
- Add `.eq('query_type', 'query')` filter

**`src/pages/admin/AdminDashboard.tsx`** and **`src/pages/ManagementDashboard.tsx`**:
- Add `.eq('query_type', 'query')` to open query count queries

### 4. Keep Send-Backs Visible in History

**`src/hooks/useQueryWorkflow.ts`** (`useQueryHistory`):
- No filter change -- send-backs remain visible in KPI query history/journey view
- The `[SENT BACK]` prefix in the reason field provides clear labeling

**`src/hooks/useKpis.ts`** (`useKpiQueries`):
- No filter change -- keep all entries for full history display

### 5. Update Documentation

**`DOCUMENTATION.md`**:
- Document the `query_type` column and its values
- Explain that send-backs are auto-resolved and excluded from active query counts

## Files Changed

| File | Change |
|---|---|
| Database migration | Add `query_type` column, backfill existing send-backs, auto-resolve them |
| `src/hooks/useKpis.ts` | Tag send-back inserts with `query_type: 'send_back'` + resolved status; filter `useOpenQueryCounts` |
| `src/hooks/useAdminDataEntry.ts` | Tag admin step-back inserts with `query_type: 'send_back'` + resolved status |
| `src/hooks/useOpenQueryCount.ts` | Filter by `query_type = 'query'` |
| `src/pages/QueryInbox.tsx` | Filter by `query_type = 'query'` |
| `src/pages/admin/AdminDashboard.tsx` | Filter open query count by `query_type = 'query'` |
| `src/pages/ManagementDashboard.tsx` | Filter open query count by `query_type = 'query'` |
| `DOCUMENTATION.md` | Document `query_type` column |
