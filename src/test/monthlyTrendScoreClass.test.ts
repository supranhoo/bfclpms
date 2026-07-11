import { describe, it, expect } from 'vitest';
import { scoreClass } from '@/components/reports/MonthlyTrendTable';

describe('scoreClass — PIP-threshold driven', () => {
  it('null score → muted regardless of threshold', () => {
    expect(scoreClass(null, 2)).toContain('muted-foreground');
    expect(scoreClass(null, null)).toContain('muted-foreground');
  });

  it('threshold=2: below threshold is red', () => {
    expect(scoreClass(1.9, 2)).toContain('red');
  });

  it('threshold=2: exactly at threshold is not red (strict <)', () => {
    expect(scoreClass(2.0, 2)).not.toContain('red');
  });

  it('threshold=2: within 0.5 above threshold is amber', () => {
    expect(scoreClass(2.0, 2)).toContain('yellow');
    expect(scoreClass(2.4, 2)).toContain('yellow');
  });

  it('threshold=2: 0.5+ above threshold is green', () => {
    expect(scoreClass(2.5, 2)).toContain('green');
    expect(scoreClass(4.8, 2)).toContain('green');
  });

  it('falls back to legacy 3.0/4.0 bands when threshold is null', () => {
    expect(scoreClass(4.2, null)).toContain('green');
    expect(scoreClass(3.2, null)).toContain('yellow');
    expect(scoreClass(2.5, null)).toContain('red');
  });

  it('falls back to legacy bands when threshold is undefined', () => {
    expect(scoreClass(4.2)).toContain('green');
    expect(scoreClass(2.5)).toContain('red');
  });
});