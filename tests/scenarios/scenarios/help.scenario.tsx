// The help buttons (BEHAVIOUR.md HELP-1, HELP-2): a ? on Home's Today post opens "How Home works"; hiding
// the buttons takes them away for good on this phone, with Undo, until Settings → Support brings them back.
// Every account's since the November 2026 release: these run as App Store accounts (previewTester unset),
// except where a tester's Revo is what Ask Revo needs (Revo follows its own switch, config/app.revo).

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { ActivityDayView, flatText, Home } from '../harness/screens';
import { Phone, type Booted, type OpenApp, revoMomentSeen } from '../harness/phone';

/** Home, with the real Settings, session, Activity and day behind it (Home's stack holds them). */
function homeAndSettings(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
  const Dashboard = req<any>('src/screens/main/DashboardScreen').default;
  const Settings = req<any>('src/screens/main/SettingsScreen').default;
  const Session = req<any>('src/screens/revision/ActiveRevisionScreen').default;
  const Activity = req<any>('src/screens/activity/ActivityScreen').default;
  const ActivityDay = req<any>('src/screens/activity/ActivityDayScreen').default;
  const nav = req<{ navigation: { current: unknown } }>('./navRef');
  const { ReadingTimerProvider } = req<any>('src/context/ReadingTimerContext');
  // Revo, as MainNavigator mounts it: "Ask Revo" opens it.
  const { RevoHost } = req<any>('src/components/revo/RevoHost');
  const { navigationRef } = req<any>('src/navigation/navigationRef');
  const Stack = createNativeStackNavigator();
  const h = React.createElement;
  const Elsewhere = () => null;
  // The app's own ref (Revo reads the route from it) and the harness's (its screens use it).
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
        h(Stack.Screen, { name: 'Settings', component: Settings }),
        h(Stack.Screen, { name: 'ActiveRevision', component: Session }),
        h(Stack.Screen, { name: 'Activity', component: Activity }),
        h(Stack.Screen, { name: 'ActivityDay', component: ActivityDay }),
        ...['PlanEdit', 'PlanDayEdit', 'Memorization', 'ActivityAll', 'Insights', 'QuranReader', 'JournalEntry', 'PagesByStrength', 'ListenBack'].map(
          (name) => h(Stack.Screen, { key: name, name, component: Elsewhere }),
        ),
      ),
    ),
    h(RevoHost),
  );
}

async function account(tester: boolean, smartTracking = false): Promise<Phone> {
  setZone(ZONES.london);
  setNow('2026-11-03 19:00');
  const phone = new Phone();
  const app = await newAccount(phone, {
    memorized: pagesRange(542, 604),
    user: { dailyPageCapacity: 20, smartTrackingEnabled: smartTracking },
  });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  if (tester) await markPreviewTester(uid);
  // Ask Revo opens the opt-in here (REVO-39's moment has its own scenario).
  revoMomentSeen(phone, uid);
  return phone;
}

async function openHome(phone: Phone, tester: boolean): Promise<{ app: OpenApp; home: Home }> {
  const app = await phone.open(homeAndSettings);
  if (tester) await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  const home = new Home(app);
  await home.ready();
  return { app, home };
}

const helpButton = (app: OpenApp) => app.screen.queryByTestId('help-button-home');

async function press(app: OpenApp, testID: string): Promise<void> {
  const { fireEvent } = app.mods.rtl;
  const el = app.screen.getByTestId(testID);
  await app.act(async () => {
    fireEvent.press(el);
  });
  await app.idle(50);
}

describe('the help on Home', () => {
  it('[HELP-1] a tester’s ? on the Today post opens How Home works: four short topics, Ask Revo, Hide help buttons and Done', async () => {
    const phone = await account(true);
    const { app } = await openHome(phone, true);
    await app.until(() => helpButton(app) != null, 'the ? on the Today post');

    await press(app, 'help-button-home');
    await app.until(() => app.screen.queryByTestId('help-sheet-home') != null, 'How Home works');
    expect(app.screen.queryByText('How Home works')).not.toBeNull();
    const topics = app.screen.queryAllByTestId(/^help-topic-/).map((t) => t.props.testID);
    expect(topics).toEqual(['help-topic-home.today', 'help-topic-home.missed', 'help-topic-home.streak', 'help-topic-home.memorized']);
    // Each topic is one element for VoiceOver and TalkBack: its title, then its words, and no icon
    // glyph (iOS read the mark's font character first: "\uf539, Missed days, …").
    const labels = app.screen.queryAllByTestId(/^help-topic-/).map((t) => String(t.props.accessibilityLabel));
    expect(labels.map((l) => l.split(', ')[0])).toEqual(['Today', 'Missed days', 'Streak', 'Memorized']);
    expect(labels.filter((l) => /[\uE000-\uF8FF]/.test(l))).toEqual([]);
    const text = flatText(app.screen.getByTestId('help-sheet-home'));
    // The labels it names are the ones Home shows; no page numbers (NAME-1).
    expect(text).toContain('Jump to…');
    expect(text).toContain('Edit schedule');
    expect(text).toContain('Add to today');
    expect(text).not.toMatch(/\bp{1,2}\.\s?\d|\bpages? \d/);
    // A tester has Revo, so Ask Revo is offered; and the way to hide the buttons.
    expect(app.screen.queryByTestId('help-ask-revo')).not.toBeNull();
    expect(app.screen.queryByTestId('help-hide')).not.toBeNull();

    // Done closes it and the ? stays.
    await press(app, 'help-done');
    await app.until(() => app.screen.queryByTestId('help-sheet-home') == null, 'the sheet to close');
    expect(helpButton(app)).not.toBeNull();

    // Ask Revo opens Revo once the sheet has gone (Revo still off: its opt-in first).
    await press(app, 'help-button-home');
    await app.until(() => app.screen.queryByTestId('help-ask-revo') != null, 'Ask Revo');
    await press(app, 'help-ask-revo');
    await app.until(() => app.screen.queryByTestId('revo-turn-on') != null, 'Revo’s opt-in');
    expect(app.screen.queryByTestId('help-sheet-home')).toBeNull();
    await app.close();
  });

  it('[HELP-1] [HELP-4] an account that isn’t a tester has the ? too: How Home works, without Ask Revo while Revo is for testers', async () => {
    const phone = await account(false);
    const { app } = await openHome(phone, false);
    await app.until(() => helpButton(app) != null, 'the ? on the Today post');
    await press(app, 'help-button-home');
    await app.until(() => app.screen.queryByTestId('help-sheet-home') != null, 'How Home works');
    expect(app.screen.queryByTestId('help-ask-revo')).toBeNull();
    expect(app.screen.queryByTestId('help-hide')).not.toBeNull();
    await app.close();
  });

  it('[HELP-4] the ? is on by default: a phone with nothing stored shows it, and hiding it on one phone leaves another’s on', async () => {
    const phone = await account(false);
    const { app } = await openHome(phone, false);
    // Nothing about help on this phone, and the ? shows.
    expect([...phone.storage.keys()].filter((k) => k.startsWith('@revisely_help'))).toEqual([]);
    await app.until(() => helpButton(app) != null, 'the ? on the Today post');
    // Hidden here (the user's own choice) ...
    await press(app, 'help-button-home');
    await press(app, 'help-hide');
    await app.until(() => helpButton(app) == null, 'the ? to go');
    await app.close();

    // ... the same account on another phone, nothing stored there: on.
    const other = new Phone('other');
    const app2 = await other.open(homeAndSettings);
    await app2.signIn(phone.email!);
    await new Home(app2).ready();
    await app2.until(() => helpButton(app2) != null, 'the ? on the other phone');
    await app2.close();
  });

  it('[HELP-2] Hide help buttons takes every ? away, with Undo; hidden they stay hidden at the next launch, until Settings → Support → Help buttons', async () => {
    const phone = await account(false);
    let { app } = await openHome(phone, false);
    await app.until(() => helpButton(app) != null, 'the ? on the Today post');

    // Hidden from Home's sheet: gone at once, and Home says how to bring them back, with Undo.
    await press(app, 'help-button-home');
    await press(app, 'help-hide');
    await app.until(() => helpButton(app) == null, 'the ? to go');
    expect(flatText(app.screen.getByTestId('undo-toast-bar'))).toContain('Help buttons hidden. Settings → Support brings them back.');
    await press(app, 'undo-toast-action');
    await app.until(() => helpButton(app) != null, 'Undo to bring the ? back');

    // Hidden again, and the app closed and opened: still hidden.
    await press(app, 'help-button-home');
    await press(app, 'help-hide');
    await app.until(() => helpButton(app) == null, 'the ? to go');
    await app.close();
    ({ app } = await openHome(phone, false));
    await app.idle(300);
    expect(helpButton(app)).toBeNull();

    // Settings → Support → Help buttons: off, and turned on it brings them back.
    await press(app, 'open-settings');
    await app.until(() => app.screen.queryByTestId('settings-help-buttons') != null, 'the Help buttons switch');
    const { fireEvent } = app.mods.rtl;
    expect(app.screen.getByTestId('settings-help-buttons').props.value).toBe(false);
    await app.act(async () => {
      fireEvent(app.screen.getByTestId('settings-help-buttons'), 'valueChange', true);
    });
    await app.until(() => app.screen.getByTestId('settings-help-buttons').props.value === true, 'the switch to turn on');
    const { navigation } = app.mods.require<{ navigation: { current: { goBack: () => void } } }>('./navRef');
    await app.act(async () => {
      navigation.current.goBack();
    });
    await app.until(() => helpButton(app) != null, 'the ? back on Home');
    await app.close();
  });
});

/** The topics on the help sheet showing, by id. */
const topicIds = (app: OpenApp) =>
  app.screen.queryAllByTestId(/^help-topic-/).map((t) => String(t.props.testID).replace('help-topic-', ''));

/** Today's session, then its ⋯ → How a session works. */
async function sessionHelp(app: OpenApp, home: Home): Promise<void> {
  const session = await home.startSession();
  // The controls hide while reading; a tap on the page brings them back.
  if (!app.screen.queryByLabelText('Session menu')) await session.tapPage();
  const { fireEvent } = app.mods.rtl;
  await app.act(async () => {
    fireEvent.press(app.screen.getByLabelText('Session menu'));
  });
  await app.until(() => app.screen.queryByTestId('sheet-action-help') != null, 'How a session works in ⋯');
  await press(app, 'sheet-action-help');
  await app.until(() => app.screen.queryByTestId('help-sheet-session') != null, 'How a session works');
}

describe('the help follows Smart Tracking', () => {
  it('[HELP-1] [HELP-3] [REVO-25] a session’s ⋯ → How a session works: with Smart Tracking off, nothing about rating; no Ask Revo (no Revo in a session)', async () => {
    const phone = await account(true, false);
    const { app, home } = await openHome(phone, true);
    await app.until(() => helpButton(app) != null, 'the ? on the Today post');
    await sessionHelp(app, home);
    const ids = topicIds(app);
    expect(ids).toEqual(expect.arrayContaining(['session.marking', 'session.stopping']));
    expect(ids).not.toContain('session.rating');
    expect(flatText(app.screen.getByTestId('help-sheet-session'))).not.toMatch(/\b(rate|rated|rating|weak|strong|strength)\b/i);
    // A tester has Revo (Home's help offers it), but not in a session (Majd, Nov 8 2026).
    expect(app.screen.queryByTestId('help-hide')).not.toBeNull();
    expect(app.screen.queryByTestId('help-ask-revo')).toBeNull();
    await app.close();
  });

  it('[HELP-3] with Smart Tracking on, the session’s help says how to rate a page', async () => {
    const phone = await account(false, true);
    const { app, home } = await openHome(phone, false);
    await app.until(() => helpButton(app) != null, 'the ? on the Today post');
    await sessionHelp(app, home);
    expect(topicIds(app)).toContain('session.rating');
    expect(flatText(app.screen.getByTestId('help-sheet-session'))).toContain('Rate page strength');
    await app.close();
  });
});

describe('the help in Activity', () => {
  it('[HELP-1] [HELP-3] Activity’s ? explains the tab on show: How Activity works on Overview, How Insights work on Insights (no Weak spots without Smart Tracking)', async () => {
    const phone = await account(false, false);
    const { app } = await openHome(phone, false);
    await app.until(() => helpButton(app) != null, 'the ? on the Today post');
    await press(app, 'open-activity');
    await app.until(() => app.screen.queryByTestId('help-button-activity') != null, 'Activity’s ?');
    await press(app, 'help-button-activity');
    await app.until(() => app.screen.queryByTestId('help-sheet-activity') != null, 'How Activity works');
    expect(topicIds(app)).toEqual(['activity.calendar', 'activity.day', 'activity.adding']);
    await press(app, 'help-done');
    await app.until(() => app.screen.queryByTestId('help-sheet-activity') == null, 'the sheet to close');

    await press(app, 'pill-insights');
    await app.until(() => app.screen.queryByTestId('help-button-insights') != null, 'the ? for Insights');
    await press(app, 'help-button-insights');
    await app.until(() => app.screen.queryByTestId('help-sheet-insights') != null, 'How Insights work');
    expect(topicIds(app)).toEqual(['insights.coverage', 'insights.consistency', 'insights.pace']);
    expect(flatText(app.screen.getByTestId('help-sheet-insights'))).not.toMatch(/\b(rate|rated|rating|weak|strong|strength)\b/i);
    await app.close();
  });

  it('[HELP-1] [HELP-3] a day’s ? before +: with Smart Tracking on, the strip’s strength comes from ratings', async () => {
    const phone = await account(false, true);
    const { app } = await openHome(phone, false);
    await app.until(() => helpButton(app) != null, 'the ? on the Today post');
    await new ActivityDayView(app).open('2026-11-03');
    await app.until(() => app.screen.queryByTestId('help-button-day') != null, 'the day’s ?');
    await press(app, 'help-button-day');
    await app.until(() => app.screen.queryByTestId('help-sheet-day') != null, 'How a day works');
    expect(topicIds(app)).toEqual(['day.change', 'day.pages', 'day.adding', 'day.notes']);
    expect(flatText(app.screen.getByTestId('help-sheet-day'))).toContain('come from your ratings');
    await app.close();
  });
});
