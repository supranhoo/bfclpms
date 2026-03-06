

# Plan: Review Period Governance Explainer Page

## What to Build

A dedicated, static explainer page at `/admin/governance-explainer` that serves as a comprehensive guide for the Review Period Governance system. This will be a well-structured, visually rich documentation page accessible from the Review Periods admin page.

## Approach

Create a single new page component that explains the governance system using cards, diagrams, and structured content sections. No database changes needed — this is purely a UI/informational page.

## Content Sections

1. **Overview** — What governance is and why it exists
2. **Lifecycle Stages** — Visual pipeline (Planning → Self Review → Manager Review → Calibration → Approval → Closed) with descriptions of each stage
3. **Lock Hierarchy** — Employee > Department > Role > Global, explaining override behavior
4. **Permission Types** — Table explaining all 7 permissions (Edit KPI, Self Review, Manager Review, Approve, Edit Scores, Comments, View Only)
5. **Auto-Lock Rules** — How deadline-based and event-based auto-locking works
6. **Audit Trail** — What gets logged and why
7. **FAQ** — Common questions (e.g., "What happens when a period is closed?", "Can I unlock a single employee?")

## Files

### New Files
- `src/pages/admin/GovernanceExplainer.tsx` — The explainer page with accordion-based sections, visual stage pipeline, hierarchy diagram, and permission reference table

### Modified Files
- `src/App.tsx` — Add route `/admin/governance-explainer`
- `src/pages/admin/ReviewPeriods.tsx` — Add a "Help / Explainer" button linking to the explainer page
- `src/components/layout/AppSidebar.tsx` — No sidebar entry needed (accessed via Review Periods page button)

## Design
- Uses existing UI components: Card, Accordion, Badge, Table, Alert
- Consistent with the admin page styling
- No external dependencies needed

