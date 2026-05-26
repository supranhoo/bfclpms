import { describe, it, expect } from 'vitest';
import { validateBulkRemark, BULK_REMARK_MIN_LENGTH } from './bulkCellDrawerRemarks';

describe('validateBulkRemark', () => {
  it('rejects empty string', () => {
    expect(validateBulkRemark('')).toEqual({ ok: false, trimmed: '', reason: 'empty' });
  });
  it('rejects whitespace-only', () => {
    expect(validateBulkRemark('   \n  ')).toEqual({ ok: false, trimmed: '', reason: 'empty' });
  });
  it('rejects < 10 chars after trim', () => {
    const r = validateBulkRemark('  short  ');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('too_short');
    expect(r.trimmed).toBe('short');
  });
  it('accepts >= 10 chars after trim', () => {
    const text = 'As Per Managers Feedback - Need improvement';
    const r = validateBulkRemark(`  ${text}  `);
    expect(r.ok).toBe(true);
    expect(r.trimmed).toBe(text);
    expect(r.trimmed.length).toBeGreaterThanOrEqual(BULK_REMARK_MIN_LENGTH);
  });
});