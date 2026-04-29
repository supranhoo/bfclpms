import { describe, it, expect } from 'vitest';
import {
  SAFETY_DRILL_STATUSES,
  SAFETY_DRILL_TYPES,
  SAFETY_EMERGENCY_CONTACT_TYPES,
  canStartDrill,
  canCompleteDrill,
  canReviewDrill,
  isTerminalDrillStatus,
  musterRate,
  formatEvacuationDuration,
  validateDrillDraft,
  validateContactDraft,
} from '@/lib/safetyEmergency';

describe('safetyEmergency enums', () => {
  it('matches DB drill_status enum', () => {
    expect([...SAFETY_DRILL_STATUSES]).toEqual([
      'scheduled', 'in_progress', 'completed', 'reviewed', 'cancelled',
    ]);
  });
  it('matches DB drill_type enum', () => {
    expect([...SAFETY_DRILL_TYPES]).toEqual([
      'fire', 'evacuation', 'spill', 'medical', 'chemical', 'security', 'earthquake', 'other',
    ]);
  });
  it('matches DB emergency_contact_type enum', () => {
    expect([...SAFETY_EMERGENCY_CONTACT_TYPES]).toEqual([
      'internal', 'external_agency', 'hospital', 'fire_brigade', 'police', 'environmental', 'other',
    ]);
  });
});

describe('lifecycle predicates', () => {
  it('start only from scheduled', () => {
    expect(canStartDrill('scheduled')).toBe(true);
    expect(canStartDrill('in_progress')).toBe(false);
    expect(canStartDrill('completed')).toBe(false);
  });
  it('complete only from in_progress', () => {
    expect(canCompleteDrill('in_progress')).toBe(true);
    expect(canCompleteDrill('scheduled')).toBe(false);
  });
  it('review only from completed', () => {
    expect(canReviewDrill('completed')).toBe(true);
    expect(canReviewDrill('reviewed')).toBe(false);
    expect(canReviewDrill('in_progress')).toBe(false);
  });
  it('terminal includes reviewed and cancelled', () => {
    expect(isTerminalDrillStatus('reviewed')).toBe(true);
    expect(isTerminalDrillStatus('cancelled')).toBe(true);
    expect(isTerminalDrillStatus('scheduled')).toBe(false);
  });
});

describe('musterRate', () => {
  it('returns 0 when empty', () => {
    expect(musterRate([])).toBe(0);
  });
  it('computes percentage rounded to 2dp', () => {
    expect(musterRate([
      { accounted_for: true },
      { accounted_for: true },
      { accounted_for: false },
    ])).toBeCloseTo(66.67, 2);
  });
  it('handles all-accounted', () => {
    expect(musterRate([{ accounted_for: true }])).toBe(100);
  });
});

describe('formatEvacuationDuration', () => {
  it('renders m:ss', () => {
    expect(formatEvacuationDuration(0)).toBe('0:00');
    expect(formatEvacuationDuration(65)).toBe('1:05');
    expect(formatEvacuationDuration(605)).toBe('10:05');
  });
  it('returns em-dash for null/invalid', () => {
    expect(formatEvacuationDuration(null)).toBe('—');
    expect(formatEvacuationDuration(-1)).toBe('—');
  });
});

describe('validateDrillDraft', () => {
  it('rejects missing fields', () => {
    expect(validateDrillDraft({})).toMatch(/code/i);
    expect(validateDrillDraft({ drill_code: 'X' })).toMatch(/type/i);
    expect(validateDrillDraft({ drill_code: 'X', type: 'fire' })).toMatch(/scenario/i);
    expect(validateDrillDraft({ drill_code: 'X', type: 'fire', scenario: 'y' })).toMatch(/schedule/i);
  });
  it('passes when all present', () => {
    expect(validateDrillDraft({
      drill_code: 'X', type: 'fire', scenario: 'y', scheduled_at: '2026-01-01T10:00',
    })).toBeNull();
  });
});

describe('validateContactDraft', () => {
  it('rejects missing fields', () => {
    expect(validateContactDraft({})).toMatch(/name/i);
    expect(validateContactDraft({ name: 'A' })).toMatch(/phone/i);
  });
  it('passes when all present', () => {
    expect(validateContactDraft({
      name: 'A', phone_primary: '+1', contact_type: 'internal',
    })).toBeNull();
  });
});
