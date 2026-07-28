import { describe, it, expect } from 'vitest';
import { allowedOrgEmployeeIds, hasOrgFilter, type EmpOrgAttrs } from './bulkEmployeeFilter';

const DRI = 'div-dri', SMS = 'div-sms', FERRO = 'div-ferro', CPP = 'div-cpp';
const BU_CLU = 'bu-clu', BU_45MW = 'bu-45mw', BU_DRI = 'bu-dri';
const CO = 'co-1', CO2 = 'co-2';

const ORG = new Map<string, EmpOrgAttrs>([
  // Anil Kumar Pathak (200301) — CLU-Operation → CLU → Ferro
  ['anil',   { company_id: CO,  department_id: 'd-clu-ops',  business_unit_id: BU_CLU,  division_id: FERRO }],
  // Babloo Kumar Shah (101209) — 45 MW-Operation → 45 MW → CPP
  ['babloo', { company_id: CO,  department_id: 'd-45mw-ops', business_unit_id: BU_45MW, division_id: CPP }],
  ['dri1',   { company_id: CO,  department_id: 'd-dri-ops',  business_unit_id: BU_DRI,  division_id: DRI }],
  ['sms1',   { company_id: CO2, department_id: 'd-sms-ops',  business_unit_id: 'bu-sms', division_id: SMS }],
  // Unmapped employee — no department chain
  ['orphan', { company_id: null, department_id: null, business_unit_id: null, division_id: null }],
]);

describe('allowedOrgEmployeeIds (ADR-195)', () => {
  it('no selection passes everything through', () => {
    expect(allowedOrgEmployeeIds(ORG, [], [], [], []).size).toBe(5);
    expect(hasOrgFilter([], [], [], [])).toBe(false);
  });

  it('REGRESSION: divisions [DRI, SMS] excludes Ferro (Anil) and CPP (Babloo)', () => {
    const got = allowedOrgEmployeeIds(ORG, [], [DRI, SMS], [], []);
    expect([...got].sort()).toEqual(['dri1', 'sms1']);
    expect(got.has('anil')).toBe(false);
    expect(got.has('babloo')).toBe(false);
  });

  it('single division still narrows correctly (server fast-path parity)', () => {
    expect([...allowedOrgEmployeeIds(ORG, [], [FERRO], [], [])]).toEqual(['anil']);
  });

  it('excludes employees with an unresolved org chain when the axis is active', () => {
    const got = allowedOrgEmployeeIds(ORG, [], [DRI], [], []);
    expect(got.has('orphan')).toBe(false);
  });

  it('ANDs across axes, ORs within an axis', () => {
    // division DRI|SMS AND company CO → only dri1 (sms1 is CO2)
    const got = allowedOrgEmployeeIds(ORG, [CO], [DRI, SMS], [], []);
    expect([...got]).toEqual(['dri1']);
  });

  it('business unit and department axes filter independently', () => {
    expect([...allowedOrgEmployeeIds(ORG, [], [], [BU_CLU, BU_45MW], [])].sort())
      .toEqual(['anil', 'babloo']);
    expect([...allowedOrgEmployeeIds(ORG, [], [], [], ['d-sms-ops'])])
      .toEqual(['sms1']);
  });

  it('contradictory axes yield an empty set', () => {
    expect(allowedOrgEmployeeIds(ORG, [], [DRI], [BU_CLU], []).size).toBe(0);
  });

  it('hasOrgFilter reports any active axis', () => {
    expect(hasOrgFilter([], [DRI], [], [])).toBe(true);
    expect(hasOrgFilter([CO], [], [], [])).toBe(true);
    expect(hasOrgFilter([], [], [], ['d-1'])).toBe(true);
  });
});
