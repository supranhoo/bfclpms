

# Answers to Your Three Questions

## 1. Why is "Days" only for Self Review?

The deadline-based auto-lock is **hardcoded to the `self_review` stage only** in the edge function (`auto-lock-review-periods/index.ts`). Specifically, line 49:

```typescript
if (period.current_stage !== 'self_review') break;
```

It checks if the self-review stage has been active for more than X days, then creates a global lock. The other rule types (`manager_review_submitted`, `approval_complete`, `calibration_complete`) are **event-driven** (they trigger based on KPI status changes), not time-based, so they don't need a "days" input.

However, the concept of a deadline could logically apply to **any stage** (e.g., "lock manager review after 21 days"). This is a limitation of the current implementation. If you want, I can extend the deadline rule to support any stage, not just self-review.

---

## 2. What does "Lock employee after manager submits review" mean? Was this already in place?

**What it does:** When a manager finishes reviewing all of an employee's KPIs (all statuses move past `self_review` / `kra_set`), this rule creates a **governance lock** on that specific employee. This prevents the employee from editing their KPIs, re-submitting self-reviews, or making any changes after the manager has already reviewed them.

**Was this already in place?** **Partially, yes — but differently.** The existing workflow engine already prevents employees from editing KPIs once the status moves past `self_review` (status-based gating in the UI). What this governance rule adds is:
- A **formal lock record** in `review_period_locks` with explicit permissions
- **Audit trail** visibility in the governance center
- **Admin override** capability — an admin can manually unlock an employee if needed
- Works across the **governance permission hierarchy** (Employee > Dept > Role > Global)

So the workflow status gating was implicit; the governance lock makes it explicit, auditable, and overridable.

---

## 3. Does this Governance system impact existing RLS policies and Workflow policies?

**Short answer: No, it does not modify or replace them. It adds an additional layer on top.**

Here's how they coexist:

| Layer | What it controls | Still active? |
|-------|-----------------|---------------|
| **RLS Policies** | Database-level row access (who can SELECT/INSERT/UPDATE which rows) | Yes, unchanged |
| **Workflow Engine** | KPI status transitions (Self Review → Manager Check → Audit → Approved) | Yes, unchanged |
| **Governance (new)** | UI-level permission gating (can this user edit/submit/approve during this period?) | Added on top |

The governance system is enforced via the `useReviewPeriodPermissions` hook in **6 UI components** (SelfReviewSheet, EmployeeScorecard, ManagementScorecard, AuditScorecard, KpiHeaderSection, GovernanceLockBanner). It **disables buttons and shows lock banners** — it does not change database access rules or workflow transitions.

**Key point:** If governance says "locked" but RLS says "allowed," the user sees a locked UI but the database would still technically accept writes. The governance layer is a **business logic guard**, not a security guard. RLS remains the security boundary.

No plan needed — these are research/clarification questions only.

