# ADR-225a: Correction RPC signature parity and score recompute

- Status: Accepted (1 August 2026)
- Context: A bulk downgrade run on 1 Aug 2026 changed nothing. Employee 101772's
  `Annual Production Target Vs Actual` stayed at raw 97.007 / 20 pts even though the
  file carried 85 (which the `annual_production` bands score 2/5 -> 10 pts), and
  `annual_review_access_audit` had no rows after 30 Jul.
  Root cause: `admin_apply_system_scores_correction` (ADR-225) declared
  `p_final_rating numeric` while `annual_review_instances.final_rating` is TEXT.
  `COALESCE(p_final_rating, v_inst.final_rating)` therefore raised
  `COALESCE types numeric and text cannot be matched` on every call. The client
  caught it, counted the row as `failed`, and the toast reported only a count —
  so a 100% failure looked like a no-op. Secondary defect: neither admin RPC
  recomputed `total_score` / `final_rating`, so a corrected cell left the headline
  score stale.
- Decision:
  - `admin_apply_system_scores_correction` is recreated with `p_final_rating text`,
    matching the column and the sibling `admin_apply_system_scores_upgrade`.
  - When the caller passes no explicit `p_total_score`, the RPC recomputes
    `total_score` and `final_rating` from the corrected stored state via
    `annual_review_compute_final_summary(p_instance_id)` and writes them back.
    Explicit caller values still win.
  - A raw-value-only change (same points, different raw) is now also persisted.
  - The `system_scores.admin_correction` audit row records the recomputed total,
    rating and a `recomputed` flag alongside the full before/after maps.
  - The bulk upload dialog surfaces per-employee commit errors in a destructive
    toast (20s) and keeps the preview open, so a server-side exception can never
    be mistaken for "nothing to change".
- Consequences: downgrade corrections now persist and move the final score and
  rating, which shifts bell-curve, slab and calibration outputs for the affected
  employees. `admin_apply_system_scores_upgrade` is unchanged. Rollback data is
  the audit `before` payload (full score maps, total, rating).