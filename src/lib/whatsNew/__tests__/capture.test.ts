describe('the capture switch (recording the moment for the website)', () => {
  const before = process.env.EXPO_PUBLIC_MOMENT_CAPTURE;
  afterEach(() => {
    process.env.EXPO_PUBLIC_MOMENT_CAPTURE = before;
    jest.resetModules();
  });

  it('is off unless a capture bundle sets it, so users always get Skip, Watch again and ✕', () => {
    delete process.env.EXPO_PUBLIC_MOMENT_CAPTURE;
    jest.isolateModules(() => expect(require('../capture').MOMENT_CAPTURE).toBe(false));
    process.env.EXPO_PUBLIC_MOMENT_CAPTURE = '1';
    jest.isolateModules(() => expect(require('../capture').MOMENT_CAPTURE).toBe(true));
  });

  it('is never set for a release build (eas.json and app.config pass no such variable)', () => {
    const fs = jest.requireActual<typeof import('fs')>('fs');
    for (const f of ['eas.json', 'app.config.js']) expect(fs.readFileSync(f, 'utf8')).not.toContain('MOMENT_CAPTURE');
  });
});
