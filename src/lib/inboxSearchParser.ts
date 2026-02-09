/**
 * Advanced search syntax parser for inbox.
 * Supports: type:query status:open sla:overdue period:Q4
 * Remaining text becomes plain search.
 */

export interface ParsedSearch {
  plainText: string;
  type?: 'query' | 'notification';
  status?: 'open' | 'responded' | 'resolved';
  sla?: 'on-time' | 'at-risk' | 'overdue';
  period?: string;
  notificationType?: string;
}

const FIELD_PATTERNS: Record<string, RegExp> = {
  type: /\btype:(\S+)/gi,
  status: /\bstatus:(\S+)/gi,
  sla: /\bsla:(\S+)/gi,
  period: /\bperiod:(\S+)/gi,
  notiftype: /\bnotiftype:(\S+)/gi,
};

const VALID_TYPES = new Set(['query', 'notification']);
const VALID_STATUSES = new Set(['open', 'responded', 'resolved']);
const VALID_SLA = new Set(['on-time', 'at-risk', 'overdue', 'ontime', 'atrisk']);

export function parseSearchSyntax(input: string): ParsedSearch {
  let remaining = input;
  const result: ParsedSearch = { plainText: '' };

  // Extract type:
  const typeMatch = FIELD_PATTERNS.type.exec(remaining);
  FIELD_PATTERNS.type.lastIndex = 0;
  if (typeMatch) {
    const val = typeMatch[1].toLowerCase();
    if (VALID_TYPES.has(val)) {
      result.type = val as ParsedSearch['type'];
    }
    remaining = remaining.replace(typeMatch[0], '');
  }

  // Extract status:
  const statusMatch = FIELD_PATTERNS.status.exec(remaining);
  FIELD_PATTERNS.status.lastIndex = 0;
  if (statusMatch) {
    const val = statusMatch[1].toLowerCase();
    if (VALID_STATUSES.has(val)) {
      result.status = val as ParsedSearch['status'];
    }
    remaining = remaining.replace(statusMatch[0], '');
  }

  // Extract sla:
  const slaMatch = FIELD_PATTERNS.sla.exec(remaining);
  FIELD_PATTERNS.sla.lastIndex = 0;
  if (slaMatch) {
    let val = slaMatch[1].toLowerCase();
    if (val === 'ontime') val = 'on-time';
    if (val === 'atrisk') val = 'at-risk';
    if (VALID_SLA.has(val)) {
      result.sla = val as ParsedSearch['sla'];
    }
    remaining = remaining.replace(slaMatch[0], '');
  }

  // Extract period:
  const periodMatch = FIELD_PATTERNS.period.exec(remaining);
  FIELD_PATTERNS.period.lastIndex = 0;
  if (periodMatch) {
    result.period = periodMatch[1];
    remaining = remaining.replace(periodMatch[0], '');
  }

  // Extract notiftype:
  const notifMatch = FIELD_PATTERNS.notiftype.exec(remaining);
  FIELD_PATTERNS.notiftype.lastIndex = 0;
  if (notifMatch) {
    result.notificationType = notifMatch[1].toLowerCase();
    remaining = remaining.replace(notifMatch[0], '');
  }

  result.plainText = remaining.replace(/\s+/g, ' ').trim();
  return result;
}

/**
 * Check if a search string contains any advanced syntax tokens
 */
export function hasAdvancedSyntax(input: string): boolean {
  return /\b(type|status|sla|period|notiftype):\S+/i.test(input);
}
