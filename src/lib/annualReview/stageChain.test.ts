import { describe, it, expect } from 'vitest';
import { ALL_STAGES, enabledChain, nextStatus, prevStatus, describeChain } from './stageChain';

describe('enabledChain', () => {
  it('returns the full canonical chain when input is empty', () => {
    expect(enabledChain([])).toEqual([...ALL_STAGES]);
    expect(enabledChain(null)).toEqual([...ALL_STAGES]);
    expect(enabledChain(undefined)).toEqual([...ALL_STAGES]);
  });

  it('preserves canonical order, dedupes, allows dropping self', () => {
    expect(enabledChain(['manager'])).toEqual(['manager']);
    expect(enabledChain(['hr', 'manager'])).toEqual(['manager', 'hr']);
    expect(enabledChain(['hr', 'manager', 'self'])).toEqual(['self', 'manager', 'hr']);
    expect(enabledChain(['self', 'self', 'manager', 'manager'])).toEqual(['self', 'manager']);
  });

  it('throws when no stages remain after normalisation', () => {
    expect(() => enabledChain(['bogus' as never])).toThrow();
  });
});

describe('nextStatus', () => {
  it('walks the full chain by default', () => {
    expect(nextStatus('pending_self',    null)).toBe('pending_manager');
    expect(nextStatus('pending_manager', null)).toBe('pending_skip');
    expect(nextStatus('pending_skip',    null)).toBe('pending_dept');
    expect(nextStatus('pending_dept',    null)).toBe('pending_bu');
    expect(nextStatus('pending_bu',      null)).toBe('pending_hr');
    expect(nextStatus('pending_hr',      null)).toBe('completed');
  });

  it('skips disabled stages', () => {
    // self → hr (every middle stage disabled)
    expect(nextStatus('pending_self', ['self', 'hr'])).toBe('pending_hr');
    // self → manager → hr (skip + bu disabled)
    expect(nextStatus('pending_manager', ['self', 'manager', 'hr'])).toBe('pending_hr');
    // self → manager → bu (skip + hr disabled): bu is terminal
    expect(nextStatus('pending_bu', ['self', 'manager', 'bu_head'])).toBe('completed');
  });

  it('handles chains without self', () => {
    expect(nextStatus('pending_manager', ['manager', 'hr'])).toBe('pending_hr');
  });

  it('returns input unchanged for non-pending statuses', () => {
    expect(nextStatus('completed', null)).toBe('completed');
    expect(nextStatus('not_started', null)).toBe('not_started');
  });
});

describe('prevStatus', () => {
  it('walks back through the full chain', () => {
    expect(prevStatus('manager',      null)).toBe('pending_self');
    expect(prevStatus('skip_manager', null)).toBe('pending_manager');
    expect(prevStatus('dept_head',    null)).toBe('pending_skip');
    expect(prevStatus('bu_head',      null)).toBe('pending_dept');
    expect(prevStatus('hr',           null)).toBe('pending_bu');
  });

  it('jumps over disabled stages on the way back', () => {
    expect(prevStatus('hr', ['self', 'hr'])).toBe('pending_self');
    expect(prevStatus('hr', ['self', 'manager', 'hr'])).toBe('pending_manager');
  });

  it('throws when no previous stage exists', () => {
    expect(() => prevStatus('self', null)).toThrow();
  });
});

describe('describeChain', () => {
  it('renders a human label', () => {
    expect(describeChain(null)).toBe('Self → Manager → Skip → Dept → BU → HR');
    expect(describeChain(['self', 'hr'])).toBe('Self → HR');
  });
});