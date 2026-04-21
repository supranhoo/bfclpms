

## RCA — Why "Org KPI Data Entry" shows 10 but the report shows 21+

### Both numbers are correct. They count different things.

| View | Unit | Count for Biswajit (March 2026) |
|---|---|---|
| Org KPI Data Entry page | **Distinct KPI cards** (category + KRA + KPI). One card per KPI definition, regardless of how many employees it's assigned to. | **10** |
| KPI Scorecard Detail report | **Per-employee KPI rows**. One row for every (employee × KPI) assignment. | **21** |

### Math checks out
The 21 rows in the user's export collapse to 10 unique KPIs:

| KPI | Rows in report | Card on Org KPI page |
|---|---|---|
| Compliance to TAT for In-bound vehicles (12 hrs) | 4 (Anant, Bhoopendra, Jitendra, Rakesh) | 1 |
| Compliance to TAT for In-bound vehicles (6 hrs) | 1 (Sajid) | 1 |
| Refractory life - Campaign life tonnage wise | 4 (Anant, Anil, Umesh, Vidhan) | 1 |
| Pending metal for jigging Inventory below 5T | 1 (Anant) | 1 |
| Raw Material Plan & Other MIS (Monthly) | 3 (Bhoopendra, Ramchandra, Subhransu) | 1 |
| Raw Material Plan & Other MIS (Daily) | 1 (Jyoti) | 1 |
| Consumable cost | 1 (Jitendra) | 1 |
| Ensure target availability of furnace and all associated equipment | 1 (Mandala) | 1 |
| Handle all breakdowns and minimize downtime | 5 (Mandala, Monu, Prabhat, Sanjay, Sushanta) | 1 |
| **Total** | **21** | **10** |

DB confirms: 10 distinct (category, kra, kpi) tuples are pending; those tuples have 21 underlying `kpis` rows in `kra_set` status.

### Why the design works this way
- **Data Entry page is action-oriented**: "How many KPIs do I, the data owner, need to enter a value for?" The owner enters one value per KPI; propagation distributes it to all assigned employees. So one card = one action.
- **Scorecard Detail report is workflow-oriented**: "Which employee × KPI combinations are still pending review?" Each employee owns the next-stage workflow action, so each is listed.

### What's NOT happening
- No half-propagation (verified — the prior v2.65.6 forward-guard and the data-repair tool already addressed those for March 2026).
- No data desync between `org_kpi_values` and `kpis.status`.
- No filter mismatch in either view.

### The real issue
This is a **UX clarity problem**, not a code bug. Users naturally expect "Pending: 10" and "21 rows in report" to be the same number. The page does not currently disclose that the count is "KPIs to enter" vs "employee assignments."

---

## Plan — single small UI clarification, no logic change

### Single change
In `src/pages/admin/OrgKpiDataEntry.tsx`, update the "Pending" stat tile (and the Pending Report subtitle) to show **both numerators**:

> **10 KPIs pending** (covering 21 employee assignments)

Implementation:
- Add a one-liner derived count from the existing `pendingReportRows` (already computed in the component) — count of distinct `(category_id, kra_name, kpi_name)` vs total row count.
- Render as small caption text under the existing "Pending" badge / count.
- Mirror the same dual-count caption in `OrgKpiPendingReport` header (e.g. "21 employee assignments across 10 KPIs").

That's it. Pure presentational, ~10 lines.

### Files touched
| File | Change |
|---|---|
| `src/pages/admin/OrgKpiDataEntry.tsx` | Compute `distinctPendingKpis` from existing `pendingReportRows`; render dual-count caption. |
| `src/components/admin/OrgKpiPendingReport.tsx` | Show "X assignments across Y KPIs" subtitle. |
| `DOCUMENTATION.md` | v2.65.7 — UI clarification: dual-count display on Org KPI Data Entry. |

### Out of scope
- No DB query changes. Data is already correct.
- No changes to KPI Scorecard Detail report.
- No new endpoints.
- No data repair (none needed).

### Risk & Impact
- **Data:** none.
- **Workflow:** none.
- **UI/UX:** purely additive caption. No layout reflow risk beyond one extra line of small text.
- **Regression risk:** zero — read-only derivation from already-rendered data.

### Why this is the simplest correct fix
Both numbers are right. The only thing missing is telling the user that "10" and "21" measure different things. One caption resolves it without touching any logic.

