import { describe, it, expect } from 'vitest';
import {
  hasSelfResponse,
  resolveStatusForSelfDraft,
  violatesDraftInvariant,
} from '@/lib/annualReview/draftImpliesPendingSelf';

/** ADR-211 — a saved self draft may never leave an instance at `not_started`. */

const selfDraft = { reviewer_role: 'self', is_locked: false };
const managerDraft = { reviewer_role: 'manager', is_locked: false };

describe('hasSelfResponse', () => {
  it('detects a self row', () => {
    expect(hasSelfResponse([managerDraft, selfDraft])).toBe(true);
  });
  it('ignores non-self rows', () => {
    expect(hasSelfResponse([managerDraft])).toBe(false);
  });
  it('handles an empty response set', () => {
    expect(hasSelfResponse([])).toBe(false);
  });
});

describe('resolveStatusForSelfDraft', () => {
  it('advances not_started to pending_self when a self draft exists', () => {
    expect(resolveStatusForSelfDraft('not_started', [selfDraft])).toBe('pending_self');
  });

  it('advances even when the self response is already locked', () => {
    expect(
      resolveStatusForSelfDraft('not_started', [{ reviewer_role: 'self', is_locked: true }]),
    ).toBe('pending_self');
  });

  it('leaves not_started alone with no self row', () => {
    expect(resolveStatusForSelfDraft('not_started', [managerDraft])).toBe('not_started');
  });

  it('never rewinds a downstream status', () => {
    for (const s of ['pending_manager', 'pending_dept', 'pending_bu', 'completed', 'excluded']) {
      expect(resolveStatusForSelfDraft(s, [selfDraft])).toBe(s);
    }
  });
});

describe('violatesDraftInvariant', () => {
  it('flags the 102014 defect shape', () => {
    expect(violatesDraftInvariant('not_started', [selfDraft])).toBe(true);
  });
  it('passes a healthy instance', () => {
    expect(violatesDraftInvariant('pending_self', [selfDraft])).toBe(false);
  });
});