// Android's notification shade and expo-audio 1.1's lock-screen service
// (AudioControlsService), for scenarios that play a recitation. Modelled on what
// an emulator showed (Pixel 8, Android 15, Nov 4 2026), as far as the app sees it:
// - A player put on the lock screen starts the service, which shows a media
//   notification under the player's id while it runs.
// - Releasing that player, or clearing the lock screen, ends the session and the
//   notification goes. Clearing it once the service has stopped starts the
//   service with nothing to show: Android closes the app 30 s later.
// - Swiping the app away from recents pauses the player and stops the service;
//   its paused notification lands after the system took the service's away, and
//   stays (no session, can't be swiped away) until the app dismisses it.
// - expo-notifications lists them as notifications the app posted elsewhere.

type Status = Record<string, unknown>;
type Listener = (status: Status) => void;

export interface ShownMedia {
  id: number;
  title: string;
  /** Backed by a running service (buttons work). */
  session: boolean;
}

const shade = new Map<number, ShownMedia>();
let crashes: string[] = [];
/** The player the service is showing, while it runs. */
let service: FakePlayer | null = null;
let nextId = 31172694;

class FakePlayer {
  readonly id = nextId++;
  private listeners: Listener[] = [];
  private onLockScreen = false;
  private title = '';
  released = false;
  loop = false;
  volume = 1;
  shouldCorrectPitch = false;

  replace(_source: unknown) {}
  setPlaybackRate(_rate: number, _quality?: string) {}
  play() {
    this.emit({ playing: true });
  }
  pause() {
    this.emit({ playing: false });
  }
  addListener(_event: string, listener: Listener) {
    this.listeners.push(listener);
    return { remove: () => undefined };
  }
  setActiveForLockScreen(active: boolean, metadata?: { title?: string }) {
    if (active) {
      this.onLockScreen = true;
      this.title = metadata?.title ?? '';
      service = this;
      shade.set(this.id, { id: this.id, title: this.title, session: true });
      return;
    }
    if (!this.onLockScreen) return;
    if (service !== this) {
      // startForegroundService with nothing to show.
      crashes.push('ForegroundServiceDidNotStartInTimeException');
      return;
    }
    this.onLockScreen = false;
    service = null;
    shade.delete(this.id);
  }
  updateLockScreenMetadata(metadata: { title?: string }) {
    if (service !== this) return;
    this.title = metadata.title ?? this.title;
    shade.set(this.id, { id: this.id, title: this.title, session: true });
  }
  /** Android: only lets go of it. */
  remove() {}
  release() {
    this.released = true;
    if (service === this) {
      service = null;
      shade.delete(this.id);
    }
  }
  emit(status: Status) {
    const full = { playing: false, didJustFinish: false, isBuffering: false, playbackState: '', duration: 4, ...status };
    for (const l of [...this.listeners]) l(full);
  }
}

/** Stands in for expo-audio. */
export const expoAudio = {
  __esModule: true,
  createAudioPlayer: () => new FakePlayer(),
  setAudioModeAsync: async () => undefined,
  setIsAudioActiveAsync: async () => undefined,
};

const identifier = (id: number) => `expo-notifications://foreign_notifications?id=${id}`;

/** expo-notifications' side of it (the rest of its mock answers nothing). */
export const notifications = {
  getPresentedNotificationsAsync: async () =>
    [...shade.values()].map((n) => ({
      date: 0,
      request: {
        identifier: identifier(n.id),
        content: { title: n.title, data: { 'android.template': 'android.app.Notification$MediaStyle' } },
        trigger: null,
      },
    })),
  dismissNotificationAsync: async (id: string) => {
    const m = /[?&]id=(-?\d+)/.exec(id);
    if (m) shade.delete(Number(m[1]));
  },
};

/** What the scenario does to the phone, and what it sees. */
export const androidMedia = {
  reset() {
    shade.clear();
    crashes = [];
    service = null;
  },
  shown: (): ShownMedia[] => [...shade.values()],
  crashes: () => crashes,
  /** The player the notification controls, if its service runs. */
  player: () => service,
  /** Swiped away from recents (Media3's onTaskRemoved). */
  swipeAway() {
    const p = service;
    if (!p) return;
    p.emit({ playing: false });
    service = null;
    shade.set(p.id, { ...(shade.get(p.id) as ShownMedia), session: false });
  },
  /** Pause or ▶ on the notification. */
  press(button: 'pause' | 'play') {
    service?.emit({ playing: button === 'play' });
  },
  /** A notification left by an earlier run of the app. */
  leftFromBefore(title: string) {
    const id = nextId++;
    shade.set(id, { id, title, session: false });
  },
};
