import { describe, it, expect } from 'vitest';
import { resolvePendingWith } from '@/lib/kpiPendingWith';

/** ADR-193 / POLICY §FM-REVIEWER-SCOPE — FM is a first-class review stage. */
describe('Functional Manager pending-with resolution', () => {
  const chain = ['kra_set', 'self_review', 'manager_check', 'functional_manager_check', 'audit', 'approved'];

  it('attributes the FM stage to the named functional manager', () => {
    expect(resolvePendingWith({
      status: 'manager_check',
      isOrgKpi: false,
      employeeName: 'Emp',
      managerName: 'Mgr',
      functionalManagerName: 'Saibal Kunar',
      skipManagerName: null,
      stageChain: chain,
    })).toBe('Saibal Kunar');
  });

  it('falls back to the generic queue label when FM is unmapped', () => {
    expect(resolvePendingWith({
      status: 'manager_check',
      isOrgKpi: false,
      employeeName: 'Emp',
      managerName: 'Mgr',
      functionalManagerName: null,
      skipManagerName: null,
      stageChain: chain,
    })).toBe('Functional Manager');
  });

  it('advances past the FM stage to the next reviewer', () => {
    expect(resolvePendingWith({
      status: 'functional_manager_check',
      isOrgKpi: false,
      employeeName: 'Emp',
      managerName: 'Mgr',
      functionalManagerName: 'Saibal Kunar',
      skipManagerName: null,
      auditorNames: 'Shekhar Sharad',
      stageChain: chain,
    })).toBe('Shekhar Sharad');
  });
});
