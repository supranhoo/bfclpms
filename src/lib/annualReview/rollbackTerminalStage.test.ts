import { describe, it, expect } from 'vitest';
import { resolveRollbackTerminalStage, rollbackTerminalLabel } from './rollbackTerminalStage';

describe('resolveRollbackTerminalStage', () => {
  it('prefers HR when enabled', () => {
    expect(resolveRollbackTerminalStage(['self','manager','hr'])).toBe('hr');
  });
  it('BU-Head-terminal (Sourav 100972 shape) → bu_head', () => {
    expect(resolveRollbackTerminalStage(['self','dept_head','bu_head'])).toBe('bu_head');
  });
  it('Dept-Head-terminal → dept_head', () => {
    expect(resolveRollbackTerminalStage(['self','manager','dept_head'])).toBe('dept_head');
  });
  it('manager-only chain → manager', () => {
    expect(resolveRollbackTerminalStage(['self','manager'])).toBe('manager');
  });
  it('self-only → null (no upstream to unlock)', () => {
    expect(resolveRollbackTerminalStage(['self'])).toBeNull();
  });
  it('empty/nullish safe', () => {
    expect(resolveRollbackTerminalStage([])).toBeNull();
    expect(resolveRollbackTerminalStage(null)).toBeNull();
    expect(resolveRollbackTerminalStage(undefined)).toBeNull();
  });
});

describe('rollbackTerminalLabel', () => {
  it('labels BU-terminal chain as pending BU Head', () => {
    expect(rollbackTerminalLabel(['self','dept_head','bu_head'])).toBe('pending BU Head');
  });
  it('labels HR chain as pending HR', () => {
    expect(rollbackTerminalLabel(['self','manager','hr'])).toBe('pending HR');
  });
});

// ADR-136: evidence-based resolver (BU/Dept collapse — Anup 101708 shape).
describe('resolveRollbackTerminalStage — evidence-based (ADR-136)', () => {
  it('enabled=[self,dept,bu] submitted={self,dept} → dept_head', () => {
    expect(
      resolveRollbackTerminalStage(
        ['self','dept_head','bu_head'],
        ['self','dept_head'],
      ),
    ).toBe('dept_head');
  });
  it('enabled=[self,mgr,skip,dept,bu,hr] submitted has HR → hr', () => {
    expect(
      resolveRollbackTerminalStage(
        ['self','manager','skip_manager','dept_head','bu_head','hr'],
        ['self','manager','dept_head','hr'],
      ),
    ).toBe('hr');
  });
  it('enabled=[self] submitted={self} → null', () => {
    expect(resolveRollbackTerminalStage(['self'], ['self'])).toBeNull();
  });
  it('empty submitted set falls back to enabled-only', () => {
    expect(
      resolveRollbackTerminalStage(['self','dept_head','bu_head'], []),
    ).toBe('bu_head');
  });
});

describe('rollbackTerminalLabel — evidence-based (ADR-136)', () => {
  it('BU/Dept collapse → labels as pending Department Head', () => {
    expect(
      rollbackTerminalLabel(
        ['self','dept_head','bu_head'],
        ['self','dept_head'],
      ),
    ).toBe('pending Department Head');
  });
});