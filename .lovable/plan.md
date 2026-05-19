## Issue

The `safety-drill` edge function returns `select safety_incidents: Invalid schema: safety_drill`. The source on disk no longer contains that error path — it now uses the new `safety_drill_dump` / `safety_drill_load` RPCs. The 500 is coming from the **previously deployed** version of the function still running in Lovable Cloud.

## Plan

1. Redeploy `safety-drill` so the live function matches the current source (which uses RPCs instead of `db: { schema: 'safety_drill' }`).
2. Re-run the drill from Admin → Settings → Backups → **Run drill**.
3. If a different error surfaces after redeploy, tail `safety-drill` logs and patch from there.

No code or schema changes are needed — only a deploy.