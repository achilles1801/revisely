import { describeRelease, diagnosticLines, releaseTags, sentryReports, shortUpdate, ReleaseInput } from '../releaseInfo';

const base: ReleaseInput = {
  version: '1.0.2',
  build: '19',
  runtimeVersion: 'b576e0107b9d56bb0645b8baed5c257bf037cb15',
  channel: 'preview',
  updateId: '01a1574f-56c7-72e5-ae37-91f7dd0d6a2a',
  updateGroup: '84b0091f-17b0-402b-985a-a5270bc27a51',
  isEmbeddedLaunch: false,
  isEmergencyLaunch: false,
  emergencyLaunchReason: null,
  updateCreatedAt: new Date('2026-10-25T04:16:53Z'),
  isDev: false,
  isDevice: true,
};

describe('releaseInfo', () => {
  it('names the release by build and update group, so crash-free rates come out per update', () => {
    const r = describeRelease(base);
    expect(r.sentryRelease).toBe('com.revisionbuddy.app@1.0.2+19.u84b0091f');
    expect(r.sentryEnvironment).toBe('preview');
    expect(r.sentryDist).toBe('19');
    expect(r.versionLabel).toBe('1.0.2 (19)');
  });

  it('the built-in bundle keeps the plain release (as before)', () => {
    const r = describeRelease({ ...base, isEmbeddedLaunch: true, channel: 'production' });
    expect(r.sentryRelease).toBe('com.revisionbuddy.app@1.0.2+19');
    expect(r.updateShort).toBeNull();
    expect(r.sentryEnvironment).toBe('production');
  });

  it('falls back to the update id when the manifest has no group, and to development in dev', () => {
    expect(describeRelease({ ...base, updateGroup: null }).updateShort).toBe('01a1574f');
    expect(describeRelease({ ...base, isDev: true }).sentryEnvironment).toBe('development');
    expect(describeRelease({ ...base, channel: null }).sentryEnvironment).toBe('production');
  });

  it('reports to Sentry only from installed builds: a real device on production or preview', () => {
    expect(describeRelease(base).sentryEnabled).toBe(true);
    expect(sentryReports({ isDev: false, isDevice: true, channel: 'production' })).toBe(true);
    // Metro, simulators (screenshots, UI automation) and dev clients send nothing.
    expect(sentryReports({ isDev: true, isDevice: true, channel: 'production' })).toBe(false);
    expect(sentryReports({ isDev: false, isDevice: false, channel: 'production' })).toBe(false);
    expect(sentryReports({ isDev: false, isDevice: false, channel: 'preview' })).toBe(false);
    expect(sentryReports({ isDev: false, isDevice: true, channel: null })).toBe(false);
    expect(sentryReports({ isDev: false, isDevice: true, channel: 'development' })).toBe(false);
  });

  it('only accepts 8 hex characters for the short form', () => {
    expect(shortUpdate('84b0091f-17b0')).toBe('84b0091f');
    expect(shortUpdate('xyz')).toBeNull();
    expect(shortUpdate(null)).toBeNull();
  });

  it('tags every session with the update, channel, runtime and build (no personal data)', () => {
    expect(releaseTags(describeRelease(base))).toEqual({
      update_id: base.updateId,
      update_group: base.updateGroup,
      channel: 'preview',
      runtime: 'b576e0107b9d',
      build: '19',
      embedded_launch: 'false',
      emergency_launch: 'false',
    });
    expect(releaseTags(describeRelease({ ...base, isEmbeddedLaunch: true, updateGroup: null })).update_group).toBe('embedded');
  });

  it('writes the diagnostic lines support needs, including an emergency launch', () => {
    const lines = diagnosticLines(
      describeRelease({ ...base, isEmergencyLaunch: true, emergencyLaunchReason: 'update crashed' }),
      new Date('2026-10-25T05:00:00Z'),
    );
    expect(lines).toEqual([
      'Version 1.0.2 (19)',
      'Runtime b576e0107b9d',
      'Channel preview',
      'Update 01a1574f-56c7-72e5-ae37-91f7dd0d6a2a (2026-10-25 04:16 UTC)',
      'Emergency launch: update crashed',
      'Last update check: 2026-10-25 05:00 UTC',
    ]);
    expect(diagnosticLines(describeRelease({ ...base, isEmbeddedLaunch: true }), null)).toContain('JavaScript: built-in');
  });
});
