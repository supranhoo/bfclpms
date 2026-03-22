import React from 'react';

const MENTION_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g;

export interface ParsedMention {
  userId: string;
  displayName: string;
}

/**
 * Extract all @[Name](uuid) mentions from text
 */
export function parseMentions(text: string): ParsedMention[] {
  const mentions: ParsedMention[] = [];
  const seen = new Set<string>();
  let match;
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    if (!seen.has(match[2])) {
      seen.add(match[2]);
      mentions.push({ displayName: match[1], userId: match[2] });
    }
  }
  return mentions;
}

/**
 * Render mention text with styled spans for display.
 * Converts @[Name](uuid) into highlighted spans.
 */
export function renderMentionText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      React.createElement(
        'span',
        {
          key: `mention-${match.index}`,
          className: 'font-semibold text-primary',
        },
        `@${match[1]}`
      )
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

/**
 * Convert raw mention syntax to display text, stripping UUIDs.
 * e.g. "Hello @[Gaurav](uuid) world" -> "Hello @Gaurav world"
 */
export function getDisplayText(text: string): string {
  return text.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1');
}

/**
 * Insert a mention at the cursor position, replacing the @query text.
 */
export function insertMention(
  text: string,
  cursorPos: number,
  triggerStart: number,
  user: { id: string; name: string }
): { newText: string; newCursorPos: number } {
  const before = text.slice(0, triggerStart);
  const after = text.slice(cursorPos);
  const mention = `@[${user.name}](${user.id}) `;
  return {
    newText: before + mention + after,
    newCursorPos: before.length + mention.length,
  };
}

// ─── Display ↔ Raw mapping utilities ───────────────────────────────

interface MentionSegment {
  rawStart: number;
  rawEnd: number;       // exclusive
  displayStart: number;
  displayEnd: number;   // exclusive
  displayText: string;  // e.g. "@Name"
}

/**
 * Build a list of mention segments with their raw and display positions.
 */
function getMentionSegments(rawText: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  let match;
  let displayOffset = 0; // cumulative shift

  while ((match = regex.exec(rawText)) !== null) {
    const rawStart = match.index;
    const rawEnd = rawStart + match[0].length;
    const displayStr = `@${match[1]}`;
    const displayStart = rawStart - displayOffset;
    const displayEnd = displayStart + displayStr.length;
    segments.push({ rawStart, rawEnd, displayText: displayStr, displayStart, displayEnd });
    displayOffset += match[0].length - displayStr.length;
  }
  return segments;
}

/**
 * Convert a cursor position in display text to the equivalent position in raw text.
 */
export function displayPosToRawPos(rawText: string, displayPos: number): number {
  const segments = getMentionSegments(rawText);
  let offset = 0; // cumulative extra chars in raw vs display

  for (const seg of segments) {
    if (displayPos <= seg.displayStart) {
      return displayPos + offset;
    }
    if (displayPos < seg.displayEnd) {
      // Inside a mention display text — map to end of raw mention
      return seg.rawEnd;
    }
    offset += (seg.rawEnd - seg.rawStart) - (seg.displayEnd - seg.displayStart);
  }
  return displayPos + offset;
}

/**
 * Apply an edit that the user made in display-text space back to the raw text.
 *
 * We find the diff between oldDisplay and newDisplay as a single contiguous
 * edit region, map those positions back to raw-text positions, and splice.
 * If the edit region overlaps a mention, the entire mention is removed.
 */
export function applyDisplayEditToRaw(
  oldRaw: string,
  oldDisplay: string,
  newDisplay: string,
  _cursorInNew: number
): string {
  // Find common prefix length
  let prefixLen = 0;
  const minLen = Math.min(oldDisplay.length, newDisplay.length);
  while (prefixLen < minLen && oldDisplay[prefixLen] === newDisplay[prefixLen]) {
    prefixLen++;
  }

  // Find common suffix length (not overlapping with prefix)
  let suffixLen = 0;
  while (
    suffixLen < (oldDisplay.length - prefixLen) &&
    suffixLen < (newDisplay.length - prefixLen) &&
    oldDisplay[oldDisplay.length - 1 - suffixLen] === newDisplay[newDisplay.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  // The changed region in old display text
  const oldChangeStart = prefixLen;
  const oldChangeEnd = oldDisplay.length - suffixLen;

  // The replacement text from new display
  const insertedText = newDisplay.slice(prefixLen, newDisplay.length - suffixLen);

  // Map display positions to raw positions
  const segments = getMentionSegments(oldRaw);

  // Expand the change region to include any mentions that are partially overlapped
  let rawDeleteStart = displayPosToRawPos(oldRaw, oldChangeStart);
  let rawDeleteEnd = displayPosToRawPos(oldRaw, oldChangeEnd);

  // If delete start/end falls inside a mention, expand to cover the whole mention
  for (const seg of segments) {
    if (rawDeleteStart > seg.rawStart && rawDeleteStart < seg.rawEnd) {
      rawDeleteStart = seg.rawStart;
    }
    if (rawDeleteEnd > seg.rawStart && rawDeleteEnd < seg.rawEnd) {
      rawDeleteEnd = seg.rawEnd;
    }
  }

  return oldRaw.slice(0, rawDeleteStart) + insertedText + oldRaw.slice(rawDeleteEnd);
}
