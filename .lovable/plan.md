

## Fix: SLA Compliance Inconsistency + Make SLA Target Configurable

### Problem
1. **SLA 0% vs 100% mismatch**: Health Score shows 0% SLA (1 resolved query exceeded 2-day target), while My Productivity shows 100% (no queries received by user, defaults to 100%).
2. **Hardcoded SLA target**: `SLA_TARGET_DAYS = 2` in `InboxInsights.tsx` and `SLA_HOURS = 48` in `PersonalProductivityInsights.tsx` are hardcoded, not configurable.

### Implementation

**1. Add `query_sla_target_days` to `workflow_settings` table**
- Insert a new row: category `sla`, key `query_sla_target_days`, label "Query SLA Target (Days)", default value `2`, min 1, max 30, unit "days"
- This makes the SLA target admin-configurable alongside existing SLA warning/critical thresholds

**2. `src/hooks/useWorkflowSettings.ts`**
- Add a convenience hook `useSlaTargetDays()` that reads `query_sla_target_days` from workflow settings, defaulting to 2
- Add the default to `DEFAULT_VALUES`

**3. `src/components/inbox/InboxInsights.tsx`**
- Remove hardcoded `SLA_TARGET_DAYS = 2`
- Accept `slaTargetDays` as a prop or read it via the new hook
- When `resolved.length === 0`, display SLA as "N/A" instead of defaulting to 100%
- When no resolved queries exist, use a neutral health score (don't penalize with 0% SLA)

**4. `src/components/inbox/PersonalProductivityInsights.tsx`**
- Remove hardcoded `SLA_HOURS = 48`
- Use the same configurable target via prop or hook
- When `resolvedReceived.length === 0`, display SLA as "N/A" instead of 100%

**5. `src/pages/QueryInbox.tsx`**
- Read `useSlaTargetDays()` and pass it down to both insight components

**6. Documentation** — Update `DOCUMENTATION.md` and `POLICY.md` with version bump and changelog entry.

### Risk Assessment
- **Data impact**: One new row inserted into `workflow_settings` — no schema change needed (table already exists)
- **Regression risk**: Low — replaces hardcoded constant with configurable value, same default
- **UI/UX**: Admins can now tune SLA target in Workflow Configuration; N/A display prevents misleading 0%/100% when no data exists

