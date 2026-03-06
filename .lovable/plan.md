

# Plan: Scheduled Lock (Lock from a Specific Date)

## Current Gap
Today, the governance system supports only:
- **Immediate locking** — the Global Lock button locks the period right now
- **Deadline-based auto-rules** — lock after X days from stage start

There is no way to say "lock this period starting tomorrow at midnight" or any specific future date.

## Solution: Add a "Scheduled Lock" Feature

Add a new auto-rule type `scheduled_lock` that activates a global or role-level lock at a specific date/time set by the admin.

### How It Works

1. Admin adds a **"Scheduled Lock"** rule in the Auto Rules tab
2. Instead of "days from stage start", the admin picks a **specific date** (e.g., tomorrow's date) using a date picker
3. The `auto-lock-review-periods` edge function checks: if today >= scheduled date and rule is active, it activates the global lock and logs the event
4. Once triggered, the rule is marked as `executed` so it doesn't re-fire

### UI Changes

In `ReviewPeriodAutoRules.tsx`:
- Add `scheduled_lock` to `RULE_TYPES` with label "Scheduled Lock (Date-Based)"
- When this rule type is selected, show a **date picker** instead of the "days" input
- Store the target date in `trigger_condition.lock_date`
- In the rules table, display the scheduled date for this rule type

### Edge Function Changes

In `auto-lock-review-periods/index.ts`:
- Add a `scheduled_lock` case that compares `trigger_condition.lock_date` against the current date
- When triggered: upsert a global lock (same as the manual Global Lock toggle), log to audit, and mark the rule as executed (`is_active: false` or add an `executed_at` field)

### Files to Modify

| File | Change |
|------|--------|
| `src/components/admin/ReviewPeriodAutoRules.tsx` | Add `scheduled_lock` rule type with date picker UI |
| `supabase/functions/auto-lock-review-periods/index.ts` | Add scheduled lock execution logic |

### Risk Assessment
- **Data Impact**: None — uses existing lock infrastructure, just triggers it on a schedule
- **Regression Risk**: None — new rule type, no changes to existing rules
- **Reversibility**: Admin can delete the scheduled rule before it fires, or unlock manually after

