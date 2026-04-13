

## Fix: "Open in App" for Observation Reply Navigates to Own Dashboard

### Root Cause

The DB trigger `notify_on_observation_reply()` creates notification rows with this metadata:
```json
{
  "observation_id": "...",
  "reply_id": "...",
  "observation_title": "...",
  "reply_content": "...",
  "observation_type": "...",
  "observation_description": "..."
}
```

**Missing: `employee_id`** (the KPI owner).

The navigation function `getNotificationNavigationPath` (inboxUtils.ts:200) checks:
```typescript
const metaEmployeeId = meta.employee_id || null;
const isSelfTargeted = currentUserId && (!metaEmployeeId || metaEmployeeId === currentUserId);
```

Since `employee_id` is null, `isSelfTargeted` is always `true`, so the link resolves to `/dashboard?kpi=xxx` — the user's own KPI view, which either shows nothing or the wrong KPI.

### Fix

**1. Database migration** — Update `notify_on_observation_reply()` to include `employee_id` (the KPI owner `v_kpi_owner`) in the metadata `jsonb_build_object` call for both notification inserts.

```sql
jsonb_build_object(
  'observation_id', NEW.observation_id,
  'reply_id', NEW.id,
  'observation_title', v_obs_title,
  'reply_content', v_reply_content,
  'observation_type', v_obs_type,
  'observation_description', v_obs_description,
  'employee_id', v_kpi_owner          -- NEW
)
```

This applies to both the "notify observation creator" insert (line 40) and the "notify KPI owner" insert (line 56).

**2. Same fix for `observation_raised` and `observation_resolved`** — Audit the other observation notification triggers (`notify_on_observation_raised`, `notify_on_observation_resolved`) to ensure they also include `employee_id` in metadata. If missing, add it in the same migration.

**3. `DOCUMENTATION.md` / `POLICY.md`** — Version bump, changelog.

### No frontend changes needed
The navigation logic in `inboxUtils.ts` already handles `employee_id` correctly — it just wasn't receiving it.

### Risk Assessment
- **Data impact**: Only affects new notifications (existing ones without `employee_id` will continue to fall back to dashboard)
- **Regression risk**: None — adding a new key to metadata JSON
- **Fix confidence**: High

