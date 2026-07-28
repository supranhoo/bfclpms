## Assumptions

- The mail in the screenshot is the `final_approved` ("Your KPI Has Been Finalized") notification email sent by the `send-email-notification` function.
- Jaspal's KPIs were genuinely approved with a score; the score is missing only in the email, not in the app.

## Verified current state

1. **Backend URL leak** — `sendViaSmtp` / `sendViaResend` send an **HTML-only** message (no plain-text alternative, no preheader). The first thing in the HTML `<body>` is the branding logo `<img src="https://<backend>.supabase.co/storage/v1/object/public/branding-as...">`, so the mail client builds its snippet line from that raw URL. That is exactly the string shown in the screenshot.
2. **Score: N/A/5** — the DB trigger `public.send_email_on_notification()` builds the payload for `send-email-notification` and **never includes `final_score`**. In the edge function (lines ~1487-1500), `final_score == null` → `'N/A'` for both `{{final_score}}` and `{{score_label}}`. So *every* finalized email shows `Score: N/A/5`, for all employees — not just Jaspal. The score itself lives in `review_submissions.final_score` (with `is_na` flag) keyed by `kpi_id`; a resolver `fn_resolve_final_score` already exists.

Neither issue affects stored data or the app UI — both are email-render defects.

## Risk & impact

- **Data impact:** none. No schema change; only one trigger function body is replaced (`CREATE OR REPLACE`) and one edge function is edited.
- **Workflow impact:** none. Notification rows, RLS, and dispatch conditions stay identical.
- **UI impact:** none in-app. Email preview line and subject change.
- **Regression risk:** the trigger is shared by *all* notification types — the added lookup must be strictly additive and wrapped so a failure can never block the notification insert (the existing body already has an EXCEPTION guard around dispatch; the new lookup gets its own guard).
- **Rollback:** re-apply the previous version of `send_email_on_notification()` (migration `20260706080545_...`) and revert the edge function file.

## Fix plan

### Step 1 — Stop the backend URL from becoming the preview text (edge function)

In `supabase/functions/send-email-notification/index.ts`:

- Add a **hidden preheader** as the first element inside `<body>` in `buildEmailHtml()`: a `display:none;max-height:0;overflow:hidden` span containing a short human summary (e.g. the first meaningful line of the body / event title). Mail clients use this for the snippet instead of the image URL.
- Add a **plain-text alternative** (`text:`) to both `sendViaSmtp` and `sendViaResend`, generated from the already-available `bodyContent` (no logo, no storage URL). This also improves deliverability and accessibility.
- The logo image itself stays as-is (still rendered inside the email); only its URL stops leaking into the snippet.

Verification: send a test email from System Settings → Email and confirm the snippet shows the summary line, not a URL.

### Step 2 — Send the real final score (DB trigger, additive)

New migration replacing `public.send_email_on_notification()` with a version that, **only when `mapped_event_type = 'final_approved'` and `NEW.kpi_id IS NOT NULL`**, looks up the score:

```
SELECT rs.final_score, rs.is_na INTO v_final_score, v_is_na
FROM review_submissions rs WHERE rs.kpi_id = NEW.kpi_id
ORDER BY rs.updated_at DESC NULLS LAST LIMIT 1;
```

and adds `'final_score', v_final_score` plus `'is_na', v_is_na` to the JSON payload. Everything else in the function stays byte-identical. If `NEW.metadata->>'final_score'` is already present, that wins (future producers can pass it explicitly).

### Step 3 — Make the email honest when there is no score (edge function)

In the `final_approved` block:

- If a numeric score exists → `Score: 4.2/5` and the matching label, as today.
- If the KPI is **N/A** → subject/body say "Marked Not Applicable" instead of `N/A/5`.
- If the score is genuinely unresolved → drop the `— Score: …` clause from the subject entirely rather than printing `N/A/5`, and omit the score line in the body.

This guarantees the misleading `N/A/5` string can never be sent again, even if the payload lookup fails.

### Step 4 — Tests + docs

- Unit tests for the new subject/score-formatting helper (numeric, N/A KPI, missing score) and for preheader/plain-text presence in `buildEmailHtml`.
- Update `DOCUMENTATION.md` and `POLICY.md` with **ADR-191 / POLICY §EMAIL-SCORE-AND-PREHEADER**: (a) every outbound email must have a plain-text part and a preheader; no backend/storage URL may be the first visible content; (b) score placeholders must resolve from the submission record and must be omitted rather than rendered as `N/A` when unresolved.

### Optional follow-up (not in this change)

Serve the branding logo from the app's custom domain (`pms.bfclalloys.com`) instead of the backend storage host, so the URL never appears at all even in "view source". Say the word and I'll fold it in.

## What stays untouched

Notification creation, guards (`can_send_notification_to`), RLS, email queue/scheduler, all other event templates, and the app UI.
