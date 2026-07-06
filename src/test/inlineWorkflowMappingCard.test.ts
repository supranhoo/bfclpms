import { describe, it, expect } from 'vitest';
import {
  resolveInlineMapping,
  sourceLabel,
  type InlineConfigRow,
  type InlineResolvedInfo,
} from '@/lib/workflowMapping/resolveInlineMapping';

const EMP = 'emp-1';

function row(overrides: Partial<InlineConfigRow>): InlineConfigRow {
  return {
    config_type: 'employee',
    config_value: EMP,
    workflow_template_id: 't-1',
    review_period: null,
    review_year: null,
    ...overrides,
  };
}

function info(source: InlineResolvedInfo['config_source']): InlineResolvedInfo {
  return {
    template_id: 't-1',
    display_name: 'Self → Manager',
    stages: ['self_review', 'manager_check'],
    config_source: source,
  };
}

describe('resolveInlineMapping', () => {
  it('classifies exact-period employee override', () => {
    const configs = [row({ review_period: 'July', review_year: 2026 })];
    const r = resolveInlineMapping({
      configs,
      resolved: info('employee'),
      employeeId: EMP,
      period: 'July',
      year: 2026,
    });
    expect(r.source).toBe('employee_exact');
    expect(r.effectiveFrom).toBeNull();
    expect(sourceLabel(r)).toBe('Set for this month');
  });

  it('classifies employee row from an earlier month', () => {
    const configs = [row({ review_period: 'April', review_year: 2026 })];
    const r = resolveInlineMapping({
      configs,
      resolved: info('employee'),
      employeeId: EMP,
      period: 'July',
      year: 2026,
    });
    expect(r.source).toBe('employee_earlier_month');
    expect(r.effectiveFrom).toEqual({ period: 'April', year: 2026 });
    expect(sourceLabel(r)).toBe('Carried from April 2026');
  });

  it('picks the MOST recent carried employee row', () => {
    const configs = [
      row({ review_period: 'January', review_year: 2026 }),
      row({ review_period: 'April', review_year: 2026 }),
      row({ review_period: 'August', review_year: 2026 }), // future — ignored
    ];
    const r = resolveInlineMapping({
      configs,
      resolved: info('employee'),
      employeeId: EMP,
      period: 'July',
      year: 2026,
    });
    expect(r.effectiveFrom).toEqual({ period: 'April', year: 2026 });
  });

  it('labels department source', () => {
    const r = resolveInlineMapping({
      configs: [],
      resolved: info('department'),
      employeeId: EMP,
      period: 'July',
      year: 2026,
    });
    expect(r.source).toBe('department');
    expect(sourceLabel(r)).toBe('Department default');
  });

  it('labels pms_grade source', () => {
    const r = resolveInlineMapping({
      configs: [],
      resolved: info('pms_grade'),
      employeeId: EMP,
      period: 'July',
      year: 2026,
    });
    expect(r.source).toBe('pms_grade');
    expect(sourceLabel(r)).toBe('PMS grade default');
  });

  it('labels default source', () => {
    const r = resolveInlineMapping({
      configs: [],
      resolved: info('default'),
      employeeId: EMP,
      period: 'July',
      year: 2026,
    });
    expect(r.source).toBe('default');
    expect(sourceLabel(r)).toBe('Global default');
  });

  it('handles missing resolver result gracefully', () => {
    const r = resolveInlineMapping({
      configs: [],
      resolved: null,
      employeeId: EMP,
      period: 'July',
      year: 2026,
    });
    expect(r.source).toBe('none');
    expect(r.templateId).toBeNull();
  });
});