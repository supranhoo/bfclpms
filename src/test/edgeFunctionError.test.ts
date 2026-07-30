import { describe, expect, it } from 'vitest';
import { extractFunctionError } from '@/lib/edgeFunctionError';

/** Minimal stand-in for the Response the SDK stores on FunctionsHttpError.context */
function makeContext(body: string) {
  const res = {
    clone: () => res,
    text: async () => body,
  } as unknown as Response;
  return res;
}

const PLACEHOLDER = 'Edge Function returned a non-2xx status code';

describe('extractFunctionError (ADR-202)', () => {
  it('returns the server error body instead of the SDK placeholder', async () => {
    const fnError = {
      message: PLACEHOLDER,
      context: makeContext(JSON.stringify({ error: "Unknown employee category: 'Non-ESI'" })),
    };
    await expect(extractFunctionError(fnError, null)).resolves.toBe(
      "Unknown employee category: 'Non-ESI'",
    );
  });

  it('reads a `message` field when `error` is absent', async () => {
    const fnError = { message: PLACEHOLDER, context: makeContext(JSON.stringify({ message: 'boom' })) };
    await expect(extractFunctionError(fnError, null)).resolves.toBe('boom');
  });

  it('falls back to raw text when the body is not JSON', async () => {
    const fnError = { message: PLACEHOLDER, context: makeContext('gateway timeout') };
    await expect(extractFunctionError(fnError, null)).resolves.toBe('gateway timeout');
  });

  it('prefers a populated fnData payload when present', async () => {
    const fnError = { message: PLACEHOLDER, context: makeContext('{}') };
    await expect(extractFunctionError(fnError, { error: 'from data' })).resolves.toBe('from data');
  });

  it('falls back to the SDK message when no body is readable', async () => {
    await expect(extractFunctionError({ message: PLACEHOLDER }, null)).resolves.toBe(PLACEHOLDER);
  });

  it('does not throw when the body has already been consumed', async () => {
    const context = {
      clone: () => { throw new Error('already consumed'); },
      text: async () => '',
    } as unknown as Response;
    await expect(extractFunctionError({ message: PLACEHOLDER, context }, null)).resolves.toBe(PLACEHOLDER);
  });

  it('returns a non-placeholder SDK message verbatim', async () => {
    await expect(extractFunctionError({ message: 'Failed to fetch' }, null)).resolves.toBe('Failed to fetch');
  });
});
