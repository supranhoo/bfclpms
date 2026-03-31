

## Plan: Org KPI Audit Review Page

### Concept

A new admin/auditor page at `/admin/org-kpi-audit-review` that mirrors the "Organization KPI Data Entry" layout but is focused on **audit-stage org-level KPIs**. Instead of entering achieved values, auditors review and approve org KPIs that have reached the audit stage per their workflow. Approving advances the KPI to the next workflow stage.

### What It Shows

Only org-level KPIs (`is_org_level = true`) where **at least one employee's instance** has reached the audit stage (status matching the auditor's reviewable statuses — typically `manager_check`). Grouped by org KPI definition (category + KRA + KPI name), with employee-level detail expandable per card.

### UI Layout

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Org KPI Audit Review                                                │
│ Review and approve organization KPIs at the audit stage             │
├──────────────────────────────────────────────────────────────────────┤
│ Month: [January ▼]  Year: [2026 ▼]  Search: [___________]          │
│                                                                      │
│ Category: [All] [Operations] [Quality] [Safety]                     │
│                                                                      │
│ Status: [All (24)] [Pending Audit (18)] [Audited (6)]               │
├──────────────────────────────────────────────────────────────────────┤
│ Progress: ████████████░░░░░░░  18/24 pending · 6/24 audited        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ ┌── Category: Operations ─────────────────────────────────────────┐ │
│ │                                                                  │ │
│ │ ┌─ KRA: Production │ KPI: Monthly Output ────────────────────┐ │ │
│ │ │ Target: 5000  │ UOM: Units  │ Achieved: 4800 (propagated)  │ │ │
│ │ │ Employees at audit: 12/15                                   │ │ │
│ │ │                                                              │ │ │
│ │ │ Employee        │ Self │ Mgr  │ Auditor │ Status  │ Action  │ │ │
│ │ │ ────────────────┼──────┼──────┼─────────┼─────────┼──────── │ │ │
│ │ │ Jaspal Singh    │ 4.2  │ 4.0  │ [___]   │ Pending │ [Save]  │ │ │
│ │ │ Ravi Kumar      │ 3.8  │ 3.5  │ [___]   │ Pending │ [Save]  │ │ │
│ │ │ Amit Verma      │ 4.5  │ 4.3  │ 4.0     │ Audited │  ✓      │ │ │
│ │ │                                                              │ │ │
│ │ │ [Bulk Approve All] [Enter Score & Forward: ___]              │ │ │
│ │ └──────────────────────────────────────────────────────────────┘ │ │
│ └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### Key Features

1. **Month/Year filter** — same `ReviewPeriodSelector` as Data Entry
2. **Search** — filter by KPI name, KRA name, or category
3. **Category pills** — filter by category with counts
4. **Status filter** — All / Pending Audit / Audited (approved past audit)
5. **Progress bar** — shows audit completion percentage
6. **Card-based layout** — grouped by category, one card per org KPI definition
7. **Employee grid per card** — shows each employee mapped to this org KPI whose workflow includes audit and KPI has reached audit-reviewable status
8. **Bulk approve** — enter a single auditor score and apply to all pending employees in one org KPI card
9. **Inline scoring** — enter auditor score + remarks per employee row
10. **Achieved value display** — show the propagated org KPI achieved value on each card
11. **Audit trail** — show who approved and when via tooltips

### Additional Suggestions (included in plan)

- **Org KPI consistency indicator**: Badge showing if all employees under one org KPI have the same score (consistency check)
- **Score distribution mini-chart**: Small bar showing score spread across employees for each org KPI
- **Export to Excel**: Download audit status report
- **Observation count badge**: Show pending observations per org KPI (reuse existing hook)

### Database Changes

**None** — this page reads from existing `kpis`, `review_submissions`, and `profiles` tables. Audit scores are written to `review_submissions` using the same mutation pattern as `AuditScorecard.tsx`.

### Code Changes

| File | Change |
|------|--------|
| `src/pages/admin/OrgKpiAuditReview.tsx` | New page — filters, cards, employee grids, bulk approve |
| `src/hooks/useOrgKpiAuditReview.ts` | New hook — fetch org-level KPIs at audit stage with employee details, scores, workflows |
| `src/components/admin/OrgKpiAuditCard.tsx` | New component — card per org KPI with employee grid, inline scoring, bulk approve |
| `src/App.tsx` | Add route `/admin/org-kpi-audit-review` |
| `src/components/layout/AppSidebar.tsx` | Add menu item under audit section + admin section |
| `DOCUMENTATION.md` | v2.15.22 |
| `POLICY.md` | §43 — Org KPI audit review governance |

### Technical Approach

1. **Hook (`useOrgKpiAuditReview`)**: Fetches all org-level KPIs for the period, then for each unique org KPI definition, fetches employee instances. Resolves each employee's workflow to determine if audit stage exists and if KPI has reached it. Returns structured data grouped by category.

2. **Scoring**: Reuses the same `review_submissions` upsert pattern from `AuditScorecard.tsx` — writes `auditor_score`, `auditor_rating`, advances status to next workflow stage via `resolveForwardStatus`.

3. **Bulk approve**: Applies a single score to all pending employees under one org KPI card in a single transaction loop.

4. **Access**: Available to `auditor` and `admin` roles.

### Risk Assessment
- **Regression**: Zero — new page, no modifications to existing components
- **Data**: Read/write to existing tables using established patterns
- **Performance**: One query for org KPIs + batch query for employee instances per period (cached by React Query)

