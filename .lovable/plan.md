

## Add Audit Log Timeline to Review Timeline PDF

### Problem
The "Review Timeline" dialog shows a full audit history (status changes, rollbacks, auto-scoring, admin overrides, etc.) from the `kpi_audit_logs` table, but the PDF export only includes the review stage cards. The user expects the PDF to match what they see in the dialog.

### Changes

**1. Update `src/components/review/KpiJourneySection.tsx`**
- Fetch audit logs for the KPI (same query as `KpiTimeline.tsx`: from `kpi_audit_logs` ordered by `created_at desc`)
- Fetch performer profiles for the logs
- Pass the audit log entries as a new `auditLogs` array to the PDF export function
- Each entry: `{ action, label, performerName, date, details[] }`

**2. Update `src/lib/pdfExport.ts`**
- Extend `ReviewTimelinePdfData` with an optional `auditLogs` array:
  ```typescript
  auditLogs?: Array<{
    label: string;
    performerName: string;
    date: string;
    details: string[];
  }>;
  ```
- After the review stages grid, add a new "REVIEW TIMELINE" section that renders each audit log entry as a compact row with:
  - Action label (bold)
  - "by {performer}" and date (right-aligned)
  - Detail bullet points below
  - Page break handling for long timelines

**3. Reuse `formatDetails` logic**
- Extract the `formatDetails` function from `KpiTimeline.tsx` into a shared utility (or duplicate inline in the journey section) so the PDF gets the same detail text (status changes, scores, reasons, etc.)

### Layout in PDF
After the existing review stage cards grid:
```
REVIEW TIMELINE
┌──────────────────────────────────────────────────┐
│ PENALTY ROLLBACK              23 Mar 2026, 08:01 │
│ by Nitesh Kumar Baldwa                           │
│ • Admin Reason: Rollback: sent-back KPI was...   │
│ • New Status: Self Review                        │
├──────────────────────────────────────────────────┤
│ Status Changed                23 Mar 2026, 08:00 │
│ by Nitesh Kumar Baldwa                           │
│ • New Status: Self Review                        │
├──────────────────────────────────────────────────┤
│ SYSTEM AUTO SCORED            21 Mar 2026, 11:49 │
│ by Jaspal                                        │
│ • New Status: Approved                           │
└──────────────────────────────────────────────────┘
```

Each entry is a bordered row, with automatic page breaks. This matches the dialog UI the user sees.

