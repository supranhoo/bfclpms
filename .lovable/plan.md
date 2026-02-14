

# RCA and CAPA: January Month KRAs Not Visible for Jitendra Bharti

## Root Cause Analysis

### Finding: Not a Data Issue -- It's a Default Period Problem

Jitendra Bharti (101715) has **13 KPIs for January 2026**, all at **self_review** status (pending action). The data is fully present in the database.

The issue is that the **My Dashboard defaults to February 2026** (current month). When the user lands on the dashboard, they see only February KPIs. January KPIs require manually switching the month dropdown from "Feb" to "Jan."

### Data Summary for Jitendra Bharti

```text
Period           Status          Count
-----------      -----------     -----
January 2026     self_review     13     <-- Pending action, but hidden by default
February 2026    kra_set         9      <-- What the user sees on load
February 2026    self_review     4
December 2025    approved        13
November 2025    approved        13
```

### Why It Happens

1. `useDefaultPeriodSelection()` returns the current calendar month (February 2026)
2. `useMyKpis()` fetches all KPIs for the employee (correct)
3. `periodFilteredKpis` filters by `selectedPeriod === 'February'` -- so January KPIs are loaded but not displayed
4. The "smart period detection" feature only works for **reviewer views** (Team Review, Audit, Management), not the employee's own self-dashboard

### Impact

Any employee with pending KPIs from a previous month will not see them unless they manually switch the period dropdown. This causes confusion and missed deadlines.

## CAPA: Add Pending Period Alert to Self Dashboard

### The Fix

Add a small alert banner at the top of the self-dashboard when the employee has **KPIs in earlier periods that are still at actionable statuses** (self_review, kra_set). The banner will say something like:

> "You have 13 pending KPIs for January 2026. [Switch to January]"

This reuses the same `useMyKpis()` data already loaded -- zero additional API calls.

### Implementation Details

**File: `src/pages/Dashboard.tsx`**

1. Add a `pendingPeriods` memo that scans all loaded KPIs for periods earlier than the selected one where `status` is `kra_set` or `self_review`
2. Render a dismissible alert banner above the scorecard when pending periods are found
3. The "Switch" button sets `periodSelection` to the pending period
4. Only show for `viewMode === 'self'` (employee's own dashboard)

**File: `DOCUMENTATION.md`**

Record the pending period alert feature.

### What Does NOT Change

- No new API calls or hooks
- No database changes
- No changes to the period selector itself
- Reviewer views (Team, Audit, Management) are unaffected -- they already have smart period detection

### Risk: None

The alert is purely informational, derived from already-fetched data. It adds a convenience shortcut without modifying any existing logic.

