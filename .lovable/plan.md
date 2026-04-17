

## Plan: Company-wise Production Rate

### Scope
Add **Company** as a new rate scope alongside Employee / Department / BU / Common in the Production Rates tab. Lets admins set one rate per company (e.g., BFCL = ₹478, Saibal = ₹500).

### Database Change

`incentive_production_rates.rate_type` check constraint currently allows `employee | department | bu | common`. Add `'company'` to the allowed list. The existing `entity_id` column already stores any UUID, so no schema/column change needed — `entity_id` will hold `companies.id` for company-scope rows. The unique index `(program_id, rate_type, employee_id, entity_id)` already handles uniqueness per company.

```sql
ALTER TABLE incentive_production_rates DROP CONSTRAINT incentive_production_rates_rate_type_check;
ALTER TABLE incentive_production_rates ADD CONSTRAINT incentive_production_rates_rate_type_check 
  CHECK (rate_type IN ('employee','department','bu','company','common'));
```

### UI Mock

```text
┌─ Production Rates (Per Ton) ─────────────────── [+ Add Rate] ─┐
│  ○ Employee  ○ Department  ○ Business Unit  ● Company  ○ Common
│                                                                │
│  [ Select company ▾ ]  [ Rate/Ton ]  [ Remarks ]  [Add] [X]   │
│                                                                │
│  Type      │ Applies To              │ Rate/Ton  │ Actions    │
│  Company   │ Bihar Foundry & Casting │ ₹478.35   │  ✏  🗑    │
│  Company   │ Saibal Kunar            │ ₹500.00   │  ✏  🗑    │
│  Common    │ All Employees           │ ₹450.00   │  ✏  🗑    │
└────────────────────────────────────────────────────────────────┘
```

### Resolution Cascade (Compute Engine)

New priority order (most-specific wins):
**Employee → Department → Business Unit → Company → Common**

Company rate resolved via `employee → company_id` (using same chain as `useCompanyFilter`: profile.company_id OR profile.department → BU → division → company).

### Files Touched

| File | Change |
|---|---|
| `supabase/migrations/...` (new) | Update `rate_type` CHECK constraint to include `'company'` |
| `src/components/incentive/ProductionRatesTab.tsx` | Add `'company'` to RateType union; add radio option; add company `<Select>` populated from `companies`; track `assignedCompanyIds`; render company name in `getAppliesTo`; new `Company` badge |
| `supabase/functions/compute-monthly-incentives/index.ts` | Build employee→company map (reuse profiles + departments + BUs + divisions chain); insert `companyRate` between `buRate` and `commonRate` in cascade; also fix existing typo `'business_unit'` → `'bu'` for BU lookup |
| `DOCUMENTATION.md` / `POLICY.md` | v2.66.x — Production rates support company scope; cascade order documented |

### Risk & Impact

| Area | Impact |
|---|---|
| Data | Constraint change is additive; existing rows unaffected |
| Workflow | None — additive scope, defaults remain |
| Compute | Cascade now 5-tier; cleaner BU resolution (bug fix included) |
| Regression | Low — new code path only activates when a company-rate row exists |
| Mitigation | If no company rate is configured, behaviour is unchanged from today |

### Out of Scope
- Bulk rate import
- Rate effective-dating (rates remain current-only)

