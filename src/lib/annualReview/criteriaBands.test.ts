import { describe, it, expect } from 'vitest';
import {
  parseScoringBands, bandsToOptions, bandsToBilingualOptions,
  optionsToBands, defaultLadder,
} from './criteriaBands';

describe('parseScoringBands', () => {
  it('parses label_en/label_hi shape', () => {
    const r = parseScoringBands([
      { score: 5, label_en: 'Outstanding', label_hi: 'उत्कृष्ट' },
      { score: 3, label_en: 'OK' },
    ] as never);
    expect(r).toHaveLength(2);
    expect(r[0].score).toBe(5);
    expect(r[0].label_hi).toBe('उत्कृष्ट');
  });

  it('splits "EN / HI" combined label', () => {
    const r = parseScoringBands([{ score: 4, label: 'Good / अच्छा' }] as never);
    expect(r[0].label_en).toBe('Good');
    expect(r[0].label_hi).toBe('अच्छा');
  });

  it('returns [] for malformed input', () => {
    expect(parseScoringBands(null)).toEqual([]);
    expect(parseScoringBands('junk' as never)).toEqual([]);
  });
});

describe('bandsToOptions', () => {
  it('produces exactly maxScore+1 buttons even with sparse bands', () => {
    const opts = bandsToOptions(
      [{ score: 5, label_en: 'Top' }, { score: 0, label_en: 'None' }] as never,
      5,
    );
    expect(opts).toHaveLength(6);
    expect(opts.map((o) => o.score)).toEqual([5, 4, 3, 2, 1, 0]);
    expect(opts[0].label).toBe('Top');
    expect(opts[5].label).toBe('None');
    // Interior scores fall back to default ladder text
    expect(opts[1].label).toBe('Above target');
  });

  it('drops bands outside the 0..max range', () => {
    const opts = bandsToOptions(
      [{ score: 8, label_en: 'Ignored' }, { score: 3, label_en: 'Kept' }] as never,
      5,
    );
    expect(opts.every((o) => o.score >= 0 && o.score <= 5)).toBe(true);
    expect(opts.find((o) => o.score === 3)?.label).toBe('Kept');
  });

  it('falls back to default ladder when bands are empty', () => {
    const opts = bandsToOptions(null, 5);
    expect(opts).toHaveLength(6);
    expect(opts[0].label).toBe('Outstanding');
  });
});

describe('bandsToBilingualOptions', () => {
  it('carries label_hi through to options', () => {
    const opts = bandsToBilingualOptions(
      [{ score: 5, label_en: 'Top', label_hi: 'शीर्ष' }] as never,
      5,
    );
    expect(opts[0].label_hi).toBe('शीर्ष');
  });

  it('does not replace complete imported Excel labels with generic default labels', () => {
    const opts = bandsToBilingualOptions(
      [
        { score: 5, label_en: 'Always on time; zero unexcused absence; supports reliable shift continuity.', label_hi: 'हमेशा समय पर; कोई अनधिकृत अनुपस्थिति नहीं; शिफ्ट निरंतरता में सहयोग करता है।' },
        { score: 4, label_en: 'Consistently punctual; informs supervisor in advance for leave or delay.', label_hi: 'लगातार समय पर; छुट्टी या देरी की सूचना पहले से सुपरवाइजर को देता है।' },
        { score: 3, label_en: 'Generally punctual; occasional valid absence or delay with proper intimation.', label_hi: 'सामान्यतः समय पर; उचित सूचना के साथ कभी-कभार वैध अनुपस्थिति या देरी।' },
        { score: 2, label_en: 'Irregular attendance; needs repeated reminders to report on time or plan leave.', label_hi: 'अनियमित उपस्थिति; समय पर आने या छुट्टी की योजना के लिए बार-बार याद दिलाना पड़ता है।' },
        { score: 1, label_en: 'Very poor attendance; frequent late coming or absence disrupts shift planning.', label_hi: 'बहुत खराब उपस्थिति; बार-बार देर से आना या अनुपस्थिति से शिफ्ट योजना प्रभावित होती है।' },
        { score: 0, label_en: 'Unacceptable attendance pattern; repeated unauthorized absence or habitual late reporting.', label_hi: 'अस्वीकार्य उपस्थिति; बार-बार अनधिकृत अनुपस्थिति या आदतन देर से रिपोर्टिंग।' },
      ] as never,
      5,
    );
    expect(opts.map((o) => o.label)).not.toContain('Outstanding');
    expect(opts[0].label).toMatch(/Always on time/);
    expect(opts[5].label_hi).toMatch(/अस्वीकार्य उपस्थिति/);
  });
});

describe('optionsToBands / defaultLadder round-trip', () => {
  it('round-trips through parse', () => {
    const ladder = defaultLadder(5);
    const json = optionsToBands(ladder);
    const parsed = parseScoringBands(json);
    expect(parsed).toHaveLength(6);
    expect(parsed[0].score).toBe(5);
  });
});