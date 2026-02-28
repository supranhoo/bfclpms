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
