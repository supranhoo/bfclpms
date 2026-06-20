import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression guard for the Review Journey observation attachment 404 bug.
 *
 * The `review-evidence` storage bucket is private, so any direct
 * `<a href={publicUrl}>` to a /storage/v1/object/public/review-evidence/...
 * link returns 404 in the browser. All attachment opens must go through
 * `openStorageFile()` which uses the authenticated Supabase SDK download.
 */
describe('ObservationCard evidence attachments', () => {
  const source = readFileSync(
    resolve(__dirname, '../../components/review/ObservationCard.tsx'),
    'utf8',
  );

  it('routes attachment clicks through openStorageFile', () => {
    expect(source).toMatch(/openStorageFile\(/);
    expect(source).toMatch(/buildEvidenceFileName\(/);
  });

  it('does not render raw <a href={url}> or <a href={legacyUrl}> for evidence', () => {
    expect(source).not.toMatch(/href=\{url\}/);
    expect(source).not.toMatch(/href=\{legacyUrl\}/);
  });
});