import { describe, it, expect } from 'vitest';

/**
 * Reviewer-chain resolution contract for Annual Review seeding.
 *
 * Replicates the in-seeder logic so we can lock down the precedence rules:
 *   - BU head from business_units.head_user_id wins over the legacy 3-hop walk
 *   - HR head from org_head_config wins over the cycle-global hrUserId
 *   - Both fall back gracefully when unset
 */

type Person = { id: string; mgr: string | null; deptId: string };

function resolveChain(opts: {
  person: Person;
  mgrMap: Map<string, string | null>;
  deptToBu: Record<string, string>;
  buHead: Record<string, string | null>;
  hrHeadCfg: string | null;
  hrFallback: string | null;
}) {
  const { person, mgrMap, deptToBu, buHead, hrHeadCfg, hrFallback } = opts;
  const mgr = mgrMap.get(person.id) ?? null;
  const skip = mgr ? mgrMap.get(mgr) ?? null : null;
  const buId = deptToBu[person.deptId];
  const buFromCfg = buId ? buHead[buId] ?? null : null;
  const buFallback = skip ? mgrMap.get(skip) ?? null : null;
  return {
    manager_id: mgr,
    skip_id: skip,
    bu_head_id: buFromCfg ?? buFallback,
    hr_id: hrHeadCfg ?? hrFallback,
  };
}

describe('Annual Review reviewer-chain resolution (Org Heads)', () => {
  const deptToBu = { 'd-hr': 'bu-hr', 'd-eng': 'bu-eng' };

  it('uses business_units.head_user_id when configured', () => {
    const chain = resolveChain({
      person: { id: 'emp1', mgr: 'm1', deptId: 'd-eng' },
      mgrMap: new Map([['emp1','m1'],['m1','m2'],['m2',null]]),
      deptToBu,
      buHead: { 'bu-eng': 'configured-bu-head' },
      hrHeadCfg: null, hrFallback: null,
    });
    expect(chain.bu_head_id).toBe('configured-bu-head');
  });

  it('falls back to 3-hop ancestor when BU has no head configured', () => {
    const chain = resolveChain({
      person: { id: 'emp1', mgr: 'm1', deptId: 'd-eng' },
      mgrMap: new Map([['emp1','m1'],['m1','m2'],['m2','top'],['top',null]]),
      deptToBu,
      buHead: { 'bu-eng': null },
      hrHeadCfg: null, hrFallback: null,
    });
    expect(chain.bu_head_id).toBe('top');
  });

  it('prefers org_head_config HR head over the cycle-global fallback', () => {
    const chain = resolveChain({
      person: { id: 'emp1', mgr: null, deptId: 'd-eng' },
      mgrMap: new Map([['emp1', null]]),
      deptToBu, buHead: {},
      hrHeadCfg: 'cfg-hr-head', hrFallback: 'legacy-hr-head',
    });
    expect(chain.hr_id).toBe('cfg-hr-head');
  });

  it('falls back to args.hrUserId when org_head_config is empty', () => {
    const chain = resolveChain({
      person: { id: 'emp1', mgr: null, deptId: 'd-eng' },
      mgrMap: new Map(), deptToBu, buHead: {},
      hrHeadCfg: null, hrFallback: 'legacy-hr-head',
    });
    expect(chain.hr_id).toBe('legacy-hr-head');
  });

  it('returns null bu_head_id when both configured head and ancestor missing', () => {
    const chain = resolveChain({
      person: { id: 'emp1', mgr: null, deptId: 'd-orphan' },
      mgrMap: new Map([['emp1', null]]),
      deptToBu: {}, buHead: {},
      hrHeadCfg: null, hrFallback: null,
    });
    expect(chain.bu_head_id).toBeNull();
  });
});