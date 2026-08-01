# Fix: "column reference \"instance_id\" is ambiguous" on Apply (bulk exemption)

## What is happening
The preview works (581 employees listed), but pressing **Apply to 581** fails. Nothing is written — the run aborts, so no exemptions are created and no data is half-applied.

## Root cause (confirmed)
`bulk_exempt_eligibility_criterion` returns a result table whose columns are named
`instance_id, employee_id, criterion_name, actual, action, message`. In PL/pgSQL those
output column names are also variables inside the function body.

The insert that writes the exemption uses:

```text
INSERT INTO annual_review_eligibility_exemptions (...)
ON CONFLICT (instance_id, criterion_id) DO UPDATE ...
```

Postgres cannot tell whether `instance_id` in the conflict target means the table column
or the function's output variable, so it raises `column reference "instance_id" is ambiguous`.
This code path only runs when `p_dry_run = false`, which is exactly why the preview succeeds
and Apply fails.

## Fix
One migration, `CREATE OR REPLACE` of the same function with the same signature and same
returned columns. The only change: infer the conflict by its unique constraint name instead
of by column list —

```text
ON CONFLICT ON CONSTRAINT ar_elig_exemption_unique DO UPDATE ...
```

(`ar_elig_exemption_unique` is the existing `UNIQUE (instance_id, criterion_id)` constraint.)
No behaviour, gating, penalty logic, audit or run-history change.

## Verification
1. Re-run the dialog in dry-run mode — count must stay 581.
2. Apply, then confirm rows in `annual_review_eligibility_exemptions` with `source = 'bulk'`
   and a matching `annual_review_bulk_exemption_runs` row with `applied_count = 581`.
3. Re-run Apply once more to prove the upsert branch (no duplicate rows, counts stable).
4. Revoke the run and confirm eligibility returns to its prior state.

## Risk
- Data impact: none to schema; additive rows only, revocable via the existing run revoke.
- Regression risk: minimal — signature, output columns and all guards are unchanged.
- Rollback: re-apply the previous function body, or revoke the bulk run.

## Docs
- `docs/adr/ADR-224.md` — note the conflict-target fix.
- `POLICY.md` §AR-ELIGIBILITY-EXEMPTION — no policy change, version-history entry only.
