## Root cause of "Committed 0, 611 failed"

The RPC `admin_apply_system_scores_upgrade` (ADR-171) declares:

```sql
v_next_final numeric;
...
v_next_final := v_inst.final_rating;
```

But `annual_review_instances.final_rating` is a **text** column populated with labels like `Good`, `Average`, `Outstanding`, `Poor` (verified: 1,775 completed rows currently hold text labels).

On the very first line of the assignment, PostgreSQL tries to cast `'Good'::text → numeric` and raises `invalid input syntax for type numeric: "Good"`. Every completed instance the client tried to upgrade therefore aborted with that error — hence **0 committed / 611 failed**.

The JS caller always passes `p_final_rating: null` / `p_total_score: null`, so the whole "monotonic final rating" branch is dead weight in the current shipping code — it was written against an assumed numeric column that never existed.

## Fix (single migration, minimal blast radius)

Redefine `public.admin_apply_system_scores_upgrade` so it:

1. Declares `v_next_final text` (matches the column) and, defensively, changes the `p_final_rating` parameter to `text` — the JS caller passes `null` today, so this is source-compatible.
2. Keeps the same monotonic guard for `p_total_score` (numeric — that column really is numeric).
3. For `final_rating`, only overwrites when `p_final_rating IS NOT NULL AND v_inst.final_rating IS DISTINCT FROM p_final_rating` (no `>=` numeric compare — labels aren't ordered).
4. Everything else — per-cell monotonic system-score merge, audit-log insert with `system_scores.admin_override`, return shape — stays byte-identical.

No client change required. TS type file will regenerate after migration is approved.

## Verification plan

- Regression SQL test in the migration itself:
  - Seed one completed instance with `final_rating='Good'`.
  - Call the RPC with a strictly higher `system_scores` payload.
  - Assert: `system_scores` upgraded, `final_rating` still `'Good'`, one audit row inserted.
- Post-migration, ask you to re-run the same file with **Apply to completed reviews (upgrades only)** ticked; the toast should read `Committed N, 0 failed` (N = apply count from the dry run).

## Risk & impact

- **Data impact**: none — RPC only writes when a cell strictly upgrades; audit row still recorded.
- **Regression risk**: low — signature stays name-compatible (`p_final_rating` optional, default null); no other caller in the codebase passes it.
- **Rollback**: re-run previous migration body (kept in git history) if needed.
