import { describe, it, expect } from 'vitest';
import {
  isOwnerKeyReady,
  addPendingOwner,
  removePendingOwner,
  buildOwnerAssignments,
  partitionOwnerFlush,
  ownerRenameCarry,
  PendingOwner,
} from './ownerAssignmentModel';

const key = { categoryId: 'cat-1', kraName: 'Production', kpiName: 'Output' };
const a: PendingOwner = { id: 'u1', label: 'Anup' };
const b: PendingOwner = { id: 'u2', label: 'Sajid' };

describe('isOwnerKeyReady', () => {
  it('requires all three parts', () => {
    expect(isOwnerKeyReady(key)).toBe(true);
    expect(isOwnerKeyReady({ ...key, kpiName: '' })).toBe(false);
    expect(isOwnerKeyReady({ ...key, kraName: '  ' })).toBe(false);
    expect(isOwnerKeyReady(null)).toBe(false);
  });
});

describe('pending list', () => {
  it('queues picks in order', () => {
    expect(addPendingOwner(addPendingOwner([], a), b)).toEqual([a, b]);
  });
  it('dedupes and ignores blanks', () => {
    expect(addPendingOwner([a], { id: 'u1', label: 'Anup dup' })).toEqual([a]);
    expect(addPendingOwner([a], { id: '', label: 'x' })).toEqual([a]);
    expect(addPendingOwner([a], { id: 'none', label: 'x' })).toEqual([a]);
  });
  it('removes by id', () => {
    expect(removePendingOwner([a, b], 'u1')).toEqual([b]);
    expect(removePendingOwner([a], 'zz')).toEqual([a]);
  });
});

describe('buildOwnerAssignments', () => {
  it('builds one payload per pick with a trimmed key', () => {
    expect(buildOwnerAssignments({ ...key, kraName: ' Production ' }, [a, b])).toEqual([
      { categoryId: 'cat-1', kraName: 'Production', kpiName: 'Output', ownerId: 'u1' },
      { categoryId: 'cat-1', kraName: 'Production', kpiName: 'Output', ownerId: 'u2' },
    ]);
  });
  it('returns nothing for an incomplete key', () => {
    expect(buildOwnerAssignments({ ...key, kpiName: '' }, [a])).toEqual([]);
  });
});

describe('partitionOwnerFlush', () => {
  it('reports a clean flush', () => {
    const out = partitionOwnerFlush([a, b], [
      { ownerId: 'u1', ok: true },
      { ownerId: 'u2', ok: true },
    ]);
    expect(out.assigned).toEqual([a, b]);
    expect(out.remaining).toEqual([]);
    expect(out.message).toBeNull();
  });
  it('keeps failures for retry and names them', () => {
    const out = partitionOwnerFlush([a, b], [
      { ownerId: 'u1', ok: true },
      { ownerId: 'u2', ok: false },
    ]);
    expect(out.assigned).toEqual([a]);
    expect(out.remaining).toEqual([b]);
    expect(out.message).toContain('Sajid');
  });
});

describe('ownerRenameCarry', () => {
  it('is not needed when nothing changed', () => {
    expect(ownerRenameCarry(key, { ...key }).needed).toBe(false);
  });
  it('is needed on a KPI or KRA rename', () => {
    expect(ownerRenameCarry(key, { ...key, kpiName: 'Output %' }).needed).toBe(true);
    expect(ownerRenameCarry(key, { ...key, kraName: 'Plant' }).needed).toBe(true);
  });
  it('never fires against an incomplete key', () => {
    expect(ownerRenameCarry(key, { ...key, kpiName: '' }).needed).toBe(false);
    expect(ownerRenameCarry({ ...key, kraName: '' }, key).needed).toBe(false);
  });
  it('exposes trimmed from/to keys', () => {
    const c = ownerRenameCarry({ ...key, kpiName: 'Output\r' }, { ...key, kpiName: ' Output % ' });
    expect(c.from.kpiName).toBe('Output');
    expect(c.to.kpiName).toBe('Output %');
  });
});
