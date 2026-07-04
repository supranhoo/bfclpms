import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = path.resolve(__dirname, '../..');
const migrationsDir = path.resolve(root, '../supabase/migrations');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

/**
 * Invariant: `submitted_via_proxy=true` on an annual_review_instances row is
 * only valid while the current self-response is locked & submitted. Any
 * transition that reopens the self-response (send-back to self) MUST clear
 * `submitted_via_proxy` and `proxy_submission_id`.
 *
 * Regression: manager saw "Dept Head Review Pending" for TEST003 even though
 * a dept-head had already sent the review back to the employee; the badge
 * and stepper were reading stale proxy flags left behind by send_back.
 */
describe('send-back to self clears proxy state', () => {
  it('latest send_back_annual_review_status migration nulls proxy fields when target=self', () => {
    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .reverse();
    const sendBack = files
      .map((f) => ({ f, body: fs.readFileSync(path.join(migrationsDir, f), 'utf8') }))
      .find((x) => /CREATE OR REPLACE FUNCTION[\s\S]+send_back_annual_review_status/.test(x.body));
    expect(sendBack, 'no migration defines send_back_annual_review_status').toBeTruthy();
    const body = sendBack!.body;
    // Guarded update: clear proxy state only when previous role is self.
    expect(body).toMatch(/submitted_via_proxy\s*=\s*CASE\s+WHEN\s+v_prev_role\s*=\s*'self'\s+THEN\s+false/i);
    expect(body).toMatch(/proxy_submission_id\s*=\s*CASE\s+WHEN\s+v_prev_role\s*=\s*'self'\s+THEN\s+NULL/i);
  });

  it('badge only renders when the current self-response is locked & submitted', () => {
    const src = read('components/annual-review/TeamReviewDetailContent.tsx');
    // Badge gating references the live response, not just the raw flag.
    expect(src).toMatch(/submitted_via_proxy[\s\S]{0,200}selfResponse\?\.is_locked === true[\s\S]{0,200}selfResponse\?\.submitted_at/);
  });

  it('useSendBackStatus refetches active queries so the queue reflects the new stage', () => {
    const src = read('hooks/useAnnualReview.ts');
    expect(src).toMatch(/useSendBackStatus[\s\S]{0,400}refetchQueries\(\{ queryKey: annualReviewKeys\.all, type: 'active' \}\)/);
  });
});