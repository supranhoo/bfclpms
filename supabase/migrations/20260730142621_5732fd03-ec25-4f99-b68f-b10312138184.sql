UPDATE public.app_settings
SET pms_policy_content = replace(
  pms_policy_content,
  '## 12. Performance Improvement Plans (PIP)

### 12.1 PIP Triggers

- Overall rating <2.5 for two consecutive periods
- Rating <2.0 in any single period
- Critical performance gaps identified by management
- Serious policy violations or misconduct

### 12.2 PIP Process

1. PIP Initiation (RM1 or HR recommends, Management approves)
2. PIP Development (Collaborative plan with specific gaps, objectives, milestones, duration 30-90 days)
3. PIP Execution (Ongoing coaching and feedback)
4. PIP Review (Successful, Partially Successful, Unsuccessful)
5. Post-PIP Action (Return to normal cycle or further action)

### 12.3 PIP Milestones

Each PIP includes 3-5 milestones with specific deliverables, target dates, expected outcomes, and status tracking.

### 12.4 PIP Rights and Protections

- Right to understand performance gaps
- Right to receive support and resources
- Right to appeal PIP decision
- Right to confidentiality

',
  '## 12. Performance Improvement Plans (PIP)

> This chapter is the approved PIP standard. Where the PIP policy draft is referenced elsewhere as "§15", the numbering maps one-to-one onto §12.1-§12.12 below.

### 12.1 Purpose and Principles

A PIP is a structured, time-bound, supportive intervention to close a demonstrated performance gap. It is developmental first and disciplinary only as a last resort. Every PIP must be objective (evidence based), fair (documented and acknowledged), supported (resources committed by the organization) and confidential.

### 12.2 Monthly Performance Trigger

An employee becomes a PIP candidate when the monthly performance score is **strictly below the configured PIP threshold in every month** of the evaluation window (default: the last 3 complete months). A month with no reviewed score disqualifies the trigger - the system never assumes a missing month is a failure.

Because monthly KRA review can lag by up to two months, the evaluation window is anchored to an administrator-selected "up to" month, so only fully reviewed periods are evaluated. The anchor changes the period evaluated, never the rule.

### 12.3 Annual Performance Trigger

An employee becomes a PIP candidate when the final annual review rating is **at or below** the configured annual PIP threshold on the 5-point scale.

### 12.4 Triggers Are Advisory

Triggers surface candidates only. No plan is ever created automatically. A named initiator (RM1, HR PMS or Management) must review the evidence and decide. Every plan records the trigger source and the evidence snapshot that produced it.

### 12.5 Initiation and Skip-Level Approval

1. Initiation - RM1 or HR PMS creates the plan from the surfaced evidence.
2. HR review - HR PMS validates completeness and fairness.
3. Skip-level (RM2) approval - mandatory before the plan can be activated. The initiator may not approve their own plan.
4. Activation - the plan becomes active and the monitoring cadence begins.

### 12.6 Mandatory Support and Resources

No plan may be activated without recording the specific support the organization commits to provide: coaching, training, mentoring, tooling, workload adjustment or reassignment of duties. A plan without documented support is not a valid PIP.

### 12.7 Duration, Areas and Checkpoint Cadence

- Duration must fall inside the configured minimum and maximum bounds (default 30-90 days).
- Improvement areas must be specific and measurable. Where the gap is KPI driven, the underperforming KPIs from the evaluation window are selected directly, so the plan cites the exact metric, period and score.
- Every milestone must fall inside the plan window, and no gap between checkpoints may exceed the configured cadence limit (default monthly).
- An employee may hold only one live plan at a time (draft, pending HR approval, active or extended).

### 12.8 Milestones and Monitoring

Each PIP carries 3-5 milestones with deliverables, target dates, expected outcomes and status (pending, met, partially met, not met). Progress reviews are logged against milestones; automated reminders are dispatched ahead of each checkpoint.

### 12.9 Employee Acknowledgement and Rights

The employee formally acknowledges the plan, and may record comments or disagreement without prejudice. Employees retain the right to understand the performance gap, to receive the committed support, to appeal the PIP decision under §14, to confidentiality, and to protection from retaliation.

### 12.10 Outcomes

At the end of the plan, one outcome is recorded: **Improved** (return to the normal cycle), **Not improved** (extension or escalation), or **Escalated** (referral to HR for further action). Extensions must be justified and re-approved.

### 12.11 Audit Trail

Every state change - creation, HR review, RM2 approval, acknowledgement, milestone update, extension, completion and termination - is written to an immutable PIP audit log with the acting user and timestamp.

### 12.12 Post-PIP Monitoring (Relapse Window)

A completed plan places the employee inside a configurable post-PIP monitoring window (default 3 months). A re-trigger inside that window is treated as a relapse and routes to review or escalation rather than to a fresh plan.

'
)
WHERE pms_policy_content LIKE '%### 12.4 PIP Rights and Protections%';