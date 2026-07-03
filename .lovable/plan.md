## Root cause
Step-back RPC succeeds server-side, but the `overall_status` change fires trigger `notify_annual_review_stage_change`, which inserts a row in `public.notifications` with `kpi_id = NULL`. That inserts trigger `trigger_send_email_on_notification` → function `public.send_email_on_notification()`, which unconditionally references `kpi_record.kpi_name / kra_name / review_period / review_year` even when the `SELECT INTO kpi_record` was skipped (kpi_id is NULL). Postgres raises `55000 record "kpi_record" is not assigned yet`. There is no `EXCEPTION WHEN OTHERS` in the current version, so the error bubbles up and aborts the whole RPC. Any non-KPI notification (annual review stage change, etc.) hits this same bug.

## Fix (single migration, additive)
Replace `public.send_email_on_notification()` body so it:
1. Declares local variables `v_kra_name text`, `v_review_period text`, `v_review_year int` initialized to NULL.
2. Assigns them from `kpi_record` **only when `NEW.kpi_id IS NOT NULL` and the SELECT INTO found a row** (guard with `IF FOUND`).
3. Uses these locals — not `kpi_record.*` — in the `jsonb_build_object(...)` payload.
4. Wraps the outbound `net.http_post` in `BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE WARNING ...; END;` so a downstream failure never breaks the originating write.

No signature change, no trigger change, no policy change. Behaviour for KPI-linked notifications is identical.

## Verification
- Re-invoke `send_back_annual_review_status` for `test003` (currently `pending_dept`) as admin → RPC returns `pending_self` (or the correct prev stage), `annual_review_instances.overall_status` updates, notification row appears, no 55000 error.
- Existing KPI notifications still carry `kpi_name / kra_name / review_period / review_year`.
- Toast in the UI now shows the success message instead of "Failed to step back".

## Out of scope
- No changes to `notify_annual_review_stage_change`.
- No UI changes (already wired in the previous turn).
