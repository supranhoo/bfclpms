

## RCA: Metal Sizing DQ Rules Not Applied

### Root Cause — Missing Configuration Data

The `incentive_disqualification_rules` table has **zero rows** for the Metal Sizing program (`9bef3123...`). The edge function queries DQ rules per `program_id` (line 60-63), so when no rules exist, the DQ evaluation loop is a no-op and all employees pass as eligible.

Programs that DO have rules configured:
- KRA Incentive (`21b98a7d...`) — 6 rules (absence, lwp, warning, suspension, lti, contract)
- Port Incentive (`c1724805...`) — 1 rule (warning)

Metal Sizing has **none**.

### Fix

**1. Insert DQ rules for Metal Sizing program**

Insert the same standard DQ rules that exist for KRA Incentive into Metal Sizing. At minimum: `warning`, `suspension`, `lti`, `contract`, `lwp`, `absence`.

```sql
INSERT INTO incentive_disqualification_rules (program_id, rule_type, rule_config)
VALUES
  ('9bef3123-6754-4166-8a31-8c746e69048f', 'warning',    '{"disqualify": true}'),
  ('9bef3123-6754-4166-8a31-8c746e69048f', 'suspension', '{"disqualify": true}'),
  ('9bef3123-6754-4166-8a31-8c746e69048f', 'absence',    '{"threshold_days": 1}'),
  ('9bef3123-6754-4166-8a31-8c746e69048f', 'lwp',        '{"max_lwp_days": 3, "exempt_roles": []}'),
  ('9bef3123-6754-4166-8a31-8c746e69048f', 'lti',        '{"lti_1_penalty_percent": 50, "lti_2_plus_penalty_percent": 100, "scope": "department"}'),
  ('9bef3123-6754-4166-8a31-8c746e69048f', 'contract',   '{"ineligible": true, "exempt_bus": []}');
```

**2. Re-compute Metal Sizing for March 2026** to apply the new rules.

**3. Audit all other programs** — check if any other production programs are also missing DQ rules and insert them.

### Files Modified

| File | Change |
|------|--------|
| DB insert | Add 6 DQ rules for Metal Sizing |
| Re-computation | Trigger compute for March 2026 Metal Sizing |
| `DOCUMENTATION.md` | v2.15.39 — note DQ rule configuration requirement |

### Risk Assessment
- **Regression**: None — inserting new configuration rows; no code or schema change
- **Data**: Re-computation will delete-and-reinsert records with correct DQ status
- **Operational**: Admin should verify DQ rule configuration exists for every program via the Incentive Configuration UI

