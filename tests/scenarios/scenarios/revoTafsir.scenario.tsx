// Revo's answers from the tafsir (REVO-44, Revisely Dev; Majd, Nov 26 2026: "all answers MUST stem from those tafseer
// books"). The real revoAsk runs in the functions emulator against the real page file for An-Naml 23–35
// (functions/test-recordings/tafsir/p379.json); only the model is a stand-in (functions/src/emulator.ts): the step that
// finds the ayat answers An-Naml 23–35, and the answer cites the documents the server really sent.

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester, watchFunction } from '../harness/admin';
import { getServerDoc, listServerDocs, setServerDoc } from '../harness/serverDocs';
import { Home } from '../harness/screens';
import { Phone, type Booted, type OpenApp, revoMomentSeen } from '../harness/phone';

jest.mock('../../../src/lib/variant', () => ({ ...jest.requireActual('../../../src/lib/variant'), isDevVariant: () => true }));

function revoStack(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
  const Dashboard = req<any>('src/screens/main/DashboardScreen').default;
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
        h(Stack.Screen, { name: 'Dashboard', component: Dashboard }),
        ...['ActiveRevision', 'Settings', 'PlanEdit', 'PlanDayEdit', 'Activity', 'ActivityAll', 'ActivityDay', 'Memorization', 'Insights', 'QuranReader'].map(
          (name) => h(Stack.Screen, { key: name, name, component: Elsewhere }),
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

async function ask(app: OpenApp, question: string) {
  await app.act(async () => {
    app.mods.rtl.fireEvent.changeText(app.screen.getByTestId('revo-input'), question);
  });
  await tap(app, 'revo-send');
}

type Logged = { kind: string; problems: string[]; messages: { role: string; content: unknown }[] };
async function modelRequests(uid: string): Promise<Logged[]> {
  const docs = await listServerDocs(`emulator/anthropic/accounts/${uid}/requests`);
  return docs.sort((a, b) => Number(a.at) - Number(b.at)) as unknown as Logged[];
}

it('[REVO-44] a question about the Qur’an asked in Revo (Revisely Dev): the ayat are found, the answer comes only from the four tafsirs, each book’s own words under it, the passage on a tap, and it counts as a question', async () => {
  setZone(ZONES.amman);
  setNow('2026-11-26 10:00');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);
  await setServerDoc(`coachSettings/${uid}`, { revoOn: true });
  revoMomentSeen(phone, uid);
  // Where the question is: An-Naml 23–35 (the page file the emulator has). The answer is the stand-in's own.
  await setServerDoc(`emulator/anthropic/accounts/${uid}`, {
    replies: { 'revo-locate': { text: '{"about_quran":true,"ayat":[{"surah":27,"from":23,"to":35}]}' } },
  });

  const asks = watchFunction('revoAsk');
  try {
    app = await phone.open(revoStack);
    await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
    await new Home(app).ready();
    await tap(app, 'revo-button');
    await app.until(() => app.screen.queryByTestId('revo-input') != null, 'the chat');

    await ask(app, 'Why did the queen send Sulayman a gift?');
    await app.until(() => app.screen.queryByTestId('revo-tafsir-sources') != null, 'the answer from the tafsir');

    // The answer first, then each book's own words: al-Tabari's Arabic (as the book has it) with Revo's English,
    // labelled, and Ibn Kathir's own English words.
    expect(app.screen.getByText(/She was testing him\./)).toBeTruthy();
    expect(app.screen.getByText('From the tafsir')).toBeTruthy();
    expect(app.screen.getByTestId('revo-tafsir-source-tabari')).toBeTruthy();
    expect(app.screen.getByTestId('revo-tafsir-source-ibnKathirEn')).toBeTruthy();
    expect(app.screen.getByTestId('revo-tafsir-source-qurtubi')).toBeTruthy();
    expect(app.screen.getByText('إن يكن نبيا لم يقبل الهدية')).toBeTruthy();
    expect(app.screen.getByText(/“I will send him a gift befitting for one of his status/)).toBeTruthy();
    expect(app.screen.getAllByText(/Revo’s translation/).length).toBe(2);
    // al-Qurtubi's words keep the book's harakat.
    expect(app.screen.getByText('هَذَا مِنْ حُسْنِ نَظَرِهَا وَتَدْبِيرِهَا')).toBeTruthy();

    // A tap shows the passage around the words.
    expect(app.screen.queryByTestId('revo-tafsir-passage')).toBeNull();
    await tap(app, 'revo-tafsir-source-tabari');
    await app.until(() => app.screen.queryByTestId('revo-tafsir-passage') != null, 'the passage');

    // The server found the ayat, then sent the books as documents with citations on, and no structured output.
    const requests = await modelRequests(uid);
    expect(requests.map((r) => r.kind)).toEqual(['revo-locate', 'revo-tafsir']);
    expect(requests.every((r) => r.problems.length === 0)).toBe(true);
    const blocks = requests[1].messages[0].content as { type: string; title?: string; citations?: { enabled: boolean } }[];
    const docs = blocks.filter((b) => b.type === 'document');
    expect(docs.map((d) => d.title)).toEqual(['Tafsir al-Sa\'di', 'Tafsir Ibn Kathir', 'Tafsir al-Tabari', 'Tafsir al-Qurtubi', 'Tafsir Ibn Kathir (English, abridged)']);
    expect(docs.every((d) => d.citations?.enabled === true)).toBe(true);

    // It counted as one of the day's 20 questions.
    expect(asks.calls).toBe(1);
    expect(await getServerDoc(`revoUsage/${uid}`)).toMatchObject({ day: '2026-11-26', count: 1 });
  } finally {
    asks.restore();
    await app.close();
  }
});

it("[REVO-44] a question that isn't about the Qur'an is answered as before, with no tafsir", async () => {
  setZone(ZONES.amman);
  setNow('2026-11-26 10:00');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  await markPreviewTester(uid);
  await setServerDoc(`coachSettings/${uid}`, { revoOn: true });
  revoMomentSeen(phone, uid);
  try {
    app = await phone.open(revoStack);
    await new Home(app).ready();
    await tap(app, 'revo-button');
    await app.until(() => app.screen.queryByTestId('revo-input') != null, 'the chat');
    await ask(app, 'How was my week?');
    await app.until(() => app.screen.queryAllByTestId('revo-answer').length > 0, 'the answer');
    expect(app.screen.queryByTestId('revo-tafsir-sources')).toBeNull();
    // The step that finds the ayat said it isn't about the Qur'an (the stand-in's own reply), so Revo answered as always.
    expect((await modelRequests(uid)).map((r) => r.kind)).toEqual(['revo-locate', 'revo-ask']);
  } finally {
    await app.close();
  }
});
