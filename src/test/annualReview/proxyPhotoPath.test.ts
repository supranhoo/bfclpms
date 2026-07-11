import { describe, it, expect } from 'vitest';
import { buildProxyPhotoPath } from '@/services/annualReview/proxySubmission';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('buildProxyPhotoPath', () => {
  const instanceId = '733e4c88-1cba-4a8d-8cbc-cc674ed02a3f';

  it('places the instance UUID as the FIRST path segment (RLS requirement)', () => {
    const p = buildProxyPhotoPath(instanceId, 'jpg');
    const parts = p.split('/');
    expect(parts[0]).toBe(instanceId);
    expect(UUID_RE.test(parts[0])).toBe(true);
    expect(parts[1]).toBe('photos');
    expect(parts[2]).toMatch(/^\d+\.jpg$/);
  });

  it('supports png extension', () => {
    const p = buildProxyPhotoPath(instanceId, 'png');
    expect(p.endsWith('.png')).toBe(true);
  });

  it('throws when instanceId is not a UUID (guards against "photos/" first-segment bug)', () => {
    expect(() => buildProxyPhotoPath('photos', 'jpg')).toThrow();
    expect(() => buildProxyPhotoPath('', 'jpg')).toThrow();
  });
});