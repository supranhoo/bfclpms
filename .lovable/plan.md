

## Plan — Include Send-Back Remark in "KPI Sent Back for Revision" Email

### Root Cause

The send-back remark is captured in the UI (`AuditScorecard`, `ManagementScorecard`, `useKpis.sendBackKpi`, etc.) but is **not** propagated to the email template. Two gaps:

1. **DB trigger gap**: `notify_on_kpi_status_change` (CASE 1: send-back) writes notifications without `send_back_reason` in `metadata`. The dispatcher trigger `send_email_on_notification` already forwards `NEW.metadata->>'send_back_reason'` to the edge function — it's just always NULL for `manager_rejected`.
2. **Template gap**: The `manager_rejected` template body in `send-email-notification/index.ts` and `EmailTemplateEditor.tsx` does not include `{{send_back_reason}}` at all.

The reason text exists in `kpi_audit_logs` (logged by the existing send-back mutations as the audit `notes`) but never reaches the notifications row.

### Fix

#### 1. Persist remark on send-back (write source)

Update every send-back call site to also write the reason into the `kpis` row's transient context so the trigger can read it. Cleanest path: each mutation already runs an `UPDATE kpis SET status = ...`. Add a sibling `INSERT INTO public.kpi_status_change_context(kpi_id, send_back_reason, performed_by, created_at)` row immediately before the status update — a tiny new helper table acting as a "last reason" buffer the trigger consumes.

Affected mutation hooks/components (all already have `reason`):
- `src/components/review/AuditScorecard.tsx` (`sendBack` mutation)
- `src/components/review/ManagementScorecard.tsx` (`sendBack` mutation)
- `src/hooks/useKpis.ts` (`sendBackKpi` / manager send-back)
- Any HR-PMS / Skip-Level scorecard with send-back (audit during exploration; same pattern)

Alternative (simpler, preferred): instead of a new table, **pass `reason` directly into `notifications.metadata` from each call site** by inserting the notification row in code (or calling an RPC `notify_kpi_sent_back(kpi_id, reason)`) BEFORE the status update, and have the trigger skip emitting a duplicate when the reason is already present for this transition. Cleaner and avoids schema noise.

**Chosen approach**: New `SECURITY DEFINER` RPC `record_send_back_reason(p_kpi_id uuid, p_reason text)` writes the reason to a temporary session var (`set_config('app.current_send_back_reason', p_reason, true)`). Each send-back mutation calls it inside the same transaction immediately before the `UPDATE kpis SET status = 'kra_set'`. The trigger reads it via `current_setting('app.current_send_back_reason', true)` and stamps it into `metadata`.

This requires zero schema changes, no new tables, and is fully transactional.

#### 2. Trigger update

Patch `notify_on_kpi_status_change` (CASE 1: send-back to `kra_set`) to:
- Read `current_setting('app.current_send_back_reason', true)` into `v_send_back_reason`
- Include it in the `metadata` JSON: `'send_back_reason', v_send_back_reason`

#### 3. Template update

Append the reason block to the `manager_rejected` template body in:
- `supabase/functions/send-email-notification/index.ts`
- `src/components/admin/EmailTemplateEditor.tsx` (default template seed for the editor UI)

New body:
```
Hi {{recipient_name}},

Your KPI has been sent back for revision.

KRA: {{kra_name}}
KPI: {{kpi_name}}
Period: {{review_period}} {{review_year}}

Reviewer's Remark:
{{send_back_reason}}

Please review the feedback and update your submission.
```

Render-time guard: if `send_back_reason` is empty (legacy or admin step-back without remark), skip the "Reviewer's Remark" block. Implemented via the existing template engine's optional-section pattern (`{{#if send_back_reason}}...{{/if}}`) already used by `org_kpi_sent_back`.

#### 4. Admin step-back parity

`AdminStatusStepBack` already collects a mandatory reason (`reason` param on `useAdminStatusStepBack`). Wire it through the same `record_send_back_reason` RPC so admin-driven step-backs also include the remark in the email when the regression lands on `kra_set`.

### Files Changed

- **Migration** `supabase/migrations/<ts>_send_back_reason_in_email.sql`:
  - `CREATE OR REPLACE FUNCTION public.record_send_back_reason(p_reason text)` (uses `set_config`).
  - `CREATE OR REPLACE FUNCTION public.notify_on_kpi_status_change()` — patched CASE 1 only.
- **Edge function** `supabase/functions/send-email-notification/index.ts` — patched `manager_rejected.body` with optional `{{#if send_back_reason}}` block. Redeploy.
- **`src/components/admin/EmailTemplateEditor.tsx`** — same body update so admin-customized templates stay in sync; add `{{send_back_reason}}` to the variable hint chip list for `manager_rejected`.
- **`src/components/review/AuditScorecard.tsx`** — call `supabase.rpc('record_send_back_reason', { p_reason: sendBackReason })` inside `sendBack.mutationFn` before the status update.
- **`src/components/review/ManagementScorecard.tsx`** — same.
- **`src/hooks/useKpis.ts`** (`sendBackKpi`) — same.
- **`src/hooks/useAdminDataEntry.ts`** (`useAdminStatusStepBack`) — same when target is `kra_set`.
- **`DOCUMENTATION.md`** v2.66.7.5 — note under "Notification & Dispatch Engine" that send-back remark is now included in `manager_rejected` email and the wiring path.
- **`POLICY.md`** §91 — *"Reviewer remarks captured during a send-back must be included in the recipient's email notification when the destination stage is `kra_set`."*
- **`mem://architecture/notification-and-dispatch-engine`** — append: "Send-back remarks flow via `record_send_back_reason` RPC → session var → `notify_on_kpi_status_change` trigger → `metadata.send_back_reason` → dispatcher → `{{send_back_reason}}` template variable."

### Risk & Impact Report

- **Data Impact**: Zero schema changes. Adds one new SQL function; patches one existing trigger function in place. No backfill needed.
- **Workflow Impact**: None — send-back UI/UX unchanged; only the resulting email becomes richer.
- **UI/UX**: Email recipients now see the reviewer's remark inline. In-app notifications are unaffected (already store the title + KPI name).
- **Regression Risk**: Very low. The RPC is additive; the trigger change is a single new field in the metadata JSON; the template gracefully degrades when the reason is missing (legacy notifications, system auto-advance) using `{{#if send_back_reason}}`.
- **Mitigation**: Optional-section template guard ensures historical/empty cases render cleanly. Session var falls back to NULL when not set, so any send-back that bypasses the new RPC still produces a valid (remarkless) email exactly as today.

### Out of Scope

- Including the remark in the in-app `notifications.message` text (current message is intentionally short for inbox density).
- Reformatting other send-back templates (`org_kpi_sent_back` already includes the remark).
- HTML-side restyling of the email — purely content addition.

### Deliverables

- One migration adding `record_send_back_reason` RPC + patched `notify_on_kpi_status_change`.
- Patched `send-email-notification` edge function (with redeploy) + `EmailTemplateEditor` default seed.
- Wiring of `record_send_back_reason` in 4 send-back call sites (Audit, Management, Manager `useKpis`, Admin step-back).
- DOCUMENTATION.md v2.66.7.5 + POLICY.md §91 + memory update.

