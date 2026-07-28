import { describe, it, expect } from 'vitest';
import {
  resolveFinalScoreDisplay,
  buildFinalApprovedSubjectTemplate,
  buildFinalApprovedBodyTemplate,
  buildPreheaderText,
  buildPlainTextEmail,
} from '../../supabase/functions/send-email-notification/emailFormat';

const SUBJECT = '[PMS] 🎉 Your KPI Has Been Finalized — Score: {{final_score}}/5';
const BODY = `Hi {{recipient_name}},

Congratulations! Your KPI has received final approval and is now complete.

✅ Final Approved Score: {{final_score}} / 5 — {{score_label}}

KRA: {{kra_name}}`;

describe('ADR-191 final score email formatting', () => {
  it('renders a numeric score with its label', () => {
    const d = resolveFinalScoreDisplay(4.2, false);
    expect(d).toMatchObject({ hasScore: true, isNa: false, scoreText: '4.2', scoreLabel: 'Exceeds Expectations' });
    expect(buildFinalApprovedSubjectTemplate(SUBJECT, d)).toBe(SUBJECT);
    expect(buildFinalApprovedBodyTemplate(BODY, d)).toBe(BODY);
  });

  it('handles integer and zero scores', () => {
    expect(resolveFinalScoreDisplay(5).scoreLabel).toBe('Outstanding');
    expect(resolveFinalScoreDisplay(0).scoreLabel).toBe('Not Achieved');
    expect(resolveFinalScoreDisplay(0).hasScore).toBe(true);
  });

  it('never emits "N/A/5" when the score is missing', () => {
    const d = resolveFinalScoreDisplay(null, false);
    expect(d.hasScore).toBe(false);
    const subject = buildFinalApprovedSubjectTemplate(SUBJECT, d);
    expect(subject).not.toContain('final_score');
    expect(subject).not.toMatch(/N\/A/);
    expect(subject).toBe('[PMS] 🎉 Your KPI Has Been Finalized');
    expect(buildFinalApprovedBodyTemplate(BODY, d)).not.toContain('{{final_score}}');
  });

  it('states Not Applicable for N/A KPIs', () => {
    const d = resolveFinalScoreDisplay(null, true);
    expect(d.isNa).toBe(true);
    expect(buildFinalApprovedSubjectTemplate(SUBJECT, d)).toBe('[PMS] 🎉 Your KPI Has Been Finalized — Marked Not Applicable');
    expect(buildFinalApprovedBodyTemplate(BODY, d)).toContain('marked Not Applicable');
  });

  it('treats non-numeric payloads as missing', () => {
    expect(resolveFinalScoreDisplay('abc').hasScore).toBe(false);
    expect(resolveFinalScoreDisplay('').hasScore).toBe(false);
    expect(resolveFinalScoreDisplay(undefined).hasScore).toBe(false);
  });
});

describe('ADR-191 preheader and plain-text', () => {
  it('picks a human summary and never a URL', () => {
    const body = 'Hi Jaspal,\n\nYour KPI has received final approval and is now complete.';
    const pre = buildPreheaderText(body, 'KPI Finalized');
    expect(pre).toBe('Your KPI has received final approval and is now complete.');
    expect(pre).not.toMatch(/https?:\/\//);
  });

  it('strips any embedded URL from the preheader', () => {
    const pre = buildPreheaderText('See https://example.supabase.co/storage/v1/x now', 'Notification');
    expect(pre).not.toMatch(/supabase\.co/);
  });

  it('falls back to the event title when the body has no usable line', () => {
    expect(buildPreheaderText('\n\n', 'KPI Finalized')).toBe('KPI Finalized');
  });

  it('builds a plain-text part with no logo URL', () => {
    const text = buildPlainTextEmail('Hi Jaspal,\n\nDone.', 'BFCL Alloys');
    expect(text).toContain('Hi Jaspal,');
    expect(text).toContain('BFCL Alloys');
    expect(text).not.toMatch(/https?:\/\//);
  });
});
