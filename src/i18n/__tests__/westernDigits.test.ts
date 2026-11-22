// Digits typed on an Arabic keyboard (٠–٩) or a Persian one (۰–۹) are read as 0–9 by every number field and parser,
// instead of being dropped as "not a digit".

import { westernDigits } from '../digits';
import { parseMinutesInput } from '../../lib/journal';
import { parsePageRange as memorizedRange } from '../../lib/memorizationLog';
import { parsePageRange as revisedRange } from '../../lib/manualRevision';
import { parsePageRanges } from '../../lib/readingTimer';
import { parseReference } from '../../lib/search/parseQuery';

describe('digits typed in Arabic', () => {
  it('westernDigits reads Arabic-Indic and Persian digits as 0–9 and leaves the rest', () => {
    expect(westernDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(westernDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(westernDigits('ص ٢٨٨ · 12')).toBe('ص 288 · 12');
  });

  it('the minutes field, the Memorized and Revised elsewhere ranges and the pages read read them', () => {
    expect(parseMinutesInput('٤٥')).toBe(45);
    expect(memorizedRange('٥', '٧')).toEqual([5, 6, 7]);
    expect(revisedRange('٥٤٢', '٥٤٤')).toEqual({ from: 542, to: 544 });
    // The Arabic hint's own example: «٤٥–٥٢، ٦٠», with the Arabic comma.
    expect(parsePageRanges('٤٥–٥٢، ٦٠')).toEqual([45, 46, 47, 48, 49, 50, 51, 52, 60]);
  });

  it('search reads «٢:٢٥٥» as Al-Baqarah 255, as it did', () => {
    expect(parseReference('٢:٢٥٥')[0]).toEqual({ kind: 'verse', sura: 2, ayah: 255 });
  });
});
