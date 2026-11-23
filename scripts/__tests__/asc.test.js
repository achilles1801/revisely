const fs = require('fs');
const os = require('os');
const path = require('path');
const { LIMITS, parseArgs, listingFile, readListing, checkLimits, whatsNewText, localePlan, describeChanges, checkAll } = require('../asc');

const ISOLATES = /[⁦-⁩]/g;

describe('parseArgs', () => {
  it('reads the command, valued flags and bare flags', () => {
    expect(parseArgs(['listing', '--locale', 'ar-SA', '--dry', '--whats-new-form', 'minor'])).toEqual({
      _: ['listing'], locale: 'ar-SA', dry: true, 'whats-new-form': 'minor',
    });
  });
});

describe('listing files', () => {
  it('en-US is store/listing.json, and a locale is store/listing.<locale>.json', () => {
    expect(path.basename(listingFile(undefined))).toBe('listing.json');
    expect(path.basename(listingFile('en-US'))).toBe('listing.json');
    expect(path.basename(listingFile('ar-SA'))).toBe('listing.ar-SA.json');
    expect(() => listingFile('../secrets')).toThrow(/locale/);
  });

  it('every listing in store/ fits the limits', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    expect(checkAll()).toBe(0);
    log.mockRestore();
  });

  it('en-US has no name, so its name is never written', () => {
    const plan = localePlan(readListing(), undefined);
    expect(plan.info).not.toHaveProperty('name');
  });
});

describe('checkLimits', () => {
  it('refuses text over a limit and never cuts it', () => {
    const L = { name: 'x'.repeat(31), subtitle: 'ok', description: 'y'.repeat(4001), whatsNew: { minor: 'fine', feature: 'z'.repeat(4001) } };
    const before = JSON.stringify(L);
    expect(checkLimits(L)).toEqual([
      'name: 31 characters, the limit is 30',
      'description: 4001 characters, the limit is 4000',
      'whatsNew.feature: 4001 characters, the limit is 4000',
    ]);
    expect(JSON.stringify(L)).toBe(before);
  });

  it('holds keywords to 100 characters and to 100 UTF-8 bytes', () => {
    const arabic = 'حفظ'.repeat(17); // 51 characters, 102 bytes
    expect(checkLimits({ keywords: arabic })).toEqual(['keywords: 102 bytes, the limit is 100']);
    expect(checkLimits({ keywords: 'k'.repeat(101) })).toEqual(['keywords: 101 characters, the limit is 100', 'keywords: 101 bytes, the limit is 100']);
    expect(Buffer.byteLength(readListing('ar-SA').keywords, 'utf8')).toBeLessThanOrEqual(100);
  });

  it('knows every limit App Store Connect sets on these fields', () => {
    expect(LIMITS).toEqual({ name: 30, subtitle: 30, promotionalText: 170, keywords: 100, description: 4000, whatsNew: 4000 });
  });
});

describe("What's New", () => {
  const L = { whatsNew: { minor: 'Small fixes and improvements.', feature: 'New: Mark mistakes.' } };
  it('needs the form picked when the file has both', () => {
    expect(() => whatsNewText(L)).toThrow(/--whats-new-form/);
    expect(whatsNewText(L, 'minor')).toBe('Small fixes and improvements.');
    expect(whatsNewText(L, 'feature')).toBe('New: Mark mistakes.');
    expect(() => whatsNewText(L, 'major')).toThrow(/No What's New form/);
  });
  it('takes one text as it is, and leaves it out when there is none', () => {
    expect(whatsNewText({ whatsNew: 'One text' })).toBe('One text');
    expect(whatsNewText({})).toBeUndefined();
    expect(localePlan({ subtitle: 's' }).version).not.toHaveProperty('whatsNew');
  });
  it('every new locale has both forms', () => {
    for (const locale of ['en-GB', 'ar-SA', 'id']) expect(Object.keys(readListing(locale).whatsNew).sort()).toEqual(['feature', 'minor']);
  });
});

describe('the Arabic keeps its isolate marks', () => {
  it('through the read, the request body and a round trip', () => {
    const file = fs.readFileSync(listingFile('ar-SA'), 'utf8');
    const marks = file.match(ISOLATES) ?? [];
    expect(marks.length).toBeGreaterThan(0);
    const L = readListing('ar-SA');
    expect((JSON.stringify(L).match(ISOLATES) ?? []).length).toBe(marks.length);
    expect((L.description.match(ISOLATES) ?? []).length).toBeGreaterThan(0);
    const plan = localePlan(L, 'feature');
    const body = JSON.stringify({ data: { type: 'appStoreVersionLocalizations', attributes: { locale: 'ar-SA', ...plan.version } } });
    const back = JSON.parse(body).data.attributes;
    expect(back.description).toBe(L.description);
    expect(back.whatsNew).toBe(L.whatsNew.feature);
    expect((back.description + back.whatsNew).match(ISOLATES)).toEqual((L.description + L.whatsNew.feature).match(ISOLATES));

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asc-'));
    fs.writeFileSync(path.join(dir, 'listing.ar-SA.json'), JSON.stringify(L, null, 2));
    expect(readListing('ar-SA', dir)).toEqual(L);
  });
});

describe('en-GB is the en-US listing with British spelling only', () => {
  // The approved swaps (Majd, Nov 21 2026). A US change at submission fails this until the GB copy has it too.
  const british = (s) => s.replace(/\b([Mm])emoriz(e|ed|ation)\b/g, '$1emoris$2');
  const us = readListing();
  const gb = readListing('en-GB');
  it.each(['subtitle', 'promotionalText', 'keywords', 'description', 'supportUrl', 'marketingUrl', 'privacyPolicyUrl'])('%s', (field) => {
    expect(gb[field]).toBe(british(us[field]));
  });
  it('keeps the app\'s name', () => expect(gb.name).toBe('Revisely'));
});

describe('describeChanges (the dry run)', () => {
  it('says what would be created, changed or left', () => {
    expect(describeChanges('Version localization', null, { keywords: 'a,b' })).toEqual([
      'Version localization: would be created',
      '  keywords: (empty) → "a,b" (3 characters)',
    ]);
    expect(describeChanges('App info localization', { subtitle: 'Same', name: 'Old' }, { subtitle: 'Same', name: 'New' })).toEqual([
      'App info localization:',
      '  subtitle: unchanged',
      '  name: "Old" (3 characters) → "New" (3 characters)',
    ]);
  });
});
