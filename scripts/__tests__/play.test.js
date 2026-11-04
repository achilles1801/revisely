const { parseArgs, parseFraction, planPromote, planRollout, describeTracks, latestOnTrack, versionOf } = require('../play');

const internalOnly = [
  { track: 'production', releases: [] },
  { track: 'alpha', releases: [{ name: '2 (1.0.2)', versionCodes: ['2'], status: 'completed' }] },
  {
    track: 'internal',
    releases: [{ name: '3 (1.0.3)', versionCodes: ['3'], status: 'completed', releaseNotes: [{ language: 'en-US', text: 'New' }] }],
  },
];

describe('parseArgs', () => {
  it('reads positionals, valued flags and bare flags', () => {
    expect(parseArgs(['3', '--to', 'alpha', '--yes', '--rollout', '0.2'])).toEqual({ _: ['3'], to: 'alpha', yes: true, rollout: '0.2' });
  });
});

describe('parseFraction', () => {
  it.each([['0.1', 0.1], ['1', 1], [0.5, 0.5]])('accepts %p', (v, n) => expect(parseFraction(v)).toBe(n));
  it.each(['0', '-0.1', '1.5', 'half', '', true])('refuses %p', (v) => expect(() => parseFraction(v)).toThrow(/fraction/));
});

describe('planPromote', () => {
  it('moves an internal build to closed testing whole, keeping its name and notes', () => {
    expect(planPromote(internalOnly, { versionCode: 3, to: 'alpha' })).toEqual({
      from: 'internal',
      to: 'alpha',
      release: { name: '3 (1.0.3)', versionCodes: ['3'], status: 'completed', releaseNotes: [{ language: 'en-US', text: 'New' }] },
    });
  });

  it('stages production when a rollout below 1 is given', () => {
    const { release } = planPromote(internalOnly, { versionCode: 3, to: 'production', rollout: '0.2', notes: 'Hi' });
    expect(release).toMatchObject({ status: 'inProgress', userFraction: 0.2, releaseNotes: [{ language: 'en-US', text: 'Hi' }] });
  });

  it('refuses staged rollouts on testing tracks, unknown tracks and builds that are nowhere', () => {
    expect(() => planPromote(internalOnly, { versionCode: 3, to: 'alpha', rollout: '0.5' })).toThrow(/production only/);
    expect(() => planPromote(internalOnly, { versionCode: 3, to: 'qa' })).toThrow(/Unknown track/);
    expect(() => planPromote(internalOnly, { versionCode: 9, to: 'alpha' })).toThrow(/on no track/);
    expect(() => planPromote(internalOnly, { versionCode: 3, to: 'alpha', from: 'alpha' })).toThrow(/on no track named alpha/);
  });

  it('refuses a build already complete on that track', () => {
    expect(() => planPromote(internalOnly, { versionCode: 2, to: 'alpha' })).toThrow(/already on alpha/);
  });
});

describe('planRollout', () => {
  const staged = [
    {
      track: 'production',
      releases: [
        { name: '2', versionCodes: ['2'], status: 'completed' },
        { name: '3', versionCodes: ['3'], status: 'inProgress', userFraction: 0.2 },
      ],
    },
  ];

  it('widens a staged rollout and keeps the release it rolls out over', () => {
    expect(planRollout(staged, { fraction: '0.5' })).toEqual([
      { name: '2', versionCodes: ['2'], status: 'completed' },
      { name: '3', versionCodes: ['3'], status: 'inProgress', userFraction: 0.5 },
    ]);
  });

  it('completes at 1, replacing the old release', () => {
    expect(planRollout(staged, { fraction: '1' })).toEqual([{ name: '3', versionCodes: ['3'], status: 'completed' }]);
  });

  it('halts, and never narrows', () => {
    expect(planRollout(staged, { halt: true })[1].status).toBe('halted');
    expect(() => planRollout(staged, { fraction: '0.1' })).toThrow(/only widens/);
  });

  it('needs a staged release', () => {
    expect(() => planRollout(internalOnly, { fraction: '0.5' })).toThrow(/no staged rollout/);
  });
});

describe('describeTracks', () => {
  it('lists every standard track, empty ones too', () => {
    const text = describeTracks(internalOnly);
    expect(text).toContain('Internal testing (internal):\n  3 (1.0.3) — version code 3, completed');
    expect(text).toContain('Production (production):\n  nothing');
    expect(text).toContain('Open testing (beta):\n  nothing');
  });
});

describe('latestOnTrack', () => {
  it("gives a track's newest completed build with its version", () => {
    expect(latestOnTrack(internalOnly, 'internal')).toEqual({ track: 'internal', version: '1.0.3', code: 3 });
    expect(latestOnTrack(internalOnly, 'alpha')).toEqual({ track: 'alpha', version: '1.0.2', code: 2 });
    expect(latestOnTrack(internalOnly, 'production')).toBeNull();
  });

  it('skips staged, halted and draft releases, and takes the highest code', () => {
    const tracks = [
      {
        track: 'production',
        releases: [
          { name: '1.0.3', versionCodes: ['5'], status: 'completed' },
          { name: '1.0.4', versionCodes: ['7'], status: 'inProgress', userFraction: 0.2 },
          { name: '1.0.5', versionCodes: ['9'], status: 'draft' },
        ],
      },
      { track: 'internal', releases: [{ name: '1.0.4', versionCodes: ['6', '8'], status: 'completed' }] },
    ];
    expect(latestOnTrack(tracks, 'production')).toEqual({ track: 'production', version: '1.0.3', code: 5 });
    expect(latestOnTrack(tracks, 'internal')).toEqual({ track: 'internal', version: '1.0.4', code: 8 });
  });

  it('refuses an unknown track or a release with no version in its name', () => {
    expect(() => latestOnTrack(internalOnly, 'beta2')).toThrow(/Unknown track/);
    expect(() => latestOnTrack([{ track: 'internal', releases: [{ name: '5', versionCodes: ['5'], status: 'completed' }] }], 'internal')).toThrow(
      /no version/,
    );
  });

  it('versionOf reads both naming styles', () => {
    expect(versionOf('1.0.3')).toBe('1.0.3');
    expect(versionOf('5 (1.0.3)')).toBe('1.0.3');
    expect(versionOf('5')).toBeNull();
    expect(versionOf(undefined)).toBeNull();
  });
});
