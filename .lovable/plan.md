
## RCA: "No pendency outside" but "4 in self_review pending for audit" inside

### Root cause — confirmed from data + code

Arun Goswami's KPIs in DB:
- **April 2026**: 13 KPIs, all at `kra_set` (not yet submitted)
- **March 2026**: **4 KPIs at `self_review`** ← these are the 4 the auditor sees inside

Two different counting rules produce the discrepancy:

**1. Outside (Audit Panel grid card)** — `EmployeeSelectorGrid.tsx` lines 503–508:
```ts
if (k.status === 'audit') inAudit++;
else if (['management_review','approved'].includes(k.status)) forwarded++;
else if (auditReviewable.includes(k.status) && k.status !== 'audit') pending++;
```
But the grid is **filtered by `selectedPeriod` / `selectedYear`** (the ReviewPeriodSelector at the top of the page). When the auditor is viewing **April 2026**, Arun's only April KPIs are at `kra_set` → counted as 0 pending. So his card shows "no pendency".

**2. Inside (AuditScorecard.tsx) at lines 261–262**:
```ts
const auditPendingStatuses = resolvePendingStatuses('auditor', stages);
// returns ['self_review', 'audit'] when audit stage exists with manager_check before
const pendingAuditCount = kpis?.filter(k => auditPendingStatuses.includes(k.status)).length;
```
The scorecard pulls KPIs across periods (or specifically the period where data exists), and `self_review` is in the auditor's pending status list — so the 4 March KPIs at `self_review` show as "Pending: 4".

Per `mem://features/review/smart-period-detection-workflow`, the inside view auto-switches to the **most relevant active period** when opened — that's why it lands on March (where Arun has live KPIs) instead of April (where he's at `kra_set`).

### Why this happens (working as designed, but confusing UX)

| Layer | Period scope | Status counted | Result |
|---|---|---|---|
| Outside grid card | Strict to selected period (April) | All April KPIs at `kra_set` | 0 pending |
| Inside scorecard | Smart-detects to March | 4 KPIs at `self_review` | 4 pending |

Both are **technically correct** for their respective period scope. The auditor is seeing a period mismatch:
- They selected **April 2026** in the panel filter
- Smart Period Detection inside the scorecard switched to **March 2026** because that's where Arun has unfinished work
- The "Pending: 4" badge inside refers to **March**, not April

### The actual UX bug

The outside card and the inside scorecard show counts for **different periods** without telling the auditor. There is no visible indicator on the inside that the period was auto-switched.

### Proposed fix (Option A — minimal, recommended)

In `AuditScorecard.tsx` (and Manager/HR/Management scorecards using smart period detection), show a **clear period banner** when the displayed period differs from the panel-selected period:

> "Showing March 2026 (auto-switched — KPIs found here). Selected period: April 2026 has no pending audit work."

Add a small dismissible alert at the top of the scorecard, plus the period chip already present.

### Proposed fix (Option B — stricter)

Make the outside grid card respect the same Smart Period Detection so the count and the inside view always agree. Higher impact because the outside grid would no longer be a strict period filter — could surprise users who DO want to see only April.

### Risk & Impact (Option A — recommended)

| Area | Impact |
|---|---|
| Data | None |
| Workflow | None |
| UI | One inline banner in the 4 reviewer scorecards (Audit, Manager, HR PMS, Management) |
| Regression | Negligible — purely informational |
| Mitigation | Read existing `selectedPeriod` (panel) vs `effectivePeriod` (auto-switched) from existing hooks; show banner only when they differ |

### Files Touched (Option A)
- `src/components/review/AuditScorecard.tsx` — add period-mismatch banner
- `src/components/review/ManagerScorecard.tsx`, `HrPmsScorecard.tsx`, `ManagementScorecard.tsx` — same banner for consistency
- `DOCUMENTATION.md` — Version History note
- Memory: append a one-line note to `mem://features/review/smart-period-detection-workflow` about the visible disclosure

### Out of Scope
- Changing Smart Period Detection itself
- Changing the outside grid's strict period filter
- Any DB / RLS work
