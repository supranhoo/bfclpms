

## Update Disregard Notice Text in Monthly Review Reminder Email

### Change
Update the disregard line in the `monthly_review_reminder` email template from:
> "If you have already completed your review, please disregard this reminder."

To:
> "If you have already completed your review and team's review (if applicable), please disregard this reminder."

### Files
1. `supabase/functions/send-email-notification/index.ts` — update the template string for `monthly_review_reminder`
2. `DOCUMENTATION.md` — version history
3. `POLICY.md` — version history

### Risk Assessment
- Zero risk — single string change in email template

