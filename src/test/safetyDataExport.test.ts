import { describe, it, expect } from 'vitest';
import { rowsToCsv, getDataset, DATASETS, MAX_EXPORT_ROWS } from '@/lib/safetyDataExport';

describe('safetyDataExport', () => {
  it('escapes commas, quotes, newlines', () => {
    const csv = rowsToCsv(['a', 'b'], [{ a: 'x,y', b: 'he said "hi"\nthere' }]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('a,b');
    expect(lines[1].startsWith('"x,y",')).toBe(true);
    expect(csv).toContain('"he said ""hi""');
  });

  it('serializes nullish as empty', () => {
    const csv = rowsToCsv(['a', 'b', 'c'], [{ a: null, b: undefined, c: 0 }]);
    expect(csv.split('\n')[1]).toBe(',,0');
  });

  it('serializes objects via JSON', () => {
    const csv = rowsToCsv(['x'], [{ x: { foo: 1 } }]);
    expect(csv.split('\n')[1]).toBe('"{""foo"":1}"');
  });

  it('projects only requested columns', () => {
    const csv = rowsToCsv(['a'], [{ a: 1, b: 2 }]);
    expect(csv.split('\n')[1]).toBe('1');
  });

  it('exposes a non-empty dataset registry', () => {
    expect(DATASETS.length).toBeGreaterThan(0);
    expect(getDataset('incidents').table).toBe('safety_incidents');
    expect(MAX_EXPORT_ROWS).toBeGreaterThanOrEqual(10_000);
  });
});