/**
 * ADR-191 / POLICY §EMAIL-SCORE-AND-PREHEADER
 *
 * Pure helpers for outbound email rendering. Kept dependency-free so they can be
 * unit tested from the app test suite (vitest) as well as used in the edge runtime.
 */

export interface FinalScoreDisplay {
  /** true when a real numeric score is available */
  hasScore: boolean;
  /** true when the KPI was explicitly marked Not Applicable */
  isNa: boolean;
  /** e.g. "4.2" — empty string when unavailable */
  scoreText: string;
  /** e.g. "Exceeds Expectations" | "Not Applicable" | "" */
  scoreLabel: string;
}

const SCORE_LABELS: Record<string, string> = {
  '5': 'Outstanding',
  '4': 'Exceeds Expectations',
  '3': 'Meets Expectations',
  '2': 'Needs Improvement',
  '1': 'Below Expectations',
  '0': 'Not Achieved',
};

/**
 * Resolve how a finalized KPI score should be presented.
 * Never renders the misleading "N/A/5" string.
 */
export function resolveFinalScoreDisplay(
  finalScore: unknown,
  isNa?: unknown,
): FinalScoreDisplay {
  if (isNa === true || isNa === 'true') {
    return { hasScore: false, isNa: true, scoreText: '', scoreLabel: 'Not Applicable' };
  }

  const numeric =
    finalScore === null || finalScore === undefined || finalScore === '' 
      ? Number.NaN
      : Number(finalScore);

  if (!Number.isFinite(numeric)) {
    return { hasScore: false, isNa: false, scoreText: '', scoreLabel: '' };
  }

  const scoreText = String(finalScore).trim();
  const rounded = String(Math.round(numeric));
  return {
    hasScore: true,
    isNa: false,
    scoreText,
    scoreLabel: SCORE_LABELS[rounded] ?? '',
  };
}

/**
 * Strip the "— Score: {{final_score}}/5" clause from a subject template when no
 * score is available, and swap in an N/A wording when the KPI is Not Applicable.
 */
export function buildFinalApprovedSubjectTemplate(
  baseSubject: string,
  display: FinalScoreDisplay,
): string {
  if (display.hasScore) return baseSubject;
  const withoutScore = baseSubject.replace(/\s*[—-]\s*Score:\s*\{\{final_score\}\}\s*\/\s*5/i, '');
  return display.isNa ? `${withoutScore} — Marked Not Applicable` : withoutScore;
}

/**
 * Remove the score line from the body template when there is no score to show.
 */
export function buildFinalApprovedBodyTemplate(
  baseBody: string,
  display: FinalScoreDisplay,
): string {
  if (display.hasScore) return baseBody;
  const replacement = display.isNa
    ? 'ℹ️ This KPI has been marked Not Applicable for this period.'
    : '';
  return baseBody
    .split('\n')
    .map((line) => (line.includes('{{final_score}}') ? replacement : line))
    .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === '' ))
    .join('\n');
}

/** Escape text for safe interpolation into HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Short summary used as the hidden preheader — this is what mail clients show as
 * the snippet line. Without it, clients fall back to the first thing in the
 * document, which is the branding logo URL (backend storage host). Never allow a
 * URL to become the preview text.
 */
export function buildPreheaderText(body: string, fallback: string): string {
  const line = body
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !/^https?:\/\//i.test(l) && !/^hi\b/i.test(l));
  const chosen = (line || fallback || '').replace(/\s+/g, ' ').trim();
  // Defensive: strip any embedded URL so no backend address can leak into the snippet.
  return chosen.replace(/https?:\/\/\S+/gi, '').trim().slice(0, 140);
}

/**
 * Plain-text alternative part. Derived from the message body only — contains no
 * logo/storage URLs.
 */
export function buildPlainTextEmail(body: string, footerText?: string): string {
  const trimmed = body.replace(/\r\n/g, '\n').trim();
  const footer = [
    'This is an automated notification from the Performance Management System.',
    footerText?.trim() || '',
  ].filter(Boolean).join('\n');
  return `${trimmed}\n\n---\n${footer}\n`;
}
