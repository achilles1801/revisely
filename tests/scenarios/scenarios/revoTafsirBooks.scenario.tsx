// The books Revo answers about the Qur'an from (REVO-47, Revisely Dev; Majd, Nov 27 2026: "users can pick which tafsir
// they want with ibn kathir as the default for everyone" … "if someone let's say has ibn kathir and there's no answer for
// that verse or page or whatever then revo should ask the user if they want to see x's view on it as a backup if it
// exists"). The real Settings and revoAsk run against the emulators and the real page file for An-Naml 23–35
// (functions/test-recordings/tafsir/p379.json); only the model is a stand-in (functions/src/emulator.ts), answering each
// book's request with the reply the test gives for that book (`replies['revo-tafsir:<book>']`), cited into the documents
// the server really sent.

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester, watchFunction } from '../harness/admin';
import { getServerDoc, listServerDocs, setServerDoc } from '../harness/serverDocs';
import { Home } from '../harness/screens';
import { Phone, type Booted, type OpenApp, revoMomentSeen } from '../harness/phone';

jest.mock('../../../src/lib/variant', () => ({ ...jest.requireActual('../../../src/lib/variant'), isDevVariant: () => true }));

/** Home and the real Settings, with Revo over them. */
function stack(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
  const { ReadingTimerProvider } = req<any>('src/context/ReadingTimerContext');
  const { RevoHost } = req<any>('src/components/revo/RevoHost');
  const { navigationRef } = req<any>('src/navigation/navigationRef');
  const nav = req<{ navigation: { current: unknown } }>('./navRef');
  const Stack = createNativeStackNavigator();
  const h = React.createElement;
  const Elsewhere = () => null;
  const ref = (r: unknown) => {
    nav.navigation.current = r;
    navigationRef.current = r;
  };
  return h(
    ReadingTimerProvider,
    null,
    h(
      NavigationContainer,
      { ref },
      h(
        Stack.Navigator,
        { screenOptions: { headerShown: false, animation: 'none' } },
        h(Stack.Screen, { name: 'Dashboard', component: req<any>('src/screens/main/DashboardScreen').default }),
        h(Stack.Screen, { name: 'Settings', component: req<any>('src/screens/main/SettingsScreen').default }),
        ...['ActiveRevision', 'PlanEdit', 'PlanDayEdit', 'Activity', 'ActivityAll', 'ActivityDay', 'Memorization', 'Insights', 'QuranReader'].map((name) =>
          h(Stack.Screen, { key: name, name, component: Elsewhere }),
        ),
      ),
    ),
    h(RevoHost),
  );
}

const tap = async (app: OpenApp, testID: string) => {
  await app.until(() => app.screen.queryByTestId(testID) != null, `${testID} to show`);
  await app.act(async () => {
    app.mods.rtl.fireEvent.press(app.screen.getByTestId(testID));
  });
};

async function go(app: OpenApp, how: (nav: any) => void): Promise<void> {
  const { navigation } = app.mods.require<{ navigation: { current: any } }>('./navRef');
  await app.act(async () => {
    how(navigation.current);
  });
  await app.idle(50);
}

/** Waits for the account's Revo settings on the server to read as `pred` wants (they are written by revoSetOptions). */
async function settingsUntil(app: OpenApp, uid: string, pred: (doc: Record<string, unknown>) => boolean, what: string) {
  for (let i = 0; i < 150; i++) {
    if (pred((await getServerDoc(`coachSettings/${uid}`)) ?? {})) return;
    await app.idle(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function ask(app: OpenApp, question: string) {
  await app.act(async () => {
    app.mods.rtl.fireEvent.changeText(app.screen.getByTestId('revo-input'), question);
  });
  await tap(app, 'revo-send');
}

type Logged = { kind: string; problems: string[]; messages: { role: string; content: unknown }[]; at: number };
async function tafsirRequests(uid: string): Promise<Logged[]> {
  const docs = (await listServerDocs(`emulator/anthropic/accounts/${uid}/requests`)) as unknown as Logged[];
  return docs.filter((r) => r.kind === 'revo-tafsir').sort((a, b) => Number(a.at) - Number(b.at));
}
const titles = (r: Logged) => (r.messages[0].content as { type: string; title?: string }[]).filter((b) => b.type === 'document').map((b) => b.title);

/** A cited answer, as the API sends one: the answer, then a sentence quoting each of the first documents. */
function cited(answer: string, quotes: { said: string; doc: number; title: string }[]) {
  return {
    content: [
      { type: 'text', text: `${answer}\n\n` },
      ...quotes.map((q) => ({
        type: 'text',
        text: q.said,
        citations: [{ type: 'char_location', cited_text: '', document_index: q.doc, document_title: q.title, start_char_index: 0, end_char_index: 48 }],
      })),
    ],
  };
}
const SAADI = "Tafsir al-Sa'di";

async function account(phone: Phone): Promise<string> {
  setZone(ZONES.amman);
  setNow('2026-11-27 10:00');
  const app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);
  await setServerDoc(`coachSettings/${uid}`, { revoOn: true });
  revoMomentSeen(phone, uid);
  return uid;
}

// The question asked in Revo is about An-Naml 23–35 (the page file the emulator has).
const LOCATE = { 'revo-locate': { text: '{"about_quran":true,"ayat":[{"surah":27,"from":23,"to":35}]}' } };

it('[REVO-47] [REVO-45] Settings → Revo AI → Tafsir: Ibn Kathir until chosen, any of the four or all, never none; questions then go to the chosen books only; and In the mushaf, turned off, stays off', async () => {
  const phone = new Phone('phone');
  const uid = await account(phone);
  let app = await phone.open(stack);
  try {
    await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
    await new Home(app).ready();
    await go(app, (n) => n.navigate('Settings', { page: 'revo' }));
    await app.until(() => app.screen.queryByTestId('settings-revo-tafsir') != null, 'the Tafsir row');
    const { within } = app.mods.rtl;
    const row = () => within(app.screen.getByTestId('settings-revo-tafsir'));
    expect(row().getByText('Ibn Kathir')).toBeTruthy();

    await tap(app, 'settings-revo-tafsir');
    await app.until(() => app.screen.queryByTestId('tafsir-book-saadi') != null, 'the four books');
    const checked = (id: string) => app.screen.getByTestId(`tafsir-book-${id}`).props.accessibilityState?.checked === true;
    const kept = (books: string[]) => settingsUntil(app, uid, (d) => JSON.stringify(d.tafsirBooks) === JSON.stringify(books), `${books.join(', ')} kept`);
    expect(['all', 'ibnKathir', 'saadi', 'tabari', 'qurtubi'].map(checked)).toEqual([false, true, false, false, false]);

    await tap(app, 'tafsir-book-saadi');
    await kept(['ibnKathir', 'saadi']);
    await tap(app, 'tafsir-book-ibnKathir');
    await kept(['saadi']);
    // The last book can't be dropped.
    await tap(app, 'tafsir-book-saadi');
    await app.idle(200);
    expect(checked('saadi')).toBe(true);
    expect((await getServerDoc(`coachSettings/${uid}`))?.tafsirBooks).toEqual(['saadi']);
    // All four, then back to Ibn Kathir alone.
    await tap(app, 'tafsir-book-all');
    await kept(['tabari', 'ibnKathir', 'qurtubi', 'saadi']);
    expect(['all', 'ibnKathir', 'saadi', 'tabari', 'qurtubi'].every(checked)).toBe(true);
    await tap(app, 'tafsir-book-all');
    await kept(['ibnKathir']);
    // al-Sa'di and al-Tabari.
    await tap(app, 'tafsir-book-saadi');
    await tap(app, 'tafsir-book-tabari');
    await tap(app, 'tafsir-book-ibnKathir');
    await kept(['tabari', 'saadi']);
    await tap(app, 'tafsir-books-done');
    await app.until(() => row().queryByText('al-Sa’di, al-Tabari') != null, 'the row to name the two');

    // In the mushaf, off: kept with the account (it came back on before, Nov 27 2026).
    await app.act(async () => {
      app.mods.rtl.fireEvent(app.screen.getByTestId('revo-mushaf-switch'), 'valueChange', false);
    });
    await settingsUntil(app, uid, (d) => d.mushafOn === false, 'In the mushaf kept off');
    await app.until(() => app.screen.getByTestId('revo-mushaf-switch').props.value === false, 'the switch to stay off');

    // A question about the Qur'an goes to al-Sa'di and al-Tabari only, and their words alone are under the answer.
    await setServerDoc(`emulator/anthropic/accounts/${uid}`, {
      replies: {
        ...LOCATE,
        'revo-tafsir': cited('She sent a gift to test him.', [
          { said: 'Al-Sa’di says she wanted to test whether he was a king or a prophet.', doc: 0, title: SAADI },
          { said: 'Al-Tabari reports the same from Ibn Abbas.', doc: 1, title: 'Tafsir al-Tabari' },
        ]),
      },
    });
    await go(app, (n) => n.navigate('Dashboard'));
    await new Home(app).ready();
    await tap(app, 'revo-button');
    await app.until(() => app.screen.queryByTestId('revo-input') != null, 'the chat');
    await ask(app, 'Why did she send a gift instead of answering?');
    await app.until(() => app.screen.queryByTestId('revo-tafsir-sources') != null, 'the answer from the tafsir');
    expect(app.screen.getByTestId('revo-tafsir-source-saadi')).toBeTruthy();
    expect(app.screen.getByTestId('revo-tafsir-source-tabari')).toBeTruthy();
    expect(app.screen.queryByTestId('revo-tafsir-source-ibnKathir')).toBeNull();
    expect(app.screen.queryByTestId('revo-tafsir-source-ibnKathirEn')).toBeNull();
    const requests = await tafsirRequests(uid);
    expect(requests.map(titles)).toEqual([[SAADI, 'Tafsir al-Tabari']]);
    expect(requests.every((r) => r.problems.length === 0)).toBe(true);
  } finally {
    await app.close();
  }
});

it('[REVO-47] when the chosen book says nothing, Revo offers the first other book that does, by name; a tap shows that book’s answer at once, not counted again; with none that does, no offer', async () => {
  const phone = new Phone('phone');
  const uid = await account(phone);
  const nothing = (book: string) => ({ text: `${book} doesn’t say why she sent it.` });
  // Ibn Kathir (everyone's to start) says nothing, and neither does any other book.
  await setServerDoc(`emulator/anthropic/accounts/${uid}`, {
    replies: {
      ...LOCATE,
      'revo-tafsir:ibnKathir': nothing('Ibn Kathir'),
      'revo-tafsir:saadi': nothing('Al-Sa’di'),
      'revo-tafsir:tabari': nothing('Al-Tabari'),
      'revo-tafsir:qurtubi': nothing('Al-Qurtubi'),
    },
  });
  const asks = watchFunction('revoAsk');
  let app = await phone.open(stack);
  try {
    await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
    await new Home(app).ready();
    await tap(app, 'revo-button');
    await app.until(() => app.screen.queryByTestId('revo-input') != null, 'the chat');

    await ask(app, 'Why did she send a gift instead of answering?');
    // Its words show as they're written; the finished answer comes once the other books have been asked.
    await app.until(() => app.screen.queryByTestId('revo-streaming') == null && app.screen.queryAllByTestId('revo-answer').length === 1, 'Ibn Kathir’s answer');
    expect(app.screen.getByText(/Ibn Kathir doesn’t say why she sent it/)).toBeTruthy();
    // Each other book was asked on its own; none said anything, so nothing is offered.
    let requests = await tafsirRequests(uid);
    expect(requests[0] && titles(requests[0])).toEqual(['Tafsir Ibn Kathir', 'Tafsir Ibn Kathir (English, abridged)']);
    expect(requests.slice(1).map((r) => titles(r)[0]).sort()).toEqual([SAADI, 'Tafsir al-Qurtubi', 'Tafsir al-Tabari'].sort());
    expect(requests.slice(1).every((r) => titles(r).length === 1)).toBe(true);
    expect(app.screen.queryByTestId('revo-tafsir-offer')).toBeNull();
    expect(app.screen.queryByTestId('revo-chip-See al-Sa’di’s view')).toBeNull();

    // A follow-up: Ibn Kathir again says nothing, but al-Sa'di (and al-Qurtubi) do. Al-Sa'di comes first in the order.
    await setServerDoc(`emulator/anthropic/accounts/${uid}`, {
      replies: {
        ...LOCATE,
        'revo-tafsir:ibnKathir': nothing('Ibn Kathir'),
        'revo-tafsir:saadi': cited('She wanted to test him first.', [{ said: 'Al-Sa’di says she wanted to see whether he was a king or a prophet.', doc: 0, title: SAADI }]),
        'revo-tafsir:tabari': nothing('Al-Tabari'),
        'revo-tafsir:qurtubi': cited('She was being careful.', [{ said: 'Al-Qurtubi says it was her caution.', doc: 0, title: 'Tafsir al-Qurtubi' }]),
      },
    });
    await ask(app, 'What was she hoping for?');
    await app.until(() => app.screen.queryByTestId('revo-tafsir-offer') != null, 'the offer of another book’s view');
    expect(app.screen.getByText('Al-Sa’di does speak to this. Want to see what he says?')).toBeTruthy();
    expect(app.screen.queryByTestId('revo-chip-See al-Qurtubi’s view')).toBeNull();
    requests = await tafsirRequests(uid);
    expect(requests).toHaveLength(8);
    expect(await getServerDoc(`revoUsage/${uid}`)).toMatchObject({ day: '2026-11-27', count: 2 });

    // One tap: the question in the conversation, and al-Sa'di's answer at once, its words alone under it.
    await tap(app, 'revo-chip-See al-Sa’di’s view');
    await app.until(() => app.screen.queryByText(/She wanted to test him first/) != null, 'al-Sa’di’s answer');
    expect(app.screen.getByText('What does al-Sa’di say?')).toBeTruthy();
    expect(asks.sent[asks.sent.length - 1]).toMatchObject({ question: 'What does al-Sa’di say?', tafsirBook: 'saadi' });
    const sources = app.screen.getAllByTestId('revo-tafsir-sources');
    expect(app.mods.rtl.within(sources[sources.length - 1]).getByTestId('revo-tafsir-source-saadi')).toBeTruthy();
    expect(app.screen.queryByTestId('revo-tafsir-source-qurtubi')).toBeNull();
    // Nothing asked of the model again, and not counted again; the offer is taken.
    expect(await tafsirRequests(uid)).toHaveLength(8);
    expect(await getServerDoc(`revoUsage/${uid}`)).toMatchObject({ count: 2 });
    expect(app.screen.queryByTestId('revo-chip-See al-Sa’di’s view')).toBeNull();
  } finally {
    asks.restore();
    await app.close();
  }
});
