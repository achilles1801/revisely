import { setWidgetStoreForTests, writeWidgetSnapshot } from '../widgets/storage';
import { WIDGET_SNAPSHOT_KEY, type WidgetSnapshot } from '../widgets/snapshot';
import { parseWidgetLink } from '../widgets/links';

const snapshot = (state: WidgetSnapshot['state'] = 'ready'): WidgetSnapshot => ({
  v: 1,
  state,
  accent: 'indigo',
  colors: {
    light: { accentText: '#624BD5', done: '#624BD5', onDone: '#FFFFFF', primary: '#624BD5', onPrimary: '#FFFFFF' },
    dark: { accentText: '#9789DA', done: '#624BD5', onDone: '#FFFFFF', primary: '#624BD5', onPrimary: '#FFFFFF' },
  },
  days: [],
  qibla: null,
});

function fakeStore() {
  const writes: [string, string][] = [];
  let reloads = 0;
  return {
    store: {
      set: (k: string, v: string) => writes.push([k, v]),
      reload: () => {
        reloads++;
      },
    },
    writes,
    reloads: () => reloads,
  };
}

describe('writeWidgetSnapshot', () => {
  it('writes the JSON under the one key, then reloads the widgets', () => {
    const f = fakeStore();
    setWidgetStoreForTests(f.store);
    expect(writeWidgetSnapshot(snapshot())).toBe(true);
    expect(f.writes).toEqual([[WIDGET_SNAPSHOT_KEY, JSON.stringify(snapshot())]]);
    expect(JSON.parse(f.writes[0][1])).toEqual(snapshot());
    expect(f.reloads()).toBe(1);
  });

  it('the same snapshot again writes nothing and spends no reload', () => {
    const f = fakeStore();
    setWidgetStoreForTests(f.store);
    writeWidgetSnapshot(snapshot());
    expect(writeWidgetSnapshot(snapshot())).toBe(false);
    expect(f.writes).toHaveLength(1);
    expect(f.reloads()).toBe(1);
    expect(writeWidgetSnapshot(snapshot('signedOut'))).toBe(true);
    expect(f.reloads()).toBe(2);
  });

  it('no native module (Android, tests, a build without widgets): nothing, quietly', () => {
    setWidgetStoreForTests(null);
    expect(writeWidgetSnapshot(snapshot())).toBe(false);
  });

  it('a failed write is tried again next time', () => {
    let fail = true;
    const writes: string[] = [];
    setWidgetStoreForTests({
      set: (_k, v) => {
        if (fail) throw new Error('defaults unavailable');
        writes.push(v);
      },
      reload: () => {},
    });
    expect(writeWidgetSnapshot(snapshot())).toBe(false);
    fail = false;
    expect(writeWidgetSnapshot(snapshot())).toBe(true);
    expect(writes).toHaveLength(1);
  });
});

describe('parseWidgetLink', () => {
  it('the three links the widgets open', () => {
    expect(parseWidgetLink('revisely://today')).toEqual({ kind: 'today' });
    expect(parseWidgetLink('revisely://home/')).toEqual({ kind: 'home' });
    expect(parseWidgetLink('revisely://read?page=574')).toEqual({ kind: 'read', page: 574 });
  });

  it('anything else is not ours (sign-in redirects, other schemes, bad pages)', () => {
    for (const url of [
      null,
      '',
      'revisely://',
      'revisely://settings',
      'revisely://read',
      'revisely://read?page=0',
      'revisely://read?page=605',
      'revisely://read?page=12abc',
      'https://revisely.app/today',
      'com.googleusercontent.apps.123:/oauth2redirect',
    ]) {
      expect(parseWidgetLink(url)).toBeNull();
    }
  });
});
