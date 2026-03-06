

# Fix: Clarify Auto-Lock Rule Description

## Problem
The description "Lock self-review after 10 days" is ambiguous — it doesn't tell the admin *from when* the countdown begins.

## Current Behavior
The edge function (`auto-lock-review-periods`) calculates elapsed days from the `started_at` timestamp in the `review_period_stages` table for the `self_review` stage. So "10 days" means 10 days after the Self Review stage was activated.

## Fix
Update the description text in `ReviewPeriodAutoRules.tsx` to read:

> "Lock self-review after **10** days from **stage start date**"

This is a single-line UI text change in the inline description row.

## File Modified
- `src/components/admin/ReviewPeriodAutoRules.tsx` — update the description text for `deadline_passed` rule type

## No database, RLS, or logic changes needed
The underlying calculation is correct; this is a label clarity fix only.

