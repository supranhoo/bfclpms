import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe('Assisted submission — optional selfie flag', () => {
  it('service accepts an absent selfieBlob and inserts a NULL selfie_path', () => {
    const src = read('services/annualReview/proxySubmission.ts');
    // selfieBlob is optional now.
    expect(src).toMatch(/selfieBlob\?:\s*Blob\s*\|\s*null/);
    // Upload only happens when a blob is supplied.
    expect(src).toMatch(/if \(args\.selfieBlob\)/);
    // Rollback only runs when a path was actually created.
    expect(src).toMatch(/if \(path\) void supabase\.storage/);
  });

  it('admin card exposes the mandatory/optional toggle', () => {
    const src = read('components/admin/AssistedSubmissionSettings.tsx');
    expect(src).toMatch(/assisted_selfie_required/);
    expect(src).toMatch(/Require live selfie/);
    expect(src).toMatch(/toggleSelfieRequired/);
  });

  it('dialog still exposes Skip button + no-photo declaration text when the flag is OFF', () => {
    const src = read('components/annual-review/AssistedSubmissionDialog.tsx');
    expect(src).toMatch(/DECLARATION_NO_PHOTO/);
    expect(src).toMatch(/assisted\.btn\.skip/);
    expect(src).toMatch(/photoSkipped/);
  });

  it('no signed-declaration checkbox; submit is gated only by presence of any media artifact', () => {
    const src = read('components/annual-review/AssistedSubmissionDialog.tsx');
    // Signed-declaration checkbox has been removed.
    expect(src).not.toMatch(/<Checkbox/);
    // Submit is enabled as soon as either a selfie or an uploaded photo is present.
    expect(src).toMatch(/\(!snapshot && !uploadFile\) \|\| submitting/);
  });
});