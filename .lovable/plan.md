
## Phase 3B — Data Governance Overview (read-only summary, no enforcement)

Phase 3A shipped 6 metadata registries (classifications, sensitive fields, export policies, audit policies, retention policies, privacy/consent). They are useful only if the platform_owner can see them holistically. Phase 3B adds a **single read-only Overview sub-tab** that surfaces coverage and last-changed signals across all six registries — no new tables, no enforcement, no behavior change.

### Assumptions
- First sub-tab in `DataGovernanceTab.tsx` (rename current order: Overview → Classifications → Sensitive Fields → Export Policies → Audit Policies → Retention → Privacy/Consent).
- Platform_owner only writes; authenticated reads (same as the 6 registries).
- Pure read-only aggregation; no scheduled jobs, no exports yet.

### Risk & Impact
- **Data**: zero schema changes. Pure SELECTs against existing tables.
- **Workflow / reports / backup / RLS**: zero impact.
- **Regression**: negligible — isolated sub-tab.
- **Scalability**: ≤ a few hundred rows total across registries; one paginated query per card is unnecessary. Use simple `select count` + last `updated_at` per registry.
- **Rollback**: remove sub-tab and helper hook.

### UI — new `OverviewSubTab` in `DataGovernanceTab.tsx`
1. **Header banner** (reuse existing "Config only — not enforced yet" tone).
2. **6 KPI cards** (one per registry):
   - Title (e.g. "Sensitive Fields")
   - Total rows · Active rows · Inactive rows
   - Last updated (relative timestamp, from `max(updated_at)`)
   - "Manage →" link that selects the matching sub-tab via existing `Tabs` state.
3. **Coverage strip** (1 row, plain text, no charts):
   - `Classifications by level` — counts grouped by `classification_level` (e.g. public/internal/confidential/restricted).
   - `Sensitive fields by category` — counts grouped by `category` (or whichever column exists; fall back to `module_key`).
   - `Export policies by purge strategy` / `Retention by purge_strategy` — counts grouped by `purge_strategy`.
   - `Audit policies by retention bucket` — counts grouped by coarse bucket (≤90d / ≤1y / >1y / forever).
   - `Privacy/Consent by lawful_basis` — counts grouped by `lawful_basis`.
4. **Recent changes** (last 10 rows from `entitlement_audit` where `entity_type IN ('data_classification','sensitive_field','export_policy','audit_policy','retention_policy','privacy_consent_setting')`): timestamp · actor · event_type · entity_type · entity_key · reason. Click row → open relevant sub-tab.

All cards/strips show a skeleton while React Query loads; empty registries render "No entries yet — go to <tab> to add one."

### Data fetching
- One React Query key: `['data-governance', 'overview']`.
- Single fetch function that runs 6 `select id,is_active,updated_at` + 6 `select <group_col>` queries in parallel via `Promise.all`. Total ≤ 12 small queries, all already RLS-allowed.
- Audit list: one query `from('entitlement_audit').select(...).in('entity_type', [...]).order('created_at', desc).limit(10)`.
- 60s `staleTime` (matches other governance tabs).

### Code
- New file `src/components/platform/DataGovernanceOverviewSubTab.tsx`.
- Edit `src/components/platform/DataGovernanceTab.tsx` to:
  - Add `<TabsTrigger value="overview">Overview</TabsTrigger>` as the first trigger.
  - Default `value="overview"` on the inner `<Tabs>`.
  - Pass a `setActiveTab(tabId)` setter into the overview so "Manage →" links work.
- Reuse existing `card`, `badge`, `table`, `skeleton`, and `formatDistanceToNow` patterns from the audit tab.

### Audit
- Read-only — no writes to `entitlement_audit`. (Existing `admin_view` events for the registry tabs remain unchanged.)

### Out of scope
- No charts library work (no Recharts); pure text/badge layout to stay light.
- No CSV export of the overview (registries already export inside their own tabs).
- No new enforcement, no new wrap, no new menu entry, no RLS / schema / role changes.
- No PMS / safety / incentive / reports surface change.

### Files
- New: `src/components/platform/DataGovernanceOverviewSubTab.tsx`
- Edited: `src/components/platform/DataGovernanceTab.tsx`, `CHANGELOG_2026.md`, `.lovable/plan.md`

### Verification
- `platformFoundation` smoke 12/12 still pass.
- Manual on Platform Settings → Data Governance:
  - Overview loads with 6 cards, counts match the per-tab tables.
  - Toggling a registry row's `is_active` and reloading flips the Active/Inactive counts.
  - "Recent changes" lists the latest audit rows; clicking a row jumps to the right tab.
  - Non-platform_owner can still read (no privilege escalation).
- No new console warnings.
- No diff in any non-Data-Governance file.

Ready to implement on approval. Say "next" to ship Phase 3B.
