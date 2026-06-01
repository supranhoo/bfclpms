import { describe, it, expect } from 'vitest';

// Mirror of the parser in supabase/functions/create-backup/index.ts.
// Kept in sync via the same regex; tested here because Deno fns aren't
// covered by the Vitest runtime.
function parseRetryAfterMs(errString: string | undefined): number | null {
  if (!errString) return null;
  const m = errString.match(/Retry after\s+(\d+)\s*ms/i);
  if (m) return parseInt(m[1], 10);
  const s = errString.match(/Retry after\s+(\d+)\s*s/i);
  if (s) return parseInt(s[1], 10) * 1000;
  return null;
}

describe('parseRetryAfterMs', () => {
  it('parses ms form from Supabase RateLimitError body', () => {
    expect(
      parseRetryAfterMs(
        'RateLimitError: Rate limit exceeded for trace XYZ. Retry after 30111ms.'
      )
    ).toBe(30111);
  });

  it('parses seconds form', () => {
    expect(parseRetryAfterMs('Retry after 30s')).toBe(30000);
  });

  it('returns null when no retry hint', () => {
    expect(parseRetryAfterMs('Something else went wrong')).toBeNull();
  });

  it('returns null for empty/undefined', () => {
    expect(parseRetryAfterMs(undefined)).toBeNull();
    expect(parseRetryAfterMs('')).toBeNull();
  });
});
