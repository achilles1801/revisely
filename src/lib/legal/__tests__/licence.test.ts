// SET-5: the Quran Muaalem License the app carries is the licence's own file, word for word, and laying it out for a
// phone changes nothing but whitespace. The AI notice the licence asks for (section 2.1(b)) covers every language the
// app's interface is offered in.
import { createHash } from 'crypto';
import { licenseLines } from '../licenseLines';
import { QML_LICENSE, QML_LICENSE_SHA256 } from '../quranMuaalemLicense';
import { NOTICE_AR, NOTICE_EN } from '../../../components/reciteCheck/ReciteCheckNotice';
import { offeredLanguages } from '../../../i18n/choice';

const words = (s: string) => s.split(/\s+/).filter(Boolean);

describe('the Quran Muaalem License (SET-5)', () => {
  it('is the file at the recorded commit, byte for byte', () => {
    expect(createHash('sha256').update(QML_LICENSE, 'utf8').digest('hex')).toBe(QML_LICENSE_SHA256);
  });

  it('runs from its title to Appendix B, Apache 2.0 in between', () => {
    expect(QML_LICENSE.trimStart().startsWith('QURAN MUAALEM LICENSE (QML)')).toBe(true);
    expect(QML_LICENSE).toContain('APPENDIX A - THE BASE LICENSE: APACHE LICENSE, VERSION 2.0');
    expect(QML_LICENSE).toContain('END OF TERMS AND CONDITIONS');
    expect(QML_LICENSE.trimEnd().endsWith('SPDX identifier for this License: LicenseRef-QML-1.0')).toBe(true);
  });

  it('laid out for a phone, keeps every word in order', () => {
    expect(words(licenseLines(QML_LICENSE).map((l) => l.text).join(' '))).toEqual(words(QML_LICENSE));
  });

  it('joins a paragraph’s lines, starts each item on its own line and centres the titles', () => {
    const lines = licenseLines(QML_LICENSE);
    const at = (start: string) => lines.find((l) => l.text.startsWith(start));
    expect(at('QURAN MUAALEM LICENSE (QML)')?.centred).toBe(true);
    expect(at('Apache License')?.centred).toBe(true);
    // A whole paragraph on one line, wrapping at the screen's width.
    expect(at('The Quran is received through oral transmission')?.text).toContain('Quran teacher.');
    // Items: (a), (i), 2.1, EN:, AR:, each opening a line.
    for (const item of ['(a) Duty.', '(i) before first use; and', '(ii) at all times afterwards', '2.1 AI ADVISORY NOTICE', 'EN: "This Quranic Teacher', 'AR: "هذا المعلّم القرآني']) {
      expect([item, at(item) != null]).toEqual([item, true]);
    }
    expect(at('(ii) at all times afterwards')?.text).toContain('an About or Help screen.');
    expect(at('(a) Duty.')!.indent).toBeGreaterThan(at('2.1 AI ADVISORY NOTICE')!.indent);
  });
});

describe('the AI notice’s languages (Quran Muaalem License 2.1(b))', () => {
  // "The notice must be shown in each language in which the Interface is offered, and always also in Arabic." The
  // notice shows English and Arabic, together, everywhere it shows; a new interface language needs its own notice
  // (the licensor's official translation, word for word) before it can be offered.
  const NOTICE_LANGUAGES = ['en', 'ar'];

  it('covers every language the app offers, in the store app and in Revisely Dev', () => {
    for (const lang of [...offeredLanguages(false), ...offeredLanguages(true)]) {
      expect([lang, NOTICE_LANGUAGES.includes(lang)]).toEqual([lang, true]);
    }
    expect(NOTICE_EN).toMatch(/artificial-intelligence model that may make mistakes/);
    expect(NOTICE_AR).toMatch(/نموذج ذكاء اصطناعي قد يخطئ/);
  });
});
