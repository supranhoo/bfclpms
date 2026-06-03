import { describe, it, expect } from 'vitest';
import { classifyAdminOverride, describeChangedFields } from './auditLabels';

describe('classifyAdminOverride', () => {
  it('returns logic_updated when only scoring fields changed via admin edit dialog', () => {
    expect(classifyAdminOverride({
      action: 'ADMIN_OVERRIDE',
      metadata: {
        source: 'admin_edit_dialog',
        status_changed: false,
        changed_fields: ['r0', 'r3', 'r5', 'threshold_mode'],
      },
    })).toBe('logic_updated');
  });

  it('returns kpi_updated when descriptive fields changed via admin edit dialog', () => {
    expect(classifyAdminOverride({
      action: 'ADMIN_OVERRIDE',
      metadata: {
        source: 'admin_edit_dialog',
        status_changed: false,
        changed_fields: ['kpi_name', 'kra_name', 'r0'],
      },
    })).toBe('kpi_updated');
  });

  it('returns admin_override when status actually changed', () => {
    expect(classifyAdminOverride({
      action: 'ADMIN_OVERRIDE',
      metadata: {
        source: 'admin_edit_dialog',
        status_changed: true,
        changed_fields: ['status'],
      },
    })).toBe('admin_override');
  });

  it('returns admin_override for non-edit-dialog sources', () => {
    expect(classifyAdminOverride({
      action: 'ADMIN_OVERRIDE',
      metadata: { source: 'bulk_override', status_changed: false, changed_fields: ['r0'] },
    })).toBe('admin_override');
  });

  it('returns admin_override for non-ADMIN_OVERRIDE actions', () => {
    expect(classifyAdminOverride({ action: 'SELF_REVIEW_SUBMITTED', metadata: null })).toBe('admin_override');
  });
});

describe('describeChangedFields', () => {
  it('collapses scoring fields into a single "Scoring Logic" entry', () => {
    expect(describeChangedFields(['r0', 'r3', 'threshold_mode'])).toBe('Scoring Logic');
  });

  it('humanises known fields and Title-cases unknown ones', () => {
    expect(describeChangedFields(['kpi_name', 'weightage', 'something_new']))
      .toBe('KPI Name, Weightage, Something New');
  });

  it('returns an empty string for no fields', () => {
    expect(describeChangedFields([])).toBe('');
  });
});