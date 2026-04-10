

## RCA + CAPA: "invalid input value for enum kpi_status: 'approved'"

### 1. Root Cause

The `review_submissions.kpi_status` column uses the `kpi_status` enum, which has these valid values:
- `open`, `submitted`, `approved_by_manager`, `locked`

The repair function writes `kpi_status: "approved"` when upserting into `review_submissions` (lines ~362 and ~455). But `"approved"` is **not** a valid value in this enum — it belongs to the separate `review_status` enum used by `kpis.status`.

This is a simple enum mismatch: the code confused `kpis.status` (review_status enum, which has `approved`) with `review_submissions.kpi_status` (kpi_status enum, which does not).

### 2. Impact

All 6 repair attempts failed. Zero KPIs were actually repaired — the database rejected every upsert.

### 3. Corrective Action

**Fix the enum value in `repair-stepped-back-siblings/index.ts`:**

Replace every instance of `kpi_status: "approved"` with `kpi_status: "locked"` in the `review_submissions` upsert calls (two locations: Path A ~line 362, Path B ~line 455).

`locked` is the correct terminal state for submissions — existing approved KPIs in the database all use `locked` or `submitted` for their submission records.

### 4. Preventive Action

- Add a comment in the edge function documenting that `kpi_status` enum values differ from `review_status` enum values.
- Update `DOCUMENTATION.md` with an enum reference table.

### 5. Files to update

- `supabase/functions/repair-stepped-back-siblings/index.ts` — change `"approved"` → `"locked"` in two upsert blocks
- `DOCUMENTATION.md` — add enum reference note

