

# Root Cause: `prevent_locked_period_updates` Trigger Lacks Bypass Exceptions

## Problem
Arun Goswami has **January 2026** KPIs at `kra_set` status that were **sent back** for resubmission. January 2026 has an **employee role lock** that explicitly sets `edit_kpi: false` and `submit_self_review: false`.

The **frontend** correctly bypasses governance for sent-back KPIs (line 512 of `SelfReviewSheet.tsx`):
```js
const isGovernanceLocked = !isSentBack && !isDailyUnlocked && (!govPerms.submit_self_review || govPerms.view_only);
```

But when the employee submits, the mutation calls `supabase.from('kpis').update({ status: 'self_review' })` (line 590 of `useKpis.ts`), which triggers `prevent_locked_period_updates`. This trigger **unconditionally** checks `edit_kpi` permission — which returns `false` for employees in January 2026 — and raises the exception.

**The database trigger has no bypass for sent-back or daily KPIs**, creating a mismatch between what the UI allows and what the database permits.

### Evidence
| Check | Result |
|---|---|
| Arun's January `kra_set` KPI IDs | `84ebc5e8`, `c254a0f8` |
| Prior submissions exist for those KPIs? | Yes (`kpi_status: open`, ratings reset) |
| `check_review_period_permission(Arun, January, 2026, 'edit_kpi')` | `false` |
| January role lock for `employee` | `is_locked: true`, `edit_kpi: false` |

## Fix — Database Migration

Update `prevent_locked_period_updates()` to add the same two bypass exceptions the frontend already implements:

1. **Sent-back KPIs**: If `OLD.status = 'kra_set'` AND `NEW.status = 'self_review'` AND a prior submission exists → allow
2. **Daily frequency KPIs**: If `NEW.frequency = 'Daily'` AND `OLD.status = 'kra_set'` AND `NEW.status = 'self_review'` → allow

```sql
CREATE OR REPLACE FUNCTION public.prevent_locked_period_updates()
RETURNS trigger ...
AS $$
DECLARE
  v_has_prior_submission boolean;
BEGIN
  -- Legacy lock
  IF public.is_period_locked(NEW.review_period, NEW.review_year) THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION '...';
    END IF;
  END IF;

  -- BYPASS: Daily KPIs at kra_set can transition to self_review
  IF NEW.frequency = 'Daily' AND OLD.status = 'kra_set' AND NEW.status = 'self_review' THEN
    RETURN NEW;
  END IF;

  -- BYPASS: Sent-back KPIs (kra_set with prior submission) can resubmit
  IF OLD.status = 'kra_set' AND NEW.status = 'self_review' THEN
    SELECT EXISTS(SELECT 1 FROM review_submissions WHERE kpi_id = NEW.id)
      INTO v_has_prior_submission;
    IF v_has_prior_submission THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Standard governance check
  IF NOT public.check_review_period_permission(auth.uid(), ..., 'edit_kpi') THEN
    RAISE EXCEPTION '...';
  END IF;

  RETURN NEW;
END;
$$
```

No frontend changes needed — the UI bypass logic is already correct.

## Risk Assessment
- **Data Impact**: No schema changes; only trigger logic update
- **Regression Risk**: Low — bypasses only apply to the specific `kra_set → self_review` transition, which is an employee submitting their review. All other KPI modifications remain governed.
- **Security**: Safe — these are the same policy exceptions already enforced in the frontend. Adding them to the trigger ensures consistency.
- **Policy Alignment**: Matches the documented governance bypass exceptions for sent-back and daily KPIs.

