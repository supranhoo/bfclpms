import { describe, it, expect } from 'vitest';
import { bulkActionForStage } from './bulkActionForStage';

describe('bulkActionForStage', () => {
  it('management → terminal mgmt approval regardless of viewerStage', () => {
    expect(bulkActionForStage('management', 'manager')).toMatchObject({
      kind: 'mgmt',
      label: 'Bulk Approve (Mgmt)',
    });
    expect(bulkActionForStage('management', 'hr_pms')).toMatchObject({ kind: 'mgmt' });
  });

  it('admin follows viewerStage', () => {
    expect(bulkActionForStage('admin', 'management')).toMatchObject({ kind: 'mgmt' });
    expect(bulkActionForStage('admin', 'hr_pms')).toMatchObject({
      kind: 'stage',
      stage: 'hr_pms',
      label: 'Bulk Sign-off (HR PMS)',
    });
    expect(bulkActionForStage('admin', 'auditor')).toMatchObject({
      kind: 'stage',
      stage: 'auditor',
    });
    expect(bulkActionForStage('admin', 'manager')).toMatchObject({
      kind: 'stage',
      stage: 'manager',
    });
    expect(bulkActionForStage('admin', 'skip_level')).toMatchObject({
      kind: 'stage',
      stage: 'skip_level',
    });
  });

  it('intermediate reviewers are bound to their own role', () => {
    // viewerStage is ignored — HR PMS can only sign as HR PMS.
    expect(bulkActionForStage('hr_pms', 'management')).toMatchObject({
      kind: 'stage',
      stage: 'hr_pms',
    });
    expect(bulkActionForStage('hr_pms', 'auditor')).toMatchObject({
      kind: 'stage',
      stage: 'hr_pms',
    });
    expect(bulkActionForStage('manager', 'management')).toMatchObject({
      kind: 'stage',
      stage: 'manager',
    });
    expect(bulkActionForStage('auditor', 'hr_pms')).toMatchObject({
      kind: 'stage',
      stage: 'auditor',
    });
    expect(bulkActionForStage('skip_level', 'manager')).toMatchObject({
      kind: 'stage',
      stage: 'skip_level',
    });
  });

  it('employee / unknown / null → no action', () => {
    expect(bulkActionForStage('employee', 'manager')).toBeNull();
    expect(bulkActionForStage(null, 'manager')).toBeNull();
    expect(bulkActionForStage(undefined, 'manager')).toBeNull();
    expect(bulkActionForStage('something_weird', 'manager')).toBeNull();
  });
});