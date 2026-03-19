

## Add Send-Back History to KPI Journey Timeline Report

### Current State
- Send-back events are stored in `kpi_queries` table with `query_type = 'send_back'`. Each record has: `kpi_id`, `raised_by`, `reason`, `created_at`, `status`.
- There are 195 send-back records in the system. Some KPIs have up to 3 send-backs.
- The current report has zero visibility into send-backs.

### Design

Add two new data points per KPI row:
1. **Send-Back Count** — how many times this KPI was sent back (0, 1, 2, 3…)
2. **Send-Back Details** — a JSON array with each send-back's date, who sent it back, and reason

On the UI, display the count as a badge in a new column. Clicking or hovering shows a popover/tooltip with the full history (each send-back: date, person, reason). In Excel export, render as separate columns: "Send-Back Count" and "Send-Back Details" (a semicolon-separated list of entries).

Add a new summary card: **Total Send-Backs** showing the aggregate count across all KPIs for the period.

### Plan

| # | Layer | Change |
|---|-------|--------|
| 1 | **Database RPC** | Add a `send_backs` CTE that aggregates `kpi_queries` (where `query_type = 'send_back'`) per KPI, producing `send_back_count` and a JSON array of `{date, raisedBy, reason}`. Join into `rows_data` output. Add `sendBackCount` and `sendBacks` fields to the JSON object. Also add `totalSendBacks` to the summary. |
| 2 | **Hook types** (`useKpiJourneyReport.ts`) | Add `sendBackCount: number` and `sendBacks: Array<{date: string, raisedBy: string, reason: string}>` to `KpiJourneyRow`. Add `totalSendBacks: number` to `KpiJourneySummary`. |
| 3 | **Report page** (`KpiJourneyReport.tsx`) | Add a "Send-Backs" column after "Status". Show count as a colored badge (0 = green/none, 1+ = amber/red). Add a `HoverCard` or `Popover` on the badge that lists each send-back (date, person, reason). Add a 5th summary card for "Total Send-Backs". Update Excel export with "Send-Back Count" and "Send-Back History" columns. |

### Technical Detail — RPC CTE

```sql
send_backs AS (
  SELECT
    kq.kpi_id,
    COUNT(*)::int AS send_back_count,
    jsonb_agg(
      jsonb_build_object(
        'date', kq.created_at::text,
        'raisedBy', COALESCE(sbp.full_name, 'System'),
        'reason', COALESCE(kq.reason, '—')
      ) ORDER BY kq.created_at
    ) AS details
  FROM kpi_queries kq
  LEFT JOIN profiles sbp ON sbp.id = kq.raised_by
  WHERE kq.query_type = 'send_back'
    AND kq.kpi_id IN (SELECT id FROM paged)
  GROUP BY kq.kpi_id
)
```

Then in `rows_data`, join `LEFT JOIN send_backs sb ON sb.kpi_id = pg.id` and add:
- `'sendBackCount', COALESCE(sb.send_back_count, 0)`
- `'sendBacks', COALESCE(sb.details, '[]'::jsonb)`

For the summary, add a sub-query counting total send-backs across all `na_filtered` KPIs.

### UI Behavior
- **Badge**: `0` = no badge shown, `1` = amber badge "1×", `2+` = red badge "2×", "3×" etc.
- **Popover on click**: Lists each send-back chronologically with date, reviewer name, and reason.
- **Excel**: "Send-Back Count" as a number, "Send-Back History" as `"17 Mar 2026 by Jaspal: invalid evidence; 18 Mar 2026 by Mayank: Evidence not attached"`.

