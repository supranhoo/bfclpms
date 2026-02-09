import { describe, it, expect } from 'vitest';
import { parseSearchSyntax, hasAdvancedSyntax } from './inboxSearchParser';

describe('parseSearchSyntax', () => {
  it('parses plain text only', () => {
    const result = parseSearchSyntax('hello world');
    expect(result.plainText).toBe('hello world');
    expect(result.type).toBeUndefined();
  });

  it('extracts type:query', () => {
    const result = parseSearchSyntax('type:query some text');
    expect(result.type).toBe('query');
    expect(result.plainText).toBe('some text');
  });

  it('extracts status:open', () => {
    const result = parseSearchSyntax('status:open');
    expect(result.status).toBe('open');
    expect(result.plainText).toBe('');
  });

  it('extracts sla:overdue', () => {
    const result = parseSearchSyntax('sla:overdue search term');
    expect(result.sla).toBe('overdue');
    expect(result.plainText).toBe('search term');
  });

  it('normalizes sla:ontime to on-time', () => {
    const result = parseSearchSyntax('sla:ontime');
    expect(result.sla).toBe('on-time');
  });

  it('extracts multiple fields', () => {
    const result = parseSearchSyntax('type:query status:open sla:at-risk KPI name');
    expect(result.type).toBe('query');
    expect(result.status).toBe('open');
    expect(result.sla).toBe('at-risk');
    expect(result.plainText).toBe('KPI name');
  });

  it('ignores invalid values', () => {
    const result = parseSearchSyntax('type:invalid status:bad');
    expect(result.type).toBeUndefined();
    expect(result.status).toBeUndefined();
  });
});

describe('hasAdvancedSyntax', () => {
  it('detects advanced tokens', () => {
    expect(hasAdvancedSyntax('type:query hello')).toBe(true);
    expect(hasAdvancedSyntax('just text')).toBe(false);
  });
});
