import { describe, it, expect } from 'vitest';
import { isDeadEndStatus, reanchorStatus, roleForStatus } from './reanchorStatus';

describe('roleForStatus', () => {
  it('maps every pending status to its canonical role', () => {
    expect(roleForStatus('pending_self')).toBe('self');
    expect(roleForStatus('pending_skip')).toBe('skip_manager');
    expect(roleForStatus('pending_dept')).toBe('dept_head');
    expect(roleForStatus('pending_bu')).toBe('bu_head');
    expect(roleForStatus('pending_management')).toBe('management');
  });

  it('returns null for terminal statuses', () => {
    expect(roleForStatus('completed')).toBeNull();
    expect(roleForStatus('excluded')).toBeNull();
    expect(roleForStatus('not_started')).toBeNull();
  });
});

describe('isDeadEndStatus', () => {
  it('flags a pending status whose stage was removed', () => {
    // The production incident: dept_head stripped by BU-terminal normalisation.
    expect(isDeadEndStatus('pending_dept', ['self', 'bu_head'])).toBe(true);
  });

  it('does not flag an enabled stage or a terminal status', () => {
    expect(isDeadEndStatus('pending_bu', ['self', 'bu_head'])).toBe(false);
    expect(isDeadEndStatus('completed', ['self'])).toBe(false);
  });
});

describe('reanchorStatus', () => {
  it('is a no-op when the stage is enabled', () => {
    expect(reanchorStatus('pending_manager', ['self', 'manager', 'hr'])).toBe('pending_manager');
  });

  it('moves forward to the nearest enabled downstream stage', () => {
    expect(reanchorStatus('pending_dept', ['self', 'bu_head'])).toBe('pending_bu');
    expect(reanchorStatus('pending_manager', ['self', 'hr'])).toBe('pending_hr');
    expect(reanchorStatus('pending_skip', ['self', 'dept_head', 'bu_head'])).toBe('pending_dept');
  });

  it('falls back to the nearest enabled upstream stage when nothing survives downstream', () => {
    expect(reanchorStatus('pending_hr', ['self', 'manager'])).toBe('pending_manager');
    expect(reanchorStatus('pending_management', ['self'])).toBe('pending_self');
  });

  it('returns null when no stage is enabled at all', () => {
    expect(reanchorStatus('pending_dept', [])).toBeNull();
    expect(reanchorStatus('pending_dept', null)).toBeNull();
  });

  it('leaves terminal statuses untouched', () => {
    expect(reanchorStatus('completed', [])).toBe('completed');
    expect(reanchorStatus('excluded', ['self'])).toBe('excluded');
  });
});
