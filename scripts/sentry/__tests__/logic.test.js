const {
  marker,
  findTracked,
  trackedSentryId,
  sanitize,
  fenced,
  safe,
  issueTitle,
  issueBody,
  eventDetails,
  sessionsByRelease,
  updateHealth,
  parseBar,
  gate,
  productionAlerts,
  dailyReport,
} = require('../logic');

const issue = {
  id: '7472682057',
  shortId: 'REACT-NATIVE-6',
  title: 'FirebaseError: Missing or insufficient permissions.',
  culprit: 'recreateUserDocIfMissing(src/lib/userDoc)',
  permalink: 'https://revisely.sentry.io/issues/7472682057/',
  count: '41',
  userCount: 13,
  firstSeen: '2026-05-11T06:11:44Z',
  lastSeen: '2026-10-24T12:37:17Z',
  substatus: 'regressed',
  level: 'error',
};
const event = {
  release: 'com.revisionbuddy.app@1.0.1+14',
  environment: 'production',
  tags: [
    { key: 'release', value: 'com.revisionbuddy.app@1.0.1+14' },
    { key: 'environment', value: 'production' },
    { key: 'device', value: 'iPad15,7' },
    { key: 'os', value: 'iOS 27.0.1' },
    { key: 'user', value: 'id:T3stUid0000000000000000000a1' },
  ],
  user: { id: 'T3stUid0000000000000000000a1', ip_address: '203.0.113.7', geo: { city: 'Testville' } },
  contexts: { ota_updates: { update_id: 'e58fdbea', is_embedded_launch: true, runtime_version: '2e08c17f' } },
  entries: [
    {
      type: 'exception',
      data: {
        values: [
          {
            type: 'FirebaseError',
            value: 'Missing or insufficient permissions.',
            stacktrace: {
              frames: [
                { function: 'node_internal', filename: 'node_modules/x.js', lineNo: 1, inApp: false },
                { function: 'createUser', filename: 'src/services/firestoreService.ts', lineNo: 140, inApp: true },
                { function: 'recreate', filename: 'src/context/AppContext.tsx', lineNo: 230, inApp: true },
              ],
            },
          },
        ],
      },
    },
    { type: 'breadcrumbs', data: { values: [{ message: 'user typed their email someone@example.com' }] } },
  ],
};

describe('Sentry → GitHub issues', () => {
  it('finds the GitHub issue already tracking a Sentry issue by its marker', () => {
    const gh = [
      { number: 3, body: `x ${marker('1')}` },
      { number: 4, body: `y ${marker('7472682057')}` },
      { number: 5, body: marker('7472682057'), pull_request: {} },
    ];
    expect(findTracked(gh, '7472682057').number).toBe(4);
    expect(findTracked(gh, '9')).toBeNull();
  });

  it('titles and describes the issue with what is needed to fix it', () => {
    expect(issueTitle(issue)).toBe('[Sentry] REACT-NATIVE-6: FirebaseError: Missing or insufficient permissions.');
    const body = issueBody(issue, event);
    expect(body).toContain(marker('7472682057'));
    expect(body).toContain('Regressed');
    expect(body).toContain('`com.revisionbuddy.app@1.0.1+14`');
    expect(body).toContain('e58fdbea (built-in)');
    expect(body).toContain('FirebaseError: Missing or insufficient permissions.');
    // In-app frames only, innermost first.
    expect(body.indexOf('recreate (src/context/AppContext.tsx:230)')).toBeLessThan(body.indexOf('createUser (src/services/firestoreService.ts:140)'));
    expect(body).not.toContain('node_internal');
  });

  it('never puts personal data in the public issue (user id, IP, location, breadcrumbs)', () => {
    const body = issueBody(issue, event);
    expect(body).not.toContain('T3stUid0000000000000000000a1');
    expect(body).not.toContain('203.0.113.7');
    expect(body).not.toContain('Testville');
    expect(body).not.toContain('someone@example.com');
  });

  it('copes with an issue whose latest event could not be fetched', () => {
    expect(issueBody({ ...issue, substatus: 'new' }, null)).toContain('**New**');
  });

  it('reads the Sentry id back from an issue body', () => {
    expect(trackedSentryId(`x\n${marker('7472682057')}\ny`)).toBe('7472682057');
    expect(trackedSentryId('<!-- sentry-issue:abc -->')).toBeNull();
    expect(trackedSentryId(undefined)).toBeNull();
  });
});

describe('sanitize (event text is untrusted; issues are public)', () => {
  it('redacts emails, users/<id> paths, uid-like ids and IP addresses', () => {
    const t = sanitize(
      'No document to update: projects/p/databases/(default)/documents/users/T3stUid0000000000000000000a1 for a.b+c@example.co.uk from 203.0.113.7 and 2001:db8:85a3:0:0:8a2e:370:7334, id 4f3Kq9ZpL2mN8xR1tY6wB0vC',
    );
    expect(t).toContain('documents/users/<id>');
    expect(t).not.toContain('T3stUid0000000000000000000a1');
    expect(t).toContain('<email>');
    expect(t).not.toContain('example.co.uk');
    expect(t).not.toContain('203.0.113.7');
    expect(t).not.toContain('8a2e');
    expect(t).not.toContain('4f3Kq9ZpL2mN8xR1tY6wB0vC');
  });

  it('keeps ordinary error text and code names readable', () => {
    expect(sanitize('FirebaseError: Missing or insufficient permissions.')).toBe('FirebaseError: Missing or insufficient permissions.');
    expect(sanitize('recreateUserDocIfMissing (src/lib/userDoc.ts:12) v1.0.2')).toBe('recreateUserDocIfMissing (src/lib/userDoc.ts:12) v1.0.2');
  });

  it('neutralizes mentions, references, links, images and code fences', () => {
    const t = sanitize('hey @achilles1801 see owner/repo#12 [click](https://evil.example) ![x](https://evil.example/p.png) ```end``` `x`');
    expect(t).not.toMatch(/@[a-z]/);
    expect(t).not.toMatch(/#\d/);
    expect(t).not.toContain('](');
    expect(t).not.toContain('evil.example');
    expect(t).not.toContain('`');
    expect(t).toContain('click');
  });

  it('removes control and invisible characters, collapses whitespace and caps the length', () => {
    expect(sanitize('a\u0000b\u202ec\n\n d')).toBe('a b c d');
    expect(sanitize('x'.repeat(500), { max: 50 })).toHaveLength(50);
    expect(sanitize(null)).toBe('');
    expect(sanitize('line 1\nline 2', { multiline: true })).toBe('line 1\nline 2');
  });

  it('fences text so it cannot break out of the block', () => {
    const f = fenced('Error: ```\n# Heading\n@someone');
    expect(f.startsWith('```text\n')).toBe(true);
    expect(f.endsWith('\n```')).toBe(true);
    expect(f.split('```')).toHaveLength(3);
  });

  it('accepts short values only when they look like what the app sends', () => {
    expect(safe('com.revisionbuddy.app@1.0.1+14', 'release')).toBe('com.revisionbuddy.app@1.0.1+14');
    expect(safe('1.0 | [x](http://e)', 'release')).toBe('—');
    expect(safe('iPad15,7', 'label')).toBe('iPad15,7');
    expect(safe('<img src=x>', 'label')).toBe('—');
    expect(safe('https://revisely.sentry.io/issues/7472682057/', 'link')).toBe('https://revisely.sentry.io/issues/7472682057/');
    expect(safe('https://evil.example/issues/1/', 'link', null)).toBeNull();
    expect(safe({}, 'token')).toBe('—');
  });

  it('keeps a forged event from putting links, mentions or markup into the issue', () => {
    const forged = {
      ...issue,
      title: 'Error @achilles1801 [login](https://phish.example) `x`',
      culprit: 'a`b',
      permalink: 'https://phish.example/',
      count: 'lots',
    };
    const ev = {
      tags: [
        { key: 'release', value: 'x | <b>y</b>' },
        { key: 'device', value: '[a](https://phish.example)' },
      ],
      entries: [{ type: 'exception', data: { values: [{ type: 'E', value: '```\n@achilles1801 owner@example.com' }] } }],
    };
    const body = issueBody(forged, ev);
    const title = issueTitle(forged);
    for (const t of [body, title]) {
      expect(t).not.toContain('phish.example');
      expect(t).not.toMatch(/@[a-z]/);
    }
    expect(body).toContain('(link unavailable)');
    expect(body).toContain('· 0 events');
    expect(body).not.toContain('<b>');
    expect(body).not.toContain('owner@example.com');
    // One fenced block, opened and closed once (backticks in the event can't add more).
    expect(body.match(/```/g)).toHaveLength(2);
  });
});

describe('event details for the fix job', () => {
  it('keeps the exception, frames and breadcrumbs, sanitized, and drops personal data', () => {
    const d = eventDetails({
      ...event,
      eventID: 'abc123',
      contexts: { ...event.contexts, app: { app_version: '1.0.1', device_app_hash: 'x' } },
      request: { url: 'https://x' },
      entries: [
        ...event.entries.slice(0, 1),
        {
          type: 'breadcrumbs',
          data: {
            values: [
              { timestamp: '2026-10-24T12:37:17Z', category: 'navigation', message: 'opened users/T3stUid0000000000000000000a1' },
              { category: 'http', data: { url: 'https://api.example/x', email: 'a@b.co', status_code: 403 } },
            ],
          },
        },
      ],
    });
    const json = JSON.stringify(d);
    expect(d.exception[0].frames).toHaveLength(3);
    expect(d.exception[0].value).toBe('Missing or insufficient permissions.');
    expect(d.tags).toMatchObject({ release: 'com.revisionbuddy.app@1.0.1+14', device: 'iPad15,7' });
    expect(d.tags.user).toBeUndefined();
    expect(d.ota_updates).toMatchObject({ update_id: 'e58fdbea' });
    expect(d.breadcrumbs[0]).toContain('users/<id>');
    expect(d.breadcrumbs[1]).toContain('403');
    for (const secret of ['T3stUid0000000000000000000a1', '203.0.113.7', 'Testville', 'a@b.co', 'someone@example.com']) {
      expect(json).not.toContain(secret);
    }
    expect(json).not.toContain('request');
  });

  it('copes with an empty or odd event', () => {
    expect(eventDetails(null)).toMatchObject({ exception: [], breadcrumbs: [] });
    expect(eventDetails({ entries: [{ type: 'exception', data: { values: [{ stacktrace: { frames: [{ lineNo: 'x' }] } }] } }] }).exception[0].frames[0].line).toBeNull();
  });
});

const sessions = {
  groups: [
    { by: { release: 'com.revisionbuddy.app@1.0.2+19.u84b0091f', 'session.status': 'healthy' }, totals: { 'sum(session)': 9, 'count_unique(user)': 1 } },
    { by: { release: 'com.revisionbuddy.app@1.0.2+19.u84b0091f', 'session.status': 'crashed' }, totals: { 'sum(session)': 1, 'count_unique(user)': 1 } },
    { by: { release: 'com.revisionbuddy.app@1.0.2+20.u84b0091f', 'session.status': 'healthy' }, totals: { 'sum(session)': 10, 'count_unique(user)': 1 } },
    { by: { release: 'com.revisionbuddy.app@1.0.2+19.ue55e24c2', 'session.status': 'healthy' }, totals: { 'sum(session)': 4, 'count_unique(user)': 1 } },
    { by: { release: 'com.revisionbuddy.app@1.0.1+14', 'session.status': 'healthy' }, totals: { 'sum(session)': 950, 'count_unique(user)': 40 } },
    { by: { release: 'com.revisionbuddy.app@1.0.1+14', 'session.status': 'crashed' }, totals: { 'sum(session)': 50, 'count_unique(user)': 5 } },
  ],
};

describe('release health', () => {
  const releases = sessionsByRelease(sessions);

  it('sums sessions and crashes per release', () => {
    const r = releases.find((x) => x.release === 'com.revisionbuddy.app@1.0.1+14');
    expect(r).toMatchObject({ sessions: 1000, crashed: 50, users: 40 });
    expect(r.crashFree).toBeCloseTo(0.95);
  });

  it('adds up one update group across builds, and only that group', () => {
    const h = updateHealth(releases, '84b0091f-17b0-402b-985a-a5270bc27a51');
    expect(h).toMatchObject({ sessions: 20, crashed: 1 });
    expect(h.crashFree).toBeCloseTo(0.95);
    expect(h.releases).toHaveLength(2);
    expect(updateHealth(releases, 'nope').sessions).toBe(0);
  });

  it('refuses promotion below the bar or without enough sessions, and allows it above', () => {
    const bar = { minSessions: 5, minCrashFree: 0.99 };
    expect(gate(updateHealth(releases, '84b0091f'), bar)).toMatchObject({ ok: false });
    expect(gate(updateHealth(releases, '84b0091f'), bar).reason).toMatch(/95\.0%/);
    expect(gate(updateHealth(releases, 'e55e24c2'), bar)).toMatchObject({ ok: false });
    expect(gate(updateHealth(releases, 'e55e24c2'), bar).reason).toMatch(/Only 4 preview session/);
    expect(gate(updateHealth(releases, 'e55e24c2'), { ...bar, minSessions: 3 })).toMatchObject({ ok: true });
  });

  it('reads the bar from the environment and refuses anything that is not a number in range', () => {
    expect(parseBar({})).toEqual({ minSessions: 5, minCrashFree: 0.99 });
    expect(parseBar({ MIN_SESSIONS: '', MIN_CRASH_FREE: ' ' })).toEqual({ minSessions: 5, minCrashFree: 0.99 });
    expect(parseBar({ MIN_SESSIONS: '0', MIN_CRASH_FREE: '0.95' })).toEqual({ minSessions: 0, minCrashFree: 0.95 });
    expect(() => parseBar({ MIN_SESSIONS: 'five' })).toThrow(/MIN_SESSIONS/);
    expect(() => parseBar({ MIN_CRASH_FREE: '99%' })).toThrow(/MIN_CRASH_FREE/);
    expect(() => parseBar({ MIN_CRASH_FREE: '99' })).toThrow(/MIN_CRASH_FREE/);
    expect(() => parseBar({ MIN_SESSIONS: '-1' })).toThrow(/MIN_SESSIONS/);
  });

  it('never passes on a bar that is not a number, and says so when the minimum is 0 with no sessions', () => {
    const none = updateHealth(releases, 'nope');
    expect(gate(none, { minSessions: NaN, minCrashFree: 0.99 }).ok).toBe(false);
    expect(gate(none, { minSessions: 5, minCrashFree: NaN }).ok).toBe(false);
    expect(gate(none, { minSessions: 5, minCrashFree: 0.99 }).ok).toBe(false);
    expect(gate(none, { minSessions: 0, minCrashFree: 0.99 })).toMatchObject({ ok: true, reason: expect.stringMatching(/No preview sessions/) });
  });

  it('alerts on production releases below the bar that have enough sessions', () => {
    expect(productionAlerts(releases, { minSessions: 50, minCrashFree: 0.99 }).map((r) => r.release)).toEqual([
      'com.revisionbuddy.app@1.0.1+14',
    ]);
    expect(productionAlerts(releases, { minSessions: 5000, minCrashFree: 0.99 })).toEqual([]);
  });

  it('writes the daily report with the alert first and mentions the owner', () => {
    const md = dailyReport({
      date: '2026-10-25',
      newIssues: [issue],
      regressed: [],
      top: [issue],
      feedback: [],
      production: releases.filter((r) => !r.release.includes('.u')),
      preview: releases.filter((r) => r.release.includes('.u')),
      alerts: productionAlerts(releases, { minSessions: 50, minCrashFree: 0.99 }),
      mention: '@achilles1801',
    });
    expect(md).toContain('## App health · 2026-10-25');
    expect(md).toContain('@achilles1801 ⚠️ **1 production release(s) below the crash-free bar.**');
    expect(md).toContain('| `1.0.1+14` | 1000 | 95.0% | 50 | 40 |');
    expect(md).toContain('### Regressed (0)');
    expect(md).toContain('- [REACT-NATIVE-6](https://revisely.sentry.io/issues/7472682057/) `FirebaseError: Missing or insufficient permissions.`');
  });

  it('shows forged issue titles and release names inertly in the daily report', () => {
    const md = dailyReport({
      date: '2026-10-25',
      newIssues: [{ ...issue, title: '@achilles1801 <img src=x> [a](https://phish.example)', permalink: 'javascript:alert(1)' }],
      regressed: [],
      top: [],
      feedback: [],
      production: [{ release: 'x | y', sessions: 1, crashed: 0, users: 1, crashFree: 1 }],
      preview: [],
      alerts: [],
    });
    expect(md).not.toContain('phish.example');
    expect(md).not.toContain('javascript:');
    expect(md).not.toMatch(/@[a-z]/);
    expect(md).toContain('- REACT-NATIVE-6 `');
    expect(md).toContain('| `—` | 1 |');
  });
});
