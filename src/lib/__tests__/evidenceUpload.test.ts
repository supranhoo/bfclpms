import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildEvidenceFilePath,
  isRlsDenialError,
  describeUploadFailure,
  resolveUploadIdentity,
} from '../evidenceUpload';

const getSession = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
    },
  },
}));

const makeFile = (name: string) =>
  new File(['x'], name, { type: 'image/png' });

describe('buildEvidenceFilePath', () => {
  it('prefixes the path with the supplied (session) user id', () => {
    const path = buildEvidenceFilePath({
      userId: 'uid-1',
      contextId: 'obs-9',
      folder: 'observation-replies',
      file: makeFile('My Report v2.png'),
      ext: 'png',
    });
    expect(path.startsWith('uid-1/obs-9/observation-replies/')).toBe(true);
    expect(path.endsWith('_My_Report_v2.png')).toBe(true);
  });

  it('sanitises and truncates long names', () => {
    const path = buildEvidenceFilePath({
      userId: 'u',
      contextId: 'c',
      folder: 'f',
      file: makeFile(`${'a'.repeat(80)}.png`),
      ext: 'png',
    });
    const base = path.split('/').pop()!.split('_').pop()!;
    expect(base).toBe(`${'a'.repeat(40)}.png`);
  });
});

describe('isRlsDenialError', () => {
  it('detects the storage RLS message', () => {
    expect(isRlsDenialError({ message: 'new row violates row-level security policy' })).toBe(true);
  });
  it('ignores unrelated errors', () => {
    expect(isRlsDenialError({ message: 'Network error' })).toBe(false);
  });
});

describe('describeUploadFailure', () => {
  it('maps RLS denials to a session-expiry message and keeps the raw detail', () => {
    const d = describeUploadFailure(
      { message: 'new row violates row-level security policy' },
      'a.png',
    );
    expect(d.title).toBe('Sign in again to attach files');
    expect(d.detail).toContain('row-level security');
  });

  it('passes other errors through unchanged', () => {
    const d = describeUploadFailure({ message: 'Boom' }, 'a.png');
    expect(d.title).toBe('Upload failed');
    expect(d.message).toBe('Boom');
  });
});

describe('resolveUploadIdentity', () => {
  beforeEach(() => getSession.mockReset());

  it('returns null when there is no live session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    expect(await resolveUploadIdentity('cached')).toBeNull();
  });

  it('returns the live session id and flags a mismatch with cached state', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'live' } } } });
    const identity = await resolveUploadIdentity('cached');
    expect(identity).toEqual({ id: 'live', matchesCachedUser: false });
  });

  it('flags a match when cached state agrees with the session', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'same' } } } });
    expect((await resolveUploadIdentity('same'))!.matchesCachedUser).toBe(true);
  });
});
