

## Replace Raw JSON Config with Friendly Form Fields in DQ Rules Editor

### Problem
Currently, DQ rule configuration is displayed and edited as raw JSON (e.g., `{"threshold_days":1}`). Admins must manually edit JSON strings, which is error-prone and unfriendly.

### Change
Replace the raw JSON display/edit with structured form fields per rule type. Each rule type gets its own inline form with labeled inputs (number fields, switches, text inputs) based on its config shape.

### Implementation — `src/components/incentive/DisqualificationRulesEditor.tsx`

**Replace the JSON config column** with a rule-type-specific inline form renderer:

| Rule Type | Fields |
|-----------|--------|
| **Absence** | `Threshold Days` — number input |
| **LWP** | `Max LWP Days` — number input |
| **Warning Letter** | `Disqualify` — switch (on/off) |
| **Suspension** | `Disqualify` — switch (on/off) |
| **Contract Worker** | `Ineligible` — switch (on/off) |
| **LTI** | `1 LTI Penalty %` — number, `2+ LTI Penalty %` — number, `Scope` — select (department/company) |

**Approach:**
1. Create a `RuleConfigEditor` sub-component that renders the appropriate form fields based on `rule_type`
2. Each field updates the config object in local state; a Save button persists changes
3. When not editing, show a human-readable summary (e.g., "Threshold: 1 day" instead of `{"threshold_days":1}`)
4. Remove the raw JSON input entirely

**Save logic** stays the same — calls `upsertRule.mutate()` with the structured config object built from form state.

### Files Changed
1. `src/components/incentive/DisqualificationRulesEditor.tsx` — replace JSON editor with form fields
2. `DOCUMENTATION.md` — version history
3. `POLICY.md` — version history

### Risk Assessment
- **Data Impact**: None — same `rule_config` JSONB column, same structure
- **Regression Risk**: Zero — purely UI change; underlying data format unchanged

