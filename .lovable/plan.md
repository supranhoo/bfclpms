

# Add "Sent Back" Badge for Re-Audit KPIs

## What This Solves

Auditors currently see all KPIs in the "In Audit" status card without knowing which ones are first-time reviews vs. which ones were sent back from Management. This makes it hard to prioritize re-audit items.

## Approach

Query `kpi_audit_logs` for any `MANAGEMENT_SENT_BACK_TO_AUDITOR` actions on KPIs that are currently in `audit` status. Use this data to show an amber "Sent Back" badge next to those KPIs in the Audit Scorecard view.

## Technical Details

### 1. New Hook: Detect Sent-Back KPIs

**File: `src/hooks/useSentBackKpis.ts`** (NEW)

A lightweight hook that takes an array of KPI IDs and returns a `Set<string>` of IDs that have a `MANAGEMENT_SENT_BACK_TO_AUDITOR` entry in `kpi_audit_logs`.

```typescript
// Query: select distinct kpi_id from kpi_audit_logs 
// where kpi_id in (...ids) and action = 'MANAGEMENT_SENT_BACK_TO_AUDITOR'
```

### 2. Update: `src/components/review/AuditScorecard.tsx`

- Import and call `useSentBackKpis(kpiIds)` to get the set of sent-back KPI IDs
- Pass `sentBackKpiIds` set down to `KpiDetailsTable` and `MobileKpiCard` as a new optional prop
- In the "In Audit" stats card, optionally show a sub-count of sent-back items (e.g., "In Audit: 5 (2 sent back)")

### 3. Update: `src/components/review/KpiDetailsTable.tsx`

- Add optional prop `sentBackKpiIds?: Set<string>`
- In the KRA/KPI name cell (around the existing badges for Daily, Bi-Monthly, etc.), add an amber "Sent Back" badge when `sentBackKpiIds?.has(kpi.id)` is true and the KPI status is `audit`

### 4. Update: `src/components/review/MobileKpiCard.tsx`

- Add same optional prop and render the amber "Sent Back" badge in the mobile card header

### 5. Update: `DOCUMENTATION.md`

- Version bump to 1.45.58
- Document the sent-back indicator feature

## Visual Result

In the KPI table, a sent-back KPI will appear as:

```
KRA Name                        [Daily] [Sent Back]
KPI description text
```

The "Sent Back" badge will be amber/orange with a small undo icon, making it immediately distinguishable from frequency badges.

## Files Summary

| File | Change |
|------|--------|
| `src/hooks/useSentBackKpis.ts` | NEW -- hook to detect sent-back KPIs via audit logs |
| `src/components/review/AuditScorecard.tsx` | Use hook, pass data to table/cards, update stats |
| `src/components/review/KpiDetailsTable.tsx` | Add optional prop, render "Sent Back" badge |
| `src/components/review/MobileKpiCard.tsx` | Add optional prop, render "Sent Back" badge |
| `DOCUMENTATION.md` | Version bump + changelog |

No database changes required -- reads from existing `kpi_audit_logs` table.

