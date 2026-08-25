import { describe, it, expect } from 'vitest';
import {
  resolvePipEmployeeFieldState,
  formatPipEmployeeLabel,
} from '@/lib/pip/pipEmployeeField';

const emp = { id: 'e1', full_name: 'Anup Kumar', employee_code: '101381', designation: 'Officer' };

describe('resolvePipEmployeeFieldState (ADR-312)', () => {
  it('shows the picker when there is no prefill', () => {
    expect(resolvePipEmployeeFieldState({ value: '', resolved: undefined, isResolving: false, changing: false }))
      .toEqual({ kind: 'picker' });
  });

  it('shows a skeleton while the preselected employee resolves', () => {
    expect(resolvePipEmployeeFieldState({
      value: 'e1', preselectedEmployeeId: 'e1', resolved: undefined, isResolving: true, changing: false,
    })).toEqual({ kind: 'loading' });
  });

  it('confirms the prefilled employee instead of asking again', () => {
    expect(resolvePipEmployeeFieldState({
      value: 'e1', preselectedEmployeeId: 'e1', resolved: emp, isResolving: false, changing: false,
    })).toEqual({ kind: 'confirmed', employee: emp });
  });

  it('reports an unresolvable prefilled id rather than rendering blank', () => {
    expect(resolvePipEmployeeFieldState({
      value: 'ghost', preselectedEmployeeId: 'ghost', resolved: null, isResolving: false, changing: false,
    })).toEqual({ kind: 'unresolved', employeeId: 'ghost' });
  });

  it('falls back to the picker once the user chooses to change employee', () => {
    expect(resolvePipEmployeeFieldState({
      value: 'e1', preselectedEmployeeId: 'e1', resolved: emp, isResolving: false, changing: true,
    })).toEqual({ kind: 'picker' });
  });

  it('formats the label with the employee code when present', () => {
    expect(formatPipEmployeeLabel(emp)).toBe('Anup Kumar (101381)');
    expect(formatPipEmployeeLabel({ id: 'x', full_name: 'Solo', employee_code: null })).toBe('Solo');
  });
});
