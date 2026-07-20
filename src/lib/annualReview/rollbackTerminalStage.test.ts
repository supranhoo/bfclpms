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