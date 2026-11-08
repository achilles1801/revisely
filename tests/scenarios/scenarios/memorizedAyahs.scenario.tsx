// What is memorized, ayah by ayah, as the app reads it from the server (MEM-1, MEM-2, MEM-4): a
// partly memorized page (Firestore status 'learning' with its ayahs in `verses`) counts on Home by
// the share of the page its ayahs fill, is revised like a memorized one and named by its ayahs, and
// ayahs left on a page another build re-marked mean nothing.
// The page is written as the owner (the emulator's admin), as a phone saving ayahs would.

import bounds from '../../../src/data/ayahBounds.json';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { setServerDoc } from '../harness/serverDocs';
import { Home, homeStack } from '../harness/screens';
import { Phone } from '../harness/phone';

/** The share of page 562 that Al-Mulk 1–7 fills, worked out from the bounds file itself. */
function alMulk1to7Share(): number {
  const d = (bounds as Record<string, number[]>)['562'];
  let all = 0;
  let mine = 0;
  for (let i = 0; i < d.length; i += 6) {
    const area = (d[i + 4] - d[i + 2]) * (d[i + 5] - d[i + 3]);
    all += area;
    if (d[i] === 67 && d[i + 1] <= 7) mine += area;
  }
  return mine / all;
}

/** Home's percent, one decimal, as it is written: "3.4%". */
const percent = (pages: number) => `${(Math.round((pages / 604) * 1000) / 10).toFixed(1)}%`;
const AL_MULK_1_7 = [67001, 67002, 67003, 67004, 67005, 67006, 67007];
/** Home's words with its no-break spaces and hyphens as plain ones. */
const plain = (s: string | null) => (s ?? '').split('\u00a0').join(' ').split('\u2011').join('-');

async function account(memorized = pagesRange(1, 20)): Promise<{ phone: Phone; uid: string }> {
  setZone(ZONES.london);
  setNow('2026-11-03 20:00');
  const phone = new Phone();
  const app = await newAccount(phone, { memorized, user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  return { phone, uid };
}

describe('memorized ayahs, read from the server (MEM-1, MEM-2)', () => {
  it('[MEM-1] [MEM-2] a partly memorized page counts on Home by the share of the page its ayahs fill', async () => {
    const { phone, uid } = await account();
    await setServerDoc(`users/${uid}/pages/562`, { status: 'learning', verses: AL_MULK_1_7 });
    const share = alMulk1to7Share();
    expect(share).toBeGreaterThan(0.5);
    expect(share).toBeLessThan(0.7);
    // Whole pages alone would say 3.3% (20 pages); the page counted whole, 3.5%.
    const expected = percent(20 + share);
    expect(expected).toBe('3.4%');

    const app = await phone.open(homeStack);
    const home = new Home(app);
    await home.ready();
    await app.until(() => home.memorized()?.startsWith(expected) ?? false, `Home to say ${expected}`);
    expect(home.memorized()).toMatch(new RegExp(`^${expected.replace(".", "\\.")} of the Quran memorized`));
    const page = app.app.pages.find((p) => p.pageNumber === 562);
    expect(page).toMatchObject({ status: 'in_progress', verses: AL_MULK_1_7 });
    await app.close();
  });

  it('[MEM-1] ayahs left on a page another build marked memorized, or not memorized, mean nothing', async () => {
    const { phone, uid } = await account();
    // 1.0.3 writes a page's status and never its ayahs: they stay behind when it re-marks one.
    await setServerDoc(`users/${uid}/pages/562`, { status: 'memorized', verses: AL_MULK_1_7 });
    await setServerDoc(`users/${uid}/pages/563`, { status: 'not_memorized', verses: [67013, 67014] });

    const app = await phone.open(homeStack);
    const home = new Home(app);
    await home.ready();
    const expected = percent(21);
    await app.until(() => home.memorized()?.startsWith(expected) ?? false, `Home to say ${expected}`);
    expect(home.memorized()).toMatch(new RegExp(`^${expected.replace(".", "\\.")} of the Quran memorized`));
    await app.close();
  });

  it('[MEM-4] a partly memorized page is in the day’s revision, named by its memorized ayahs', async () => {
    // Pages 1–4 and, on the Qur'an's last page (Al-Ikhlas, Al-Falaq, An-Nas), An-Nas alone: five pages
    // at five a day, so today is all of them in page order, the last page after the first four.
    const { phone, uid } = await account(pagesRange(1, 4));
    await setServerDoc(`users/${uid}/pages/604`, { status: 'learning', verses: [114001, 114002, 114003, 114004, 114005, 114006] });

    const app = await phone.open(homeStack);
    const home = new Home(app);
    await home.ready();
    // Left out it would be "4 pages"; named by the page it would be "then Al-Ikhlas".
    await app.until(() => plain(home.detail()).startsWith('5 pages'), 'today to hold the partly memorized page');
    expect(plain(home.title())).toMatch(/^Starts at Al-Fatihah/);
    expect(plain(home.detail())).toBe('5 pages · then An-Nas');
    await app.close();
  });
});
