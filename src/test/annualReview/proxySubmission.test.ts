import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe('Assisted submission — wiring', () => {
  it('service exposes eligibility check and assisted submit', () => {
    const src = read('services/annualReview/proxySubmission.ts');
    expect(src).toMatch(/can_proxy_submit_annual_review/);
    expect(src).toMatch(/submit_annual_review_self_as_proxy/);
    expect(src).toMatch(/proxy-selfies/);
    // Upload rollback on failure
    expect(src).toMatch(/\.remove\(\[path\]\)/);
  });

  it('dialog enforces live capture + declaration before submit', () => {
    const src = read('components/annual-review/AssistedSubmissionDialog.tsx');
    // No file picker — webcam-only via getUserMedia
    expect(src).not.toMatch(/<input[^>]+type=["']file/);
    expect(src).toMatch(/getUserMedia/);
    // Submit gated on snapshot AND accepted declaration
    expect(src).toMatch(/disabled=\{!snapshot \|\| !accepted \|\| submitting\}/);
  });

  it('team page wires proxy mode only at pending_self when eligibility resolves true', () => {
    const src = read('pages/annual-review/TeamAnnualReview.tsx');
    expect(src).toMatch(/useProxyEligibility/);
    expect(src).toMatch(/AssistedSubmissionDialog/);
    expect(src).toMatch(/proxyEligible === true/);
    // Native stage role takes precedence — proxy only when none.
    expect(src).toMatch(/!stageRole && instance\.overall_status === 'pending_self'/);
  });

  it('admin settings expose the feature flag toggle', () => {
    const src = read('components/admin/AssistedSubmissionSettings.tsx');
    expect(src).toMatch(/assisted_self_submission_enabled/);
    const page = read('pages/admin/SystemSettings.tsx');
    expect(page).toMatch(/AssistedSubmissionSettings/);
  });
});