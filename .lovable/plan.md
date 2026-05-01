## Problem

When clicking **Approve as Canonical** on the Build Registry tab, the system errors with:

> duplicate key value violates unique constraint "kpi_definitions_canonical_kra_name_canonical_kpi_name_..."

### Root cause

`useBuildRegistry.createDefinitionWithAliases` always does a blind `INSERT` into `kpi_definitions`. If a definition with the same canonical KRA + KPI name already exists (e.g., from a prior approval, a registry import, or a Phase 4c merge/split), the unique constraint trips and the whole operation fails — including the alias linking that the user actually wanted.

The Duplicate Scanner also still surfaces groups even when a matching canonical definition already exists, because it scans raw KPI rows, not the registry. That makes collisions likely on a re-scan.

## Fix

Make the "Approve as Canonical" flow idempotent: reuse an existing definition if one matches, and only insert aliases that aren't already linked.

### 1. Hook: `src/hooks/useKpiRegistry.ts` — `useBuildRegistry`

Replace the blind insert with a lookup-then-insert pattern:

1. **Find existing definition** by `(canonical_kra_name, canonical_kpi_name)` — case-insensitive trim match. If found, reuse its id.
2. **Insert** only when no match exists.
3. **Fetch existing aliases** for the resolved `definition_id` and skip variants already linked (compare on normalized `variant_kra_name` + `variant_kpi_name` + `category_id`). Also de-duplicate within the incoming variant list itself.
4. **Insert remaining aliases** in one batch. If the alias unique constraint still trips on a race, swallow `23505` and continue.
5. **Toast accurately**: "Linked to existing canonical entry" when reusing, "Registry entry created" when new. Show count of aliases newly linked vs. already present.

### 2. UI: `src/components/admin/kpi-standardization/BuildRegistryTab.tsx`

- On success (whether new or reused), keep the current behaviour of marking the group as processed.
- No structural changes — the dialog is already gated on `saving`.

### 3. Friendly error fallback

If any error other than the duplicate-definition case bubbles up, surface the original Postgres message via toast (current behaviour). Strip the noisy `"kpi_definitions_canonical_kra_name_canonical_kpi_..."` constraint name and replace with: *"A canonical entry with this KRA + KPI name already exists. Linking aliases instead..."* — but this path should now be unreachable because of step 1.

### 4. Tests

Add `src/hooks/useBuildRegistry.test.ts` covering:

- Definition does not exist → inserts row + all aliases.
- Definition exists, no aliases overlap → reuses id, inserts all aliases.
- Definition exists, some aliases already linked → reuses id, inserts only the missing aliases.
- Variant list contains internal duplicates → de-duped before insert.

### 5. Documentation & memory

- `DOCUMENTATION.md` — update the KPI Standardization section to note the idempotent "Approve as Canonical" behaviour.
- `POLICY.md` — add a line under KPI Standardization: *Registry mutations must be idempotent; re-approving an already-canonical group MUST link missing aliases without error.*
- `mem://features/admin/kpi-standardization-registry` — append the idempotency rule.

## Risk & Impact

- **Data**: Read-then-insert pattern; no schema change, no backfill. Safe on existing data.
- **Workflow**: Only affects the Build Registry approval flow. No change to Correct May KPIs, Governance, Health, or Suggestions tabs.
- **UI/UX**: Same buttons and screens; only toast wording changes.
- **Regression**: Low. Mitigated by 4 unit tests and existing duplicate-detection tests in `useRegistryBrowser.test.ts`.

## Files to change

- `src/hooks/useKpiRegistry.ts` (modify `useBuildRegistry`)
- `src/hooks/useBuildRegistry.test.ts` (new)
- `DOCUMENTATION.md`, `POLICY.md`, `mem://features/admin/kpi-standardization-registry` (sync)
