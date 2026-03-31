

## Plan: Clean Up Query Raised Notifications — Remove Formula/Scoring, Show Query Text

### Problem (Two Issues)

1. **In-app notification message** includes full KPI name with description, formula, and scoring logic — makes it unreadable (see screenshot)
2. **Email notification** shows `Query: N/A` because the `query_reason` is never passed in the notification metadata; it also includes the bloated `kpi_name`

### Root Cause

- **In-app**: `useKpis.ts` line 942 uses `kpiName` raw from DB (which contains multi-line text with description/formula/scoring)
- **Email**: The DB trigger reads `kpi_name` from the `kpis` table without truncation for `query_raised` type (observations already do `LEFT(SPLIT_PART(...), 80)`). Also, `metadata->>'query_reason'` is null because the notification insert only stores `{ query_id }`, not the reason text.

### UI After Fix

**In-app notification (dark modal):**
```text
┌──────────────────────────────────────────────────────────┐
│ 🔔  Query Raised                                    ✕   │
│                                                          │
│ New Query Raised                                         │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Jaspal raised a query on "On-time Completion of      │ │
│ │ Monthly Performance Reviews(Director's Reportees)":  │ │
│ │ tets                                                 │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ From           Date                                      │
│ Jaspal         31 Mar 2026, 11:36 AM                     │
│                                                          │
│        [ Open in App ]                                   │
│        [ Close       ]                                   │
└──────────────────────────────────────────────────────────┘

  ↑ KPI name is just the first line (no description/formula/scoring)
  ↑ Query reason ("tets") is clearly visible
```

**Email notification:**
```text
┌──────────────────────────────────────────────────────────┐
│  BFCL Logo              ❓ Query Raised                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Hi Ankit Choudhary,                                     │
│                                                          │
│  Jaspal has raised a query on your KPI.                  │
│                                                          │
│  KPI: On-time Completion of Monthly Performance          │
│       Reviews(Director's Reportees)                      │
│  Period: January 2026                                    │
│  Query: tets                                             │
│                                                          │
│  Please respond to this query at your earliest           │
│  convenience.                                            │
│                                                          │
└──────────────────────────────────────────────────────────┘

  ↑ KPI name: first line only (no formula/scoring)
  ↑ Query text: actual reason typed by raiser (not "N/A")
```

### Changes

**1. `src/hooks/useKpis.ts`** — In `useRaiseQuery` mutation:
- Extract first line of `kpiName`: `kpiName.split('\n')[0].substring(0, 100)`
- Pass `query_reason` in the notification metadata so the DB trigger can read it
- Use the clean KPI name in the notification message

```typescript
// Before:
message: `${raiserName} raised a query on "${kpiName}": ${reason.slice(0, 120)}`,
metadata: { query_id: data.id },

// After:
const cleanKpiName = (kpiRes.data?.kpi_name || 'a KPI').split('\n')[0].substring(0, 100);
message: `${raiserName} raised a query on "${cleanKpiName}": ${reason.slice(0, 120)}`,
metadata: { query_id: data.id, query_reason: reason },
```

**2. Database migration** — Update the notification trigger to strip `kpi_name` to first line for `query_raised` type (same pattern already used for observations):

```sql
-- Add 'query_raised', 'query_response_submitted', 'query_resolved' to the
-- truncation condition alongside observation types
IF NEW.type IN ('observation_raised', ..., 'query_raised', 'query_response_submitted', 'query_resolved') THEN
  v_kpi_name := LEFT(SPLIT_PART(COALESCE(v_kpi_name, ''), E'\n', 1), 80);
END IF;
```

**3. `DOCUMENTATION.md`** — v2.15.16 changelog

**4. `POLICY.md`** — Add invariant: notification messages must use first-line-only KPI names

### Files Modified

| File | Change |
|------|--------|
| `src/hooks/useKpis.ts` | Clean KPI name to first line; pass `query_reason` in metadata |
| DB migration | Extend first-line truncation to query notification types |
| `DOCUMENTATION.md` | v2.15.16 |
| `POLICY.md` | KPI name truncation invariant for notifications |

### Risk Assessment
- **Regression**: Zero — email template already has `{{query_reason}}` placeholder; it just received null before
- **Data**: Existing notifications unchanged; only new notifications will have clean text
- **Performance**: No additional queries; just string manipulation on existing data

