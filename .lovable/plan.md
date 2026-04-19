
## Add final approved score to "KPI finalised" email

### Context (from screenshot + memory)
The user received a "Congratulations! Your KPI has received final approval" email but it lists only KRA / KPI / Description / Formula / Scoring Logic — **no final score**. Per `mem://architecture/workflow-engine-notification-triggers`, the `notify_on_kpi_status_change` DB trigger fires `kpi_finalized` notifications on terminal transitions, and `mem://architecture/notification-and-dispatch-engine` handles email dispatch via templates.

### Investigation needed at edit time
1. Locate the `kpi_finalized` email template (likely `supabase/functions/_shared/email-templates/kpi_finalized.*` or in `send-email-notification` edge function).
2. Locate the trigger / dispatcher that builds the payload (`notify_on_kpi_status_change` DB trigger + `send-email-notification` edge function) — confirm whether `final_score` is already in the payload or needs to be joined from `review_submissions`.
3. Per `mem://architecture/pms/universal-scoring-logic`, use the 8-stage fallback chain — but for finalised KPIs the value is `final_score` (immutable, per `mem://features/review/final-score-governance-and-immutability`). Show that.

### Change
**Email template** — add a clearly highlighted score line right after the "Congratulations" sentence:

```text
Hi Jaspal,

Congratulations! Your KPI has received final approval and is now complete.

✅ Final Approved Score: 4.5 / 5    ← NEW (bold, brand-colored)

KRA: Development of New Policies
KPI: Create and update HR policies
...
```

Format: `Final Approved Score: {final_score} / {max_score}` where `max_score` defaults to 5 (KPI scale). If `final_score` is null (rare edge case for N/A-finalised KPIs per `mem://features/review/na-status-governance`), show "Marked Not Applicable" instead of a number.

**Payload** — extend the dispatch payload to include `final_score` (and `max_score` if not already 5). Source: `review_submissions.final_score` for the finalised KPI row. Fetch in the edge function (or expand the trigger's NEW.payload JSON if it builds the body server-side).

**In-app notification** — mirror the same line in the in-app `kpi_finalized` notification message for parity (single-line: "Final score: 4.5/5").

### Files Touched (confirmed at edit time)
- `supabase/functions/send-email-notification/_templates/kpi_finalized.tsx` (or equivalent React Email file) — add score row
- `supabase/functions/send-email-notification/index.ts` — pass `final_score` + `max_score` into template props; fetch from `review_submissions` if not in payload
- DB migration ONLY if the `notify_on_kpi_status_change` trigger needs to enrich its JSON payload with `final_score` (preferred: do it in the edge function, no migration)
- `src/lib/notifications.ts` (or wherever the in-app `kpi_finalized` message string is built) — append score to message
- `DOCUMENTATION.md` Version History + memory note in `mem://architecture/workflow-engine-notification-triggers`

### Risk & Impact
| Area | Impact |
|---|---|
| Data | None. Read-only enrichment of an existing payload. |
| Workflow | None. Notification trigger logic untouched. |
| UI/UX | Email + in-app notification become more useful — recipient sees the score without opening the app. |
| Regression | Very low. Only the email body and one notification message string change. Null-safe fallback for N/A KPIs. |
| Mitigation | Null-guard `final_score` (show "Not Applicable" when null). Re-test by triggering one finalisation and inspecting both the email and the in-app notification. |

### Out of Scope
- Showing every stage's score (self/manager/auditor/etc.) — only the final, immutable score.
- Restyling the email template beyond adding the score row.
- Changing how non-finalised notifications (queries, send-back, etc.) are formatted.
