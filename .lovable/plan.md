## Monthly Send-Back → Self Re-submit — Audit Findings

Read-only static review of code, migrations, and POLICY. No data touched. Runtime not executed.

### What works correctly (no fix needed)

- **Employee edit path**: `SelfReviewSheet` treats `status='kra_set' + prior submission` as "sent back", bypasses governance read-only lock, and shows `<SentBackBanner>` with reason/sender/date (`SelfReviewSheet.tsx:552-613`, `SentBackBanner.tsx:11-51`).
- **RLS on employee resubmit**: policy "Users can update their own KPIs" allows `kra_set → self_review` (migration `20260713084902`).
- **Re-submit RPC**: `submit_self_review` accepts both `kra_set` and `self_review`, flips status forward atomically, and its column-guard trigger prevents manager-field resurrection (§Send Back Data Preservation upheld).
- **Send-back reason flow**: `record_send_back_reason` GUC → `notify_on_kpi_status_change` trigger reads it → inserts `notifications` row with `type='manager_rejected'`. Reason also persisted as a pre-resolved `kpi_queries` row that the banner reads.

### Gaps found (severity-tagged, no code changes yet)

**G1 — Blocking · Final-Score immutability bypass on send-back**
`useSendBackKpi` (`src/hooks/useKpis.ts:1444-1541`) nulls `final_score`/`final_rating` and reverts `status` with **no check** for `status='approved'` or `final_score IS NOT NULL`. RLS policies on `kpis` for Manager (`20260205092952:1-13`), Auditor (`:16-22`), Skip-Level (`20260213173007:56-63`), HR PMS (`:70-73`) have **no `WITH CHECK` status guard**, so a send-back on an approved KPI silently strips the frozen final score. Violates POLICY §Final Score Governance & Immutability (`POLICY.md:1443`).

**G2 — Degraded UX · Non-atomic client-orchestrated send-back**
`useSendBackKpi` fires 5 sequential client calls (`record_send_back_reason` RPC → `review_submissions` update → `kpis` update → `kpi_queries` insert → `kpi_audit_logs` insert). A network drop between calls 2 and 3 leaves manager fields cleared but status stale, and no banner recorded — employee sees blanks with no explanation. Compare with the atomic `submit_self_review` RPC.

**G3 — Degraded UX · Silent notification loss**
`notify_on_kpi_status_change` (`20260722103645:43-56`, ADR-133) swallows `foreign_key_violation` / `insufficient_privilege` / `check_violation` with no log. If the insert silently drops, the employee only learns about the send-back if they proactively reopen the KPI. Not verified whether `send-email-notification` edge function reliably backs this up for `manager_rejected`.

**G4 — Cosmetic · "Sent back" is inferred, not stored**
`isSentBack = status==='kra_set' && submissionMap.has(id)` (`SelfReviewSheet.tsx:557`). Any other flow that reverts to `kra_set` (admin step-back, org-KPI rollback, kpi_rollback_requests) is indistinguishable from a manager send-back and the banner may show a stale unrelated `kpi_queries` row.

**G5 — Cosmetic · Mandatory reason enforced only client-side**
`SendBackDialog.tsx:172` disables submit on empty reason, but nothing in the DB rejects a `record_send_back_reason('')` + `kpis` UPDATE from a modified client / direct API call. POLICY §8.1 requires a mandatory reason.

**G6 — Scope mismatch · Management stage-restricted**
Management's `kpis` UPDATE policy (`20260205092952:24-32`) is gated to `status='management_review'` only. If product intent is that Management can send back from any stage (like Manager/Auditor), this is inconsistent. Confirm with product before acting.

### Not verified (would require runtime or extra tracing)

- Whether `is_period_locked()` hard-locks are actually consulted in `SelfReviewSheet` for the sent-back edit path (POLICY §3.6 says they should still block).
- Whether the `send-email-notification` edge function reliably fires for `manager_rejected` and how it handles failures.
- Concurrency safety of the `app.current_send_back_reason` GUC under simultaneous send-backs (transaction-local `set_config(..., true)` should be safe, not stress-tested).
- Real end-to-end user run — this is static review only.

### Recommended fixes (for your approval — nothing to implement yet)

Grouped by risk. Pick which to build; I'll return with a scoped implementation plan for each you approve.

| # | Fix | Addresses | Type |
|---|---|---|---|
| F1 | Add guard in `useSendBackKpi`: abort if `status='approved'` or `final_score IS NOT NULL`; show toast "Approved KPIs require a Rollback Request". | G1 (partial) | Code-only |
| F2 | Convert `useSendBackKpi` into a single `send_back_kpi(p_kpi_id, p_reason)` SECURITY DEFINER RPC (atomic; server-side reason non-empty check; server-side approved-KPI guard). | G1, G2, G5 | Migration + code |
| F3 | Instrument `notify_on_kpi_status_change` exception handler with `RAISE WARNING` (still non-blocking, but observable in Postgres logs). Optionally insert into a `notification_failures` audit table. | G3 | Migration |
| F4 | Add `sent_back_at timestamptz` + `sent_back_reason_query_id uuid` columns on `kpis`, populated by the new RPC; UI uses them instead of inferring. | G4 | Migration + code |
| F5 | Product decision on Management scope, then align RLS or leave as-is with a POLICY note. | G6 | Depends on decision |

### Ask before building

Which of F1–F5 should I plan and implement, and do you want F6 (verify `is_period_locked` interaction + `send-email-notification` reliability) as a follow-up audit?
