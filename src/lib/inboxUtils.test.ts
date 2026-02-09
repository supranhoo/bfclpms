import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  groupByDate,
  formatRelativeTime,
  getNotificationTypeLabel,
  getQueryStatusClasses,
  getQuickAction,
  getItemSlaStatus,
  filterInboxItems,
} from './inboxUtils';
import type { InboxItem } from './inboxUtils';

function makeItem(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: '1',
    type: 'notification',
    title: 'Test',
    message: 'Test message',
    isRead: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('groupByDate', () => {
  it('returns empty array for empty input', () => {
    expect(groupByDate([])).toEqual([]);
  });

  it('groups today items under Today', () => {
    const items = [makeItem({ createdAt: new Date().toISOString() })];
    const groups = groupByDate(items);
    expect(groups[0].label).toBe('Today');
    expect(groups[0].items).toHaveLength(1);
  });

  it('filters out empty groups', () => {
    const groups = groupByDate([makeItem({ createdAt: new Date().toISOString() })]);
    // Should only have Today, not This Week or Earlier
    expect(groups.every(g => g.items.length > 0)).toBe(true);
  });

  it('groups old items under Earlier', () => {
    const oldDate = new Date('2020-01-01').toISOString();
    const groups = groupByDate([makeItem({ createdAt: oldDate })]);
    expect(groups[0].label).toBe('Earlier');
  });
});

describe('formatRelativeTime', () => {
  it('returns string without suffix for today', () => {
    const result = formatRelativeTime(new Date().toISOString());
    expect(typeof result).toBe('string');
    expect(result).not.toContain('ago');
  });

  it('returns string with ago suffix for older dates', () => {
    const result = formatRelativeTime('2020-01-01T00:00:00Z');
    expect(result).toContain('ago');
  });
});

describe('getNotificationTypeLabel', () => {
  it('returns mapped label for known types', () => {
    expect(getNotificationTypeLabel('kpi_submitted')).toBe('KPI Submitted');
    expect(getNotificationTypeLabel('query_raised')).toBe('Query Raised');
  });

  it('returns raw type for unknown types', () => {
    expect(getNotificationTypeLabel('custom_type')).toBe('custom_type');
  });
});

describe('getQueryStatusClasses', () => {
  it('returns orange classes for open', () => {
    expect(getQueryStatusClasses('open')).toContain('orange');
  });

  it('returns amber classes for responded', () => {
    expect(getQueryStatusClasses('responded')).toContain('amber');
  });

  it('returns green classes for resolved', () => {
    expect(getQueryStatusClasses('resolved')).toContain('green');
  });
});

describe('getQuickAction', () => {
  it('returns respond for open query targeting current user', () => {
    const item = makeItem({
      type: 'query',
      queryStatus: 'open',
      toUser: { id: 'user-1', fullName: 'User', email: 'u@e.com' },
    });
    const action = getQuickAction(item, 'user-1');
    expect(action).toEqual({ type: 'respond', label: 'Respond' });
  });

  it('returns accept for responded query raised by current user', () => {
    const item = makeItem({
      type: 'query',
      queryStatus: 'responded',
      fromUser: { id: 'user-1', fullName: 'User', email: 'u@e.com' },
    });
    const action = getQuickAction(item, 'user-1');
    expect(action).toEqual({ type: 'accept', label: 'Accept' });
  });

  it('returns null for non-query items', () => {
    expect(getQuickAction(makeItem(), 'user-1')).toBeNull();
  });

  it('returns null for wrong user on open query', () => {
    const item = makeItem({
      type: 'query',
      queryStatus: 'open',
      toUser: { id: 'other', fullName: 'Other', email: 'o@e.com' },
    });
    expect(getQuickAction(item, 'user-1')).toBeNull();
  });
});

describe('getItemSlaStatus', () => {
  it('returns null for non-query items', () => {
    expect(getItemSlaStatus(makeItem())).toBeNull();
  });

  it('returns null for resolved queries', () => {
    expect(getItemSlaStatus(makeItem({ type: 'query', queryStatus: 'resolved' }))).toBeNull();
  });

  it('returns on-time for recent queries', () => {
    const result = getItemSlaStatus(makeItem({ type: 'query', queryStatus: 'open', createdAt: new Date().toISOString() }));
    expect(result).toBe('on-time');
  });

  it('returns overdue for queries older than 48 hours', () => {
    const old = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString();
    expect(getItemSlaStatus(makeItem({ type: 'query', queryStatus: 'open', createdAt: old }))).toBe('overdue');
  });

  it('returns at-risk for queries between 36-48 hours', () => {
    const atRisk = new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString();
    expect(getItemSlaStatus(makeItem({ type: 'query', queryStatus: 'open', createdAt: atRisk }))).toBe('at-risk');
  });
});

describe('filterInboxItems', () => {
  const defaultFilters = {
    search: '',
    queryStatus: 'all' as const,
    slaStatus: 'all' as const,
    notificationType: 'all' as const,
    dateRange: 'all' as const,
    readStatus: 'all' as const,
  };

  it('returns all items with default filters', () => {
    const items = [makeItem(), makeItem({ id: '2' })];
    expect(filterInboxItems(items, defaultFilters)).toHaveLength(2);
  });

  it('filters by text search', () => {
    const items = [
      makeItem({ title: 'KPI Review' }),
      makeItem({ id: '2', title: 'Query Response' }),
    ];
    const result = filterInboxItems(items, { ...defaultFilters, search: 'KPI' });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('KPI Review');
  });

  it('filters by read status', () => {
    const items = [
      makeItem({ isRead: true }),
      makeItem({ id: '2', isRead: false }),
    ];
    expect(filterInboxItems(items, { ...defaultFilters, readStatus: 'unread' })).toHaveLength(1);
    expect(filterInboxItems(items, { ...defaultFilters, readStatus: 'read' })).toHaveLength(1);
  });

  it('excludes snoozed items', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const items = [makeItem({ snoozedUntil: future })];
    expect(filterInboxItems(items, defaultFilters)).toHaveLength(0);
  });

  it('filters by notification type dropdown', () => {
    const items = [
      makeItem({ notificationType: 'kpi_submitted' }),
      makeItem({ id: '2', notificationType: 'query_raised' }),
    ];
    const result = filterInboxItems(items, { ...defaultFilters, notificationType: 'kpi_submitted' });
    expect(result).toHaveLength(1);
  });
});
