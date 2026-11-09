// A phone running the app: the real providers (AuthProvider, AppProvider and
// their offline copy and outbox), the real Firebase JS SDK against the
// emulators, and the real security rules. Only the edges of the phone are
// stand-ins: the clock (harness/clock), the network (harness/netinfo) and native
// views (harness/firebaseSetup, harness/screens).
//
// Each `open()` is a cold start: every module is loaded afresh (jest.resetModules),
// so module-level state (the outbox in memory, Firestore's memory cache, the
// update checks) starts empty, and only what the app saved on the phone
// (AsyncStorage, kept per Phone across launches) carries over. Two Phone objects
// signed in to one account are two devices: each has its own storage, and only
// the server is shared. One app is open at a time; a scenario opens one, closes
// it, then opens the other.

import { withAuthRetry } from './authRetry';
import type * as RTL from '@testing-library/react-native';
import type { ReactElement } from 'react';
import type { RevisionLog, User, UserPage } from '../../../src/types';
import { setOnline } from './netinfo';

process.env.RNTL_SKIP_AUTO_CLEANUP = 'true';

const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

/** What the scenario reads of the running app: useApp() and useAuth(), as the screens get them. */
export interface AppValue {
  user: User | null;
  pages: UserPage[];
  logs: RevisionLog[];
  loading: boolean;
  onboardingComplete: boolean;
  isAuthenticated: boolean;
  offline: boolean;
  pendingChanges: number;
  error: string | null;
  saveUser: (user: User) => Promise<void>;
  updatePages: (pages: UserPage[], changed?: number[]) => Promise<void>;
  addLog: (log: Omit<RevisionLog, 'id'>) => Promise<void>;
  updateLog: (log: RevisionLog) => Promise<void>;
  deleteLog: (id: string) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
  createDefaultUser: (overrides?: Partial<User>) => User;
  [key: string]: unknown;
}

export interface AuthValue {
  firebaseUser: { uid: string; email: string | null } | null;
  isLoading: boolean;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  [key: string]: unknown;
}

const opened = new Set<OpenApp>();

/** Closes whatever a failed scenario left open (harness/afterEnv). */
export async function closeAllPhones(): Promise<void> {
  for (const app of [...opened]) await app.close().catch(() => undefined);
}

/**
 * A fresh account address (the emulator keeps accounts until it stops). Random:
 * the scenario clock stands still, and test files run side by side.
 */
export function newEmail(tag = 'user'): string {
  const { randomUUID } = jest.requireActual<typeof import('crypto')>('crypto');
  return `${tag}-${randomUUID().slice(0, 12)}@scenario.test`;
}
export const PASSWORD = 'scenario-password';

/** AsyncStorage as the app imports it (the mock is a CommonJS object, without `default`). */
function storageOf(req: (path: string) => any): any {
  const mod = req('@react-native-async-storage/async-storage');
  return mod.default ?? mod;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * The account has seen Revo's moment on this phone (src/lib/revo/momentSeen, REVO-39), so its first open
 * of Revo goes straight to the opt-in, as before the moment. Call between a close and the next open.
 */
export function revoMomentSeen(phone: Phone, uid: string): void {
  phone.storage.set(`@revisely_revo_moment_seen:v1:${uid}`, '1');
}

export class Phone {
  /** What the app saved on this phone (AsyncStorage), kept across launches. */
  readonly storage = new Map<string, string>();
  current: OpenApp | null = null;
  online = true;
  /** The account this phone signed up with (harness/account). */
  email: string | null = null;
  /** The phone's disk (Documents, Caches): harness/fileSystem. */
  readonly folder: string;

  constructor(readonly name = 'phone') {
    const fs = jest.requireActual<typeof import('fs')>('fs');
    const os = jest.requireActual<typeof import('os')>('os');
    const path = jest.requireActual<typeof import('path')>('path');
    this.folder = fs.mkdtempSync(path.join(os.tmpdir(), `revisely-${name}-`));
    fs.mkdirSync(path.join(this.folder, 'Documents'), { recursive: true });
    fs.mkdirSync(path.join(this.folder, 'Caches'), { recursive: true });
  }

  /** Launches the app (a cold start). `screen` renders a screen of the app inside the providers. */
  async open(screen?: (mods: Booted) => ReactElement | null): Promise<OpenApp> {
    if (this.current) throw new Error(`${this.name}: the app is already open`);
    setOnline(this.online);
    const app = await OpenApp.boot(this, screen);
    this.current = app;
    return app;
  }

  /** No connection: NetInfo says so, and Firestore can't reach the server. */
  async goOffline(): Promise<void> {
    this.online = false;
    setOnline(false);
    await this.current?.firestoreNetwork(false);
  }

  async goOnline(): Promise<void> {
    this.online = true;
    await this.current?.firestoreNetwork(true);
    setOnline(true);
  }
}

/** The modules of one launch. Anything a scenario renders must come from here. */
export interface Booted {
  React: typeof import('react');
  rtl: typeof RTL;
  require: <T = any>(path: string) => T;
}

export class OpenApp {
  private ctx: { app: AppValue | null; auth: AuthValue | null } = { app: null, auth: null };
  readonly renders = { n: 0 };
  private view: RTL.RenderResult | null = null;
  private closed = false;

  private constructor(
    readonly phone: Phone,
    readonly mods: Booted,
    private readonly firebase: { app: unknown; db: unknown; auth: unknown },
  ) {}

  static async boot(phone: Phone, screen?: (mods: Booted) => ReactElement | null): Promise<OpenApp> {
    jest.resetModules();
    // The phone's disk, and nothing on screen yet.
    (globalThis as unknown as { __scenarioFsRoot?: string }).__scenarioFsRoot = phone.folder;
    (globalThis as unknown as { __scenarioPager?: unknown }).__scenarioPager = { props: null, current: null };
    const req = <T,>(path: string): T => {
      const resolved = path.startsWith('src/') ? `../../../${path}` : path;
      return require(resolved) as T;
    };

    // The phone's storage, as the app left it.
    const AsyncStorage = storageOf(req);
    await AsyncStorage.clear();
    if (phone.storage.size > 0) await AsyncStorage.multiSet([...phone.storage.entries()]);

    // src/lib/firebase starts the app's Firebase; point it at the emulators
    // before anything uses it.
    const fs = req<typeof import('firebase/firestore')>('firebase/firestore');
    const fauth = req<typeof import('firebase/auth')>('firebase/auth');
    const firebase = req<{ db: any; auth: any }>('src/lib/firebase');
    const [host, port] = FIRESTORE.split(':');
    fs.connectFirestoreEmulator(firebase.db, host, Number(port));
    fauth.connectAuthEmulator(firebase.auth, `http://${AUTH}`, { disableWarnings: true });
    if (!phone.online) await fs.disableNetwork(firebase.db);

    const React = req<typeof import('react')>('react');
    const rtl = req<typeof RTL>('@testing-library/react-native');
    const mods: Booted = { React, rtl, require: req };
    const app = new OpenApp(phone, mods, { app: firebase.db.app, db: firebase.db, auth: firebase.auth });
    opened.add(app);

    const { SafeAreaProvider } = req<any>('react-native-safe-area-context');
    const { DesignProvider } = req<any>('src/design/DesignContext');
    const { ThemeProvider } = req<any>('src/context/ThemeContext');
    const { AuthProvider, useAuth } = req<any>('src/context/AuthContext');
    const { AppProvider, useApp } = req<any>('src/context/AppContext');
    const ctx = app.ctx;
    const renders = app.renders;
    function Probe() {
      renders.n++;
      ctx.auth = useAuth();
      ctx.app = useApp();
      return null;
    }
    const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
    const h = React.createElement;
    const tree = h(
      SafeAreaProvider,
      { initialMetrics: metrics },
      h(
        DesignProvider,
        null,
        h(ThemeProvider, null, h(AuthProvider, null, h(AppProvider, null, h(Probe), screen ? screen(mods) : null))),
      ),
    );
    app.view = rtl.render(tree);
    await app.idle(10);
    // Auth restores a saved sign-in from the phone's storage first.
    await app.until(() => ctx.auth != null && !ctx.auth.isLoading, 'auth to settle');
    return app;
  }

  get app(): AppValue {
    if (!this.ctx.app) throw new Error('the app has not rendered');
    return this.ctx.app;
  }

  get auth(): AuthValue {
    if (!this.ctx.auth) throw new Error('the app has not rendered');
    return this.ctx.auth;
  }

  get screen(): RTL.RenderResult {
    if (!this.view) throw new Error('nothing rendered');
    return this.view;
  }

  get uid(): string {
    const uid = this.auth.firebaseUser?.uid;
    if (!uid) throw new Error('not signed in');
    return uid;
  }

  /** Lets the app run (real timers: listeners, the outbox, the emulators) for `ms`. */
  async idle(ms = 50): Promise<void> {
    await this.mods.rtl.act(async () => {
      await sleep(ms);
    });
  }

  /** Waits until `pred()` holds, letting the app run in between. */
  async until(pred: () => boolean, what: string, timeoutMs = 45_000): Promise<void> {
    const started = performance.now();
    for (;;) {
      let ok = false;
      try {
        ok = pred();
      } catch {
        ok = false;
      }
      if (ok) return;
      if (performance.now() - started > timeoutMs) {
        throw new Error(`${this.phone.name}: timed out waiting for ${what}\n${this.describe()}`);
      }
      await this.idle(25);
    }
  }

  /** The app's state in one line, for failure messages. */
  describe(): string {
    const a = this.ctx.app;
    const u = this.ctx.auth;
    if (!a || !u) return '(not rendered)';
    return JSON.stringify({
      renders: this.renders.n,
      signedIn: !!u.firebaseUser,
      authLoading: u.isLoading,
      user: a.user
        ? {
            anchor: a.user.scheduleAnchorDate,
            perDay: a.user.dailyPageCapacity,
            plan: a.user.customPlan?.days.length ?? 0,
            carry: a.user.carryOver ?? null,
          }
        : a.user,
      pages: a.pages.length,
      memorized: a.pages.filter((p: { status: string }) => p.status === 'memorized').length,
      logs: a.logs.length,
      loading: a.loading,
      onboardingComplete: a.onboardingComplete,
      offline: a.offline,
      pendingChanges: a.pendingChanges,
      error: a.error,
      connectionNeeded: a.connectionNeeded,
    });
  }

  /** Runs an app action (a context function) inside act, and lets it settle. */
  async act<T>(fn: () => Promise<T> | T): Promise<T> {
    let out!: T;
    await this.mods.rtl.act(async () => {
      out = await fn();
    });
    await this.idle(10);
    return out;
  }

  /** Signs up through the app (AuthContext.signUp) and waits for the account to load. */
  async signUp(email = newEmail(), name = 'Scenario'): Promise<string> {
    await this.act(() =>
      withAuthRetry(() => this.auth.signUp(email, PASSWORD, name), { ifCreated: () => this.auth.signIn(email, PASSWORD) }),
    );
    await this.until(() => !!this.ctx.app?.user && this.ctx.app.pages.length > 0, 'the new account to load');
    return email;
  }

  async signIn(email: string): Promise<void> {
    await this.act(() => withAuthRetry(() => this.auth.signIn(email, PASSWORD)));
    await this.untilLoaded();
  }

  /** The account is loaded (from the server or the phone's copy). */
  async untilLoaded(): Promise<void> {
    await this.until(() => !!this.ctx.app?.user && !this.ctx.app.loading && this.ctx.app.pages.length > 0, 'the account to load');
  }

  /** Every change made on this phone has reached the server. */
  async untilSynced(): Promise<void> {
    await this.until(() => this.app.pendingChanges === 0, 'pending changes to reach the server');
  }

  async firestoreNetwork(on: boolean): Promise<void> {
    const fs = this.mods.require<typeof import('firebase/firestore')>('firebase/firestore');
    await this.mods.rtl.act(async () => {
      await (on ? fs.enableNetwork(this.firebase.db as any) : fs.disableNetwork(this.firebase.db as any));
    });
  }

  /** The app goes to the background and comes back (AppState), as after a phone was locked. */
  async background(): Promise<void> {
    await this.setAppState('background');
  }

  async foreground(): Promise<void> {
    await this.setAppState('active');
  }

  private async setAppState(state: 'active' | 'background'): Promise<void> {
    const AppState = this.mods.require<{ default: { __emit: (s: string) => void } }>(
      'react-native/Libraries/AppState/AppState',
    ).default;
    await this.mods.rtl.act(async () => {
      AppState.__emit(state);
    });
    await this.idle(20);
  }

  /** Quits the app. What it saved on the phone stays for the next launch. */
  /** Waits until the app hasn't rendered for `quietMs` (at most `maxMs`). */
  async settle(quietMs: number, maxMs = 15_000): Promise<void> {
    const started = performance.now();
    let last = this.renders.n;
    let since = performance.now();
    while (performance.now() - started < maxMs) {
      await this.idle(50);
      if (this.renders.n !== last) {
        last = this.renders.n;
        since = performance.now();
      } else if (performance.now() - since >= quietMs) {
        return;
      }
    }
  }

  async close({ settleMs = 900 }: { settleMs?: number } = {}): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    // The copy of the account is written 400 ms after the last change
    // (AppContext's CACHE_WRITE_DELAY_MS), and every snapshot that changes it
    // starts that wait again. Closing after a fixed pause could leave an older
    // copy on a busy machine, and the next launch then began from it (Home
    // briefly with no memorized pages). So: until nothing has changed for
    // `settleMs`, at most 15 s.
    if (settleMs > 0) await this.settle(settleMs).catch(() => undefined);
    const AsyncStorage = storageOf(this.mods.require);
    await this.mods.rtl.act(async () => {
      this.view?.unmount();
    });
    const keys: string[] = await AsyncStorage.getAllKeys();
    const rows: [string, string | null][] = await AsyncStorage.multiGet(keys);
    this.phone.storage.clear();
    for (const [k, v] of rows) if (v != null) this.phone.storage.set(k, v);
    const fs = this.mods.require<typeof import('firebase/firestore')>('firebase/firestore');
    const fapp = this.mods.require<typeof import('firebase/app')>('firebase/app');
    await fs.terminate(this.firebase.db as any).catch(() => undefined);
    await fapp.deleteApp(this.firebase.app as any).catch(() => undefined);
    opened.delete(this);
    if (this.phone.current === this) this.phone.current = null;
  }
}
