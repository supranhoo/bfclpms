import { describe, it, expect } from 'vitest';
import { parseBandsBlock, splitBilingual, slugKey } from './bfclFormsWorkbook';

describe('splitBilingual', () => {
  it('splits on " / "', () => {
    expect(splitBilingual('Attendance / उपस्थिति')).toEqual({ en: 'Attendance', hi: 'उपस्थिति' });
  });
  it('returns null hi when no separator', () => {
    expect(splitBilingual('Attendance')).toEqual({ en: 'Attendance', hi: null });
  });
});

describe('parseBandsBlock', () => {
  it('parses the BFCL "5 - EN / HI\\n4 - EN / HI" format', () => {
    const raw = '5 - Always on time / हमेशा समय पर\n4 - Rarely late / शायद ही देर से\n0 - Unacceptable / अस्वीकार्य';
    const bands = parseBandsBlock(raw);
    expect(bands).toHaveLength(3);
    expect(bands[0]).toEqual({ score: 5, label_en: 'Always on time', label_hi: 'हमेशा समय पर' });
    expect(bands[2].score).toBe(0);
    // sorted high→low
    expect(bands.map((b) => b.score)).toEqual([5, 4, 0]);
  });
  it('parses the pasted Attendance & Punctuality multiline Excel cell exactly', () => {
    const raw = '5 - Always on time; zero unexcused absence; supports reliable shift continuity. / हमेशा समय पर; कोई अनधिकृत अनुपस्थिति नहीं; शिफ्ट निरंतरता में सहयोग करता है।\r4 - Consistently punctual; informs supervisor in advance for leave or delay. / लगातार समय पर; छुट्टी या देरी की सूचना पहले से सुपरवाइजर को देता है।\r3 - Generally punctual; occasional valid absence or delay with proper intimation. / सामान्यतः समय पर; उचित सूचना के साथ कभी-कभार वैध अनुपस्थिति या देरी।\r2 - Irregular attendance; needs repeated reminders to report on time or plan leave. / अनियमित उपस्थिति; समय पर आने या छुट्टी की योजना के लिए बार-बार याद दिलाना पड़ता है।\r1 - Very poor attendance; frequent late coming or absence disrupts shift planning. / बहुत खराब उपस्थिति; बार-बार देर से आना या अनुपस्थिति से शिफ्ट योजना प्रभावित होती है।\r0 - Unacceptable attendance pattern; repeated unauthorized absence or habitual late reporting. / अस्वीकार्य उपस्थिति; बार-बार अनधिकृत अनुपस्थिति या आदतन देर से रिपोर्टिंग।';
    const bands = parseBandsBlock(raw);
    expect(bands).toHaveLength(6);
    expect(bands.map((b) => b.score)).toEqual([5, 4, 3, 2, 1, 0]);
    expect(bands[0]).toEqual({
      score: 5,
      label_en: 'Always on time; zero unexcused absence; supports reliable shift continuity.',
      label_hi: 'हमेशा समय पर; कोई अनधिकृत अनुपस्थिति नहीं; शिफ्ट निरंतरता में सहयोग करता है।',
    });
    expect(bands[5]).toEqual({
      score: 0,
      label_en: 'Unacceptable attendance pattern; repeated unauthorized absence or habitual late reporting.',
      label_hi: 'अस्वीकार्य उपस्थिति; बार-बार अनधिकृत अनुपस्थिति या आदतन देर से रिपोर्टिंग।',
    });
  });
  it('handles Excel escaped carriage-return markers', () => {
    const raw = '5 - Always on time / हमेशा समय पर_x000D_4 - Rarely late / शायद ही देर से_x000D_0 - Unacceptable / अस्वीकार्य';
    expect(parseBandsBlock(raw).map((b) => b.score)).toEqual([5, 4, 0]);
  });
  it('returns [] for empty', () => {
    expect(parseBandsBlock('')).toEqual([]);
  });
});

describe('slugKey', () => {
  it('slugifies and clips', () => {
    expect(slugKey('Attendance & Punctuality')).toBe('attendance_punctuality');
  });
});