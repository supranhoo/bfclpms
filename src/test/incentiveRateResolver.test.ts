import { describe, it, expect } from 'vitest';
import {
  resolveEmployeeRate,
  resolveEmployeeCompanyId,
  pickLatestEffective,
  type RateRow,
} from '@/lib/incentiveRateResolver';

const EMP = 'emp-1';
const DEPT = 'dept-1';
const BU = 'bu-1';
const DIV = 'div-1';
const COMPANY_SAIBAL = 'company-saibal';
const COMPANY_FERRO = 'company-ferro';

function rate(over: Partial<RateRow>): RateRow {
  return {
    rate_type: 'common',
    rate_per_ton: 100,
    effective_from: '2025-01-01',
    employee_id: null,
    entity_id: null,
    ...over,
  };
}

describe('pickLatestEffective', () => {
  it('returns null when nothing eligible', () => {
    expect(pickLatestEffective([rate({ effective_from: '2030-01-01' })], '2026-05-31')).toBeNull();
  });

  it('picks the latest row with effective_from <= targetDate', () => {
    const rows = [
      rate({ effective_from: '2025-10-01', rate_per_ton: 478.35 }),
      rate({ effective_from: '2026-05-11', rate_per_ton: 490.62 }),
      rate({ effective_from: '2027-01-01', rate_per_ton: 999 }),
    ];
    const picked = pickLatestEffective(rows, '2026-05-31');
    expect(picked?.rate_per_ton).toBe(490.62);
  });

  it('treats null effective_from as always eligible', () => {
    const rows = [rate({ effective_from: null, rate_per_ton: 50 })];
    expect(pickLatestEffective(rows, '2026-05-31')?.rate_per_ton).toBe(50);
  });
});

describe('resolveEmployeeRate — 5-tier cascade', () => {
  const rates: RateRow[] = [
    rate({ rate_type: 'common', rate_per_ton: 100, effective_from: '2025-01-01' }),
    rate({ rate_type: 'company', entity_id: COMPANY_SAIBAL, rate_per_ton: 200, effective_from: '2025-01-01' }),
    rate({ rate_type: 'bu', entity_id: BU, rate_per_ton: 300, effective_from: '2025-01-01' }),
    rate({ rate_type: 'department', entity_id: DEPT, rate_per_ton: 400, effective_from: '2025-01-01' }),
    rate({ rate_type: 'employee', employee_id: EMP, rate_per_ton: 500, effective_from: '2025-01-01' }),
  ];

  it('employee beats all', () => {
    const r = resolveEmployeeRate(EMP, DEPT, BU, rates, COMPANY_SAIBAL, '2026-05-31');
    expect(r).toEqual({ employeeId: EMP, rate: 500, source: 'employee' });
  });

  it('department beats bu/company/common when no employee rate', () => {
    const noEmp = rates.filter(r => r.rate_type !== 'employee');
    const r = resolveEmployeeRate(EMP, DEPT, BU, noEmp, COMPANY_SAIBAL, '2026-05-31');
    expect(r.source).toBe('department');
    expect(r.rate).toBe(400);
  });

  it('bu beats company/common', () => {
    const noEmpDept = rates.filter(r => r.rate_type !== 'employee' && r.rate_type !== 'department');
    const r = resolveEmployeeRate(EMP, DEPT, BU, noEmpDept, COMPANY_SAIBAL, '2026-05-31');
    expect(r.source).toBe('bu');
  });

  it('company beats common', () => {
    const only = rates.filter(r => r.rate_type === 'company' || r.rate_type === 'common');
    const r = resolveEmployeeRate(EMP, DEPT, BU, only, COMPANY_SAIBAL, '2026-05-31');
    expect(r.source).toBe('company');
    expect(r.rate).toBe(200);
  });

  it('falls back to common when nothing else matches', () => {
    const r = resolveEmployeeRate(EMP, null, null, [rate({ rate_per_ton: 99 })], null, '2026-05-31');
    expect(r.source).toBe('common');
    expect(r.rate).toBe(99);
  });

  it('returns source=none when no rate is configured', () => {
    const r = resolveEmployeeRate(EMP, null, null, [], null, '2026-05-31');
    expect(r.source).toBe('none');
    expect(r.rate).toBe(0);
  });

  it('respects effective_from gating: future rate is ignored', () => {
    const onlyCommon: RateRow[] = [
      rate({ rate_type: 'common', rate_per_ton: 100, effective_from: '2025-01-01' }),
      rate({ rate_type: 'common', rate_per_ton: 999, effective_from: '2027-01-01' }),
    ];
    const r = resolveEmployeeRate(EMP, null, null, onlyCommon, null, '2026-05-31');
    expect(r.rate).toBe(100);
  });
});

describe('resolveEmployeeCompanyId — BFCL RCA scenario', () => {
  // SK459 Virendra Yadav: profiles.company_id = Saibal Kunar
  //                       dept→BU→division→company = Ferro
  // Grid and server MUST both pick Saibal Kunar.
  const deptToBu = new Map([[DEPT, BU]]);
  const buToDivision = new Map([[BU, DIV]]);
  const divToCompany = new Map([[DIV, COMPANY_FERRO]]);
  const buToCompany = new Map([[BU, COMPANY_FERRO]]);

  it('profiles.company_id wins over dept-chain resolution', () => {
    const cid = resolveEmployeeCompanyId({
      profileCompanyId: COMPANY_SAIBAL,
      departmentId: DEPT,
      deptToBu, buToDivision, divToCompany, buToCompany,
    });
    expect(cid).toBe(COMPANY_SAIBAL);
  });

  it('falls back to division.company_id when profile has none', () => {
    const cid = resolveEmployeeCompanyId({
      profileCompanyId: null,
      departmentId: DEPT,
      deptToBu, buToDivision, divToCompany, buToCompany,
    });
    expect(cid).toBe(COMPANY_FERRO);
  });

  it('falls back to buToCompany when no division', () => {
    const cid = resolveEmployeeCompanyId({
      profileCompanyId: null,
      departmentId: DEPT,
      deptToBu,
      buToDivision: new Map([[BU, null]]),
      divToCompany: new Map(),
      buToCompany,
    });
    expect(cid).toBe(COMPANY_FERRO);
  });

  it('returns null when no chain resolves', () => {
    const cid = resolveEmployeeCompanyId({
      profileCompanyId: null,
      departmentId: null,
      deptToBu: new Map(),
      buToDivision: new Map(),
      divToCompany: new Map(),
      buToCompany: new Map(),
    });
    expect(cid).toBeNull();
  });
});

describe('Parity guarantee — grid and edge function agree', () => {
  // Locks in the BFCL May 2026 scenario where the two implementations had drifted.
  it('SK459-style helper resolves to Saibal Kunar ₹503.39, not Ferro ₹478.35', () => {
    const rates: RateRow[] = [
      rate({ rate_type: 'company', entity_id: COMPANY_FERRO, rate_per_ton: 478.35, effective_from: '2025-10-01' }),
      rate({ rate_type: 'company', entity_id: COMPANY_FERRO, rate_per_ton: 490.62, effective_from: '2026-05-11' }),
      rate({ rate_type: 'company', entity_id: COMPANY_SAIBAL, rate_per_ton: 503.39, effective_from: '2025-10-01' }),
    ];
    const companyId = resolveEmployeeCompanyId({
      profileCompanyId: COMPANY_SAIBAL,
      departmentId: DEPT,
      deptToBu: new Map([[DEPT, BU]]),
      buToDivision: new Map([[BU, DIV]]),
      divToCompany: new Map([[DIV, COMPANY_FERRO]]),
      buToCompany: new Map([[BU, COMPANY_FERRO]]),
    });
    expect(companyId).toBe(COMPANY_SAIBAL);

    const r = resolveEmployeeRate(EMP, DEPT, BU, rates, companyId, '2026-05-31');
    expect(r.source).toBe('company');
    expect(r.rate).toBe(503.39);
  });
});