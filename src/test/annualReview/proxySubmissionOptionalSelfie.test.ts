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

  it('dialog picks the no-photo declaration + Skip button when the flag is OFF', () => {
    const src = read('components/annual-review/AssistedSubmissionDialog.tsx');
    expect(src).toMatch(/assisted\.declaration\.noPhoto/);
    expect(src).toMatch(/assisted\.btn\.skip/);
    expect(src).toMatch(/photoSkipped/);
  });

  it('declaration checkbox is always tickable; only submit button gates on media', () => {
    const src = read('components/annual-review/AssistedSubmissionDialog.tsx');
    // The Checkbox block must NOT carry a disabled= prop.
    const checkboxBlock = src.match(/<Checkbox[\s\S]*?\/>/);
    expect(checkboxBlock).not.toBeNull();
    expect(checkboxBlock![0]).not.toMatch(/disabled=/);
    // Submit button still enforces media + accepted.
    expect(src).toMatch(/\(selfieRequired && !snapshot\) \|\| \(photoUploadRequired && !uploadFile\) \|\| !accepted \|\| submitting/);
  });
});