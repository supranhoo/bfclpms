# Fix: Assisted Annual Form Submission Blocked by Notification Auth

## Root Cause

Screenshot error: `not authorized to send notifications to user 5d331422-...` during Assisted Submission Verification (Vivek Kumar Tripathi submitting as `authorized_proxy` on behalf of Chandradeep Prasad).

Flow:
1. Proxy calls `submit_annual_review_self_as_proxy` → advances `annual_review_instances.overall_status`.
2. A status-transition trigger inserts a notification for the next reviewer (manager / skip / HR).
3. `tg_notifications_enforce_sender_relationship` calls `can_send_notification_to(proxy, recipient)`.
4. The proxy is neither admin/HR/management nor in the recipient's manager chain, so it returns `false` and the whole submission aborts.

The proxy is a legitimate, audit-logged authorized submitter for that annual-review instance (`annual_review_proxy_submissions` + `can_proxy_submit_annual_review`), so the notification should be allowed.

## Risk & Impact

| Area | Impact |
|---|---|
| Data | Function body replace only. No schema change. |
| Workflow | Unblocks assisted submissions. No behavior change for non-proxy senders. |
| Security | Only widens the allow-list to senders already authorized to proxy-submit for the given employee's instance (existing `annual_review_proxy_submissions` row). No new visibility. |
| Regression | Low — additive branch after existing checks. |
| Rollback | Reissue previous `can_send_notification_to` body. |

## Plan

1. **Migration** — `CREATE OR REPLACE FUNCTION public.can_send_notification_to` adding an additional branch: if a row exists in `annual_review_proxy_submissions` where `proxy_user_id = sender` AND the linked `annual_review_instances.employee_id = target` OR the recipient is any reviewer on that instance (`manager_id / skip_id / dept_head_id / bu_head_id / hr_id`), return `true`. All existing branches preserved verbatim.
2. **Verification** — psql smoke: as proxy user, insert a notification for the recipient captured in the screenshot; expect no `42501`. Re-check `postgres_logs` for `not authorized to send notifications`.
3. **Docs** — `POLICY.md` and `docs/adr/ADR-107.md`: record that annual-review proxy submitters may notify the employee and that instance's reviewers.

## Out of Scope

Unrelated errors already visible in logs (`review_status = text`, anon `has_role` permission denials, uuid `"null"`) — separate ticket.
