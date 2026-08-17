# Fix: "Pending With" missing from KPI Status Tracker Excel

## Root cause (verified)
The export writes only the fields resolved from the database field registry
(`report_field_registry`, report `RPT-KST-001`). That registry holds 16 rows and
does **not** contain `pending_with` (nor `employee_status`) — both were added to the
page's in-code default list later but never seeded to the database.

The resolver hook takes an all-or-nothing path: if the report has *any* database rows,
the in-code defaults are ignored entirely. So the on-screen table (which renders
"Pending With" from hardcoded JSX) shows the column, while the Excel export drops it.
This is a drift class, not a one-off: any field added in code after seeding disappears
from every registry-driven export.

## Fix

1. **Seed the missing rows** (migration, additive only):
   - `RPT-KST-001` → `pending_with` ("Pending With (Name)", sort 145) and
     `employee_status` ("Employee Status", sort 45).
   - Inserted with `ON CONFLICT DO NOTHING`, so re-running is safe.

2. **Close the drift class in the resolver** (`src/hooks/useResolvedReportFields.ts`):
   Instead of "database rows win outright", merge — database rows keep their labels,
   sort and hidden state, and any default field key absent from the database is
   appended using its in-code definition. New code fields then always reach exports,
   and admin renames/hides still win where a database row exists.

3. **Drift guard test** (`src/test/reportFieldRegistryDrift.test.ts`):
   Asserts the merge keeps every default field key present when the database set is
   a partial subset, and that database labels/hidden flags still override defaults.

4. **Docs**: DOCUMENTATION.md version history entry and POLICY.md
   §RPT-FIELD-REGISTRY-MERGE recording that the registry is additive over in-code
   defaults, never a replacement.

## Risk & impact
- Data: no schema change; two additive registry rows. Rollback = delete the two rows.
- Workflow: none. Reads only.
- UI: KPI Status Tracker Excel gains "Pending With (Name)" and "Employee Status".
  Other reports gain any field their code declares but the database lacks — that is
  the intended correction; existing renames and hides are preserved.
- Regression risk: low, confined to the resolver merge; covered by the new test.
