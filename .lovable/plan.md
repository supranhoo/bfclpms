

## Plan: Redesign Org KPI Audit Review (Data Entry Style + Collapsible)

### Problem
Current audit cards are compact and don't show enough KPI detail. User wants them to match the Org KPI Data Entry layout but **with collapsible capability** — cards can be expanded/collapsed individually.

### Changes

**`src/components/admin/OrgKpiAuditCard.tsx`** — Redesign:
1. Keep `Collapsible` wrapper but **default to expanded** (`defaultOpen={true}`)
2. Redesign the trigger/header to show KPI metadata prominently (name, description, formula, scoring logic, KRA, target, UOM, status badges) — matching `OrgKpiEntryCard` style
3. Collapsible content = employee table grouped by department, with columns: Employee, Target, Self, Manager, Auditor Score input, Remarks, Status, Action
4. Add "Fill value" / "Fill empty" bulk input for auditor score
5. Remove `w-full` from table, tighten padding per previous approved plan
6. Keep bulk approve section at bottom of collapsible content

**`src/hooks/useOrgKpiAuditReview.ts`** — Add fields:
- Fetch `criteria` (description/formula) from KPI record
- Add `departmentName`, `designationName` to `OrgKpiAuditEmployee` via profile joins

**`src/pages/admin/OrgKpiAuditReview.tsx`** — Minor:
- Remove category sub-headers (cards are self-descriptive with category color border)
- Keep filters and progress bar

### Visual Layout

```text
┌─ Collapsible Card (default: expanded) ──────────────────────────┐
│ ▾ Adherence to Electrical Maintenance Budget    [◎ 2 Pending]   │
│   Description: Measures the variance between...                  │
│   Formula: (Actual / Budgeted) * 100                             │
│   KRA: Adherence to Monthly Budget  Target: 90  UOM: %          │
│ ┌───────────────────────────────────────────────────────────────┐│
│ │ 🏢 45 MW-Elect (1 employee)                                  ││
│ │ Employee        │Tgt│Self│Mgr│Auditor│Remark│Status│Action   ││
│ │ Sanjeeb K. Jena │90 │4.0 │4.0│[___] │[____]│ ●    │[Approve]││
│ └───────────────────────────────────────────────────────────────┘│
│ ─── Bulk Approve (2 pending) ───                                 │
└──────────────────────────────────────────────────────────────────┘

┌─ Collapsed Card ────────────────────────────────────────────────┐
│ ▸ Safety Compliance Index               [✓ All Audited]         │
│   KRA: Safety & Environment  Target: 95  UOM: %                │
└─────────────────────────────────────────────────────────────────┘
```

### Files Modified

| File | Change |
|------|--------|
| `src/components/admin/OrgKpiAuditCard.tsx` | Redesign with collapsible (default open), KPI metadata, dept-grouped employees, bulk fill, compact table |
| `src/hooks/useOrgKpiAuditReview.ts` | Add criteria, department, designation to query |
| `src/pages/admin/OrgKpiAuditReview.tsx` | Remove category sub-headers |
| `DOCUMENTATION.md` | v2.15.27 |

### Risk Assessment
- **Regression**: Low — UI redesign of existing card; hook changes are additive
- **Data**: No schema changes
- **Performance**: One extra join for department/designation (minimal)

