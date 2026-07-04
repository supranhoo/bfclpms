import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stageForReviewer, type StageReviewerInstance } from './stageForReviewer';

const base: StageReviewerInstance = {
  overall_status: 'pending_self',
  manager_id: 'M', skip_id: 'S', dept_head_id: 'D', bu_head_id: 'B', hr_id: 'H',
};

describe('stageForReviewer', () => {
  it('maps every pending_* status to its reviewer role', () => {
    expect(stageForReviewer({ ...base, overall_status: 'pending_manager' }, 'M')).toBe('manager');
    expect(stageForReviewer({ ...base, overall_status: 'pending_skip' }, 'S')).toBe('skip_manager');
    expect(stageForReviewer({ ...base, overall_status: 'pending_dept' }, 'D')).toBe('dept_head');
    expect(stageForReviewer({ ...base, overall_status: 'pending_bu' }, 'B')).toBe('bu_head');
    expect(stageForReviewer({ ...base, overall_status: 'pending_hr' }, 'H')).toBe('hr');
  });

  it('returns null when the uid does not match the stage slot', () => {
    expect(stageForReviewer({ ...base, overall_status: 'pending_dept' }, 'someone-else')).toBeNull();
    expect(stageForReviewer({ ...base, overall_status: 'pending_manager' }, 'D')).toBeNull();
  });

  it('returns null for terminal / self / unknown statuses', () => {
    expect(stageForReviewer({ ...base, overall_status: 'pending_self' }, 'M')).toBeNull();
    expect(stageForReviewer({ ...base, overall_status: 'completed' }, 'M')).toBeNull();
  });

  it('returns null for empty uid', () => {
    expect(stageForReviewer({ ...base, overall_status: 'pending_dept' }, null)).toBeNull();
    expect(stageForReviewer({ ...base, overall_status: 'pending_dept' }, undefined)).toBeNull();
  });
});

/**
 * Contract test: every reviewer id slot referenced by the app-layer `.or(...)`
 * queue predicate MUST also appear in the RLS SELECT policy on
 * `annual_review_instances`. Regression guard for the dept_head visibility bug
 * (DOCUMENTATION.md v2.66.75) where the app queried `dept_head_id` but the RLS
 * policy silently filtered the row out. Any new reviewer slot MUST be added to
 * BOTH the service predicate AND the latest RLS migration in the same change.
 */
describe('reviewer visibility SSOT (app query ↔ RLS)', () => {
  const REVIEWER_ID_SLOTS = [
    'manager_id', 'skip_id', 'dept_head_id', 'bu_head_id', 'hr_id',
  ] as const;

  it('service .or() predicate covers every reviewer id slot', () => {
    const svc = readFileSync(
      resolve(__dirname, '../../services/annualReview/annualReviewService.ts'),
      'utf8',
    );
    for (const slot of REVIEWER_ID_SLOTS) {
      expect(svc, `service predicate missing ${slot}`).toContain(`${slot}.eq.`);
    }
  });

  it('RLS policy on annual_review_instances covers every reviewer id slot', async () => {
    const { readdirSync } = await import('node:fs');
    const dir = resolve(__dirname, '../../../supabase/migrations');
    const bodies = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(resolve(dir, f), 'utf8'))
      .filter((b) =>
        b.includes('instances_select_visible') && b.includes('annual_review_instances'),
      );
    expect(bodies.length, 'no migration defines instances_select_visible').toBeGreaterThan(0);
    for (const slot of REVIEWER_ID_SLOTS) {
      const covered = bodies.some((b) => b.includes(`${slot}`) && b.includes('auth.uid()'));
      expect(covered, `latest RLS SELECT policy missing reviewer slot ${slot}`).toBe(true);
    }
  });
});