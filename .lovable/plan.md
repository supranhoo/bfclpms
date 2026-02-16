

# Add Ticket Numbers to Queries and Observations

## Overview

Add auto-generated, human-readable ticket numbers to both Queries and Observations. Queries will use the format `Q-0001`, `Q-0002`, etc. Observations will use `OBS-0001`, `OBS-0002`, etc. These will be generated automatically by the database and displayed across all relevant UI locations.

---

## Database Changes

### 1. Add `ticket_number` columns and sequences

Create two PostgreSQL sequences and add a `ticket_number` column (with auto-generated default) to both tables:

- `kpi_queries.ticket_number` -- format: `Q-XXXXX` (zero-padded, e.g., Q-00001)
- `kpi_observations.ticket_number` -- format: `OBS-XXXXX` (e.g., OBS-00001)

The sequences ensure globally unique, monotonically increasing numbers. A `UNIQUE` constraint prevents duplicates.

### 2. Backfill existing records

Assign ticket numbers to all existing queries and observations ordered by `created_at` so historical data is also numbered.

---

## UI Changes -- Where Ticket Numbers Will Appear

| Location | File | Display |
|---|---|---|
| Query Inbox -- row items | `InboxDetailSheet.tsx`, `InboxRowItem.tsx` | Show ticket # as a small badge next to the title |
| Query Inbox -- detail sheet | `InboxDetailSheet.tsx` | Show ticket # prominently in the header |
| Query History dialog | `QueryHistoryDialog.tsx` | Replace `Query #1, #2` index labels with actual ticket numbers |
| Query Report table | `QueryReport.tsx` | Add a "Ticket #" column |
| Observation cards | `ObservationCard.tsx` | Show ticket # badge in the header row |
| Observations Overview (admin) | `ObservationsOverview.tsx` | Add a "Ticket #" column to the table |
| Inbox utils (search) | `inboxUtils.ts` | Include ticket number in search matching |

---

## Technical Details

### Migration SQL

```sql
-- Query ticket numbers
CREATE SEQUENCE public.query_ticket_seq START 1;

ALTER TABLE public.kpi_queries
ADD COLUMN ticket_number text
  UNIQUE
  DEFAULT 'Q-' || lpad(nextval('public.query_ticket_seq')::text, 5, '0');

-- Observation ticket numbers
CREATE SEQUENCE public.observation_ticket_seq START 1;

ALTER TABLE public.kpi_observations
ADD COLUMN ticket_number text
  UNIQUE
  DEFAULT 'OBS-' || lpad(nextval('public.observation_ticket_seq')::text, 5, '0');

-- Backfill existing queries
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM public.kpi_queries WHERE ticket_number IS NULL
)
UPDATE public.kpi_queries q
SET ticket_number = 'Q-' || lpad(n.rn::text, 5, '0')
FROM numbered n WHERE q.id = n.id;

-- Backfill existing observations
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM public.kpi_observations WHERE ticket_number IS NULL
)
UPDATE public.kpi_observations o
SET ticket_number = 'OBS-' || lpad(n.rn::text, 5, '0')
FROM numbered n WHERE o.id = n.id;

-- Advance sequences past existing records
SELECT setval('public.query_ticket_seq',
  COALESCE((SELECT COUNT(*) FROM public.kpi_queries), 0) + 1, false);
SELECT setval('public.observation_ticket_seq',
  COALESCE((SELECT COUNT(*) FROM public.kpi_observations), 0) + 1, false);
```

### Frontend File Changes

| File | Change |
|---|---|
| `src/lib/inboxUtils.ts` | Add `ticketNumber` field to `InboxItem` type; include in search |
| `src/pages/QueryInbox.tsx` | Map `ticket_number` into query data and inbox items |
| `src/components/inbox/InboxRowItem.tsx` | Show ticket # badge before title |
| `src/components/inbox/InboxDetailSheet.tsx` | Show ticket # in header |
| `src/components/inbox/MobileInboxList.tsx` | Show ticket # in mobile card |
| `src/components/review/QueryHistoryDialog.tsx` | Use `ticket_number` instead of index-based `Query #N` |
| `src/components/review/ObservationCard.tsx` | Show ticket # badge in header row |
| `src/pages/admin/ObservationsOverview.tsx` | Add "Ticket #" column, include in search |
| `src/pages/reports/QueryReport.tsx` | Add "Ticket #" column |
| `src/hooks/useKpiObservations.ts` | Ensure `ticket_number` is included in selects |
| `src/hooks/useQueryWorkflow.ts` | Ensure `ticket_number` is included in selects |
| `DOCUMENTATION.md` | Document the ticket number feature |

### Data Flow

- Both tables already use `SELECT *` in most hooks, so `ticket_number` will be automatically included in fetched data after the migration
- The `InboxItem` type in `inboxUtils.ts` will get an optional `ticketNumber` field populated from the query/notification metadata
- Ticket numbers are immutable once assigned -- no editing or reassignment

