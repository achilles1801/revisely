// fingerprint.config.js and Revisely Dev: its prebuild rewrites targets/widget (this plugin's Swift
// rewrites, @bacons/apple-targets' widget.entitlements), and EAS fingerprints the project again after
// prebuild. Revisely Dev's fingerprint reads those files as committed, or its build stops on a runtime
// mismatch (Nov 11 2026: 0bce2dd9 before, 282a2e42 inside the build). The store app's never passes
// through the hook.
const fs = require('fs');
const path = require('path');
const { devWidgetSources } = require('../withDevVariant');

const root = path.join(__dirname, '..', '..');
const dir = path.join(root, 'targets', 'widget');
const DEV = { appGroup: 'group.com.revisionbuddy.app.dev', scheme: 'revisely-dev' };

function loadConfig(variant) {
  const saved = process.env.APP_VARIANT;
  if (variant) process.env.APP_VARIANT = variant;
  else delete process.env.APP_VARIANT;
  try {
    let config;
    jest.isolateModules(() => {
      config = require('../../fingerprint.config.js');
    });
    return config;
  } finally {
    if (saved === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = saved;
  }
}

// A file through the hook the way @expo/fingerprint reads it: 1 KB chunks, then the end.
function throughHook(hook, filePath, bytes) {
  const source = { type: 'file', filePath };
  const out = [];
  for (let i = 0; i < bytes.length; i += 1024) {
    const r = hook(source, bytes.subarray(i, i + 1024), false, 'buffer');
    if (r) out.push(Buffer.from(r));
  }
  const end = hook(source, null, true, 'utf8');
  if (end) out.push(Buffer.from(end));
  return Buffer.concat(out);
}

const committed = Object.fromEntries(
  fs.readdirSync(dir)
    .filter((f) => f.endsWith('.swift') || f.endsWith('.entitlements'))
    .map((f) => [f, fs.readFileSync(path.join(dir, f))]),
);

// What a Revisely Dev prebuild leaves in targets/widget.
function devPrebuilt() {
  const swift = Object.fromEntries(
    Object.entries(committed).filter(([f]) => f.endsWith('.swift')).map(([f, b]) => [f, b.toString('utf8')]),
  );
  const out = devWidgetSources(swift, DEV);
  out['widget.entitlements'] = committed['widget.entitlements']
    .toString('utf8')
    .split('<string>group.com.revisionbuddy.app</string>')
    .join(`<string>${DEV.appGroup}</string>`);
  return out;
}

describe('fingerprint.config.js', () => {
  it("hooks only Revisely Dev's fingerprint", () => {
    expect(loadConfig().fileHookTransform).toBeUndefined();
    expect(loadConfig('store').fileHookTransform).toBeUndefined();
    const dev = loadConfig('dev');
    expect(dev.fileHookTransform).toBe(dev.devWidgetAsCommitted);
  });

  it("hashes a Dev prebuild's widget files as committed", () => {
    const hook = loadConfig('dev').fileHookTransform;
    const dev = devPrebuilt();
    expect(Object.keys(dev).sort()).toEqual(Object.keys(committed).sort());
    // The prebuild changed them, and some span several chunks.
    expect(Object.entries(dev).filter(([f, t]) => t !== committed[f].toString('utf8')).length).toBeGreaterThan(1);
    expect(Object.values(committed).some((b) => b.length > 2048)).toBe(true);
    for (const [f, text] of Object.entries(dev)) {
      expect(throughHook(hook, `targets/widget/${f}`, Buffer.from(text, 'utf8')).equals(committed[f])).toBe(true);
    }
  });

  it('leaves committed files and everything else as they are', () => {
    const hook = loadConfig('dev').fileHookTransform;
    for (const [f, bytes] of Object.entries(committed)) {
      expect(throughHook(hook, `targets/widget/${f}`, bytes).equals(bytes)).toBe(true);
    }
    // Other files' chunks pass straight through, Dev strings and all.
    const other = Buffer.from(`"${DEV.appGroup}" "revisely-dev://x"`);
    expect(hook({ type: 'file', filePath: 'targets/widget/verses.json' }, other, false, 'buffer')).toBe(other);
    expect(hook({ type: 'file', filePath: 'app.config.js' }, other, false, 'buffer')).toBe(other);
    expect(hook({ type: 'file', filePath: 'app.config.js' }, null, true, 'utf8')).toBeNull();
    // Revisely Dev's resolved config differs from the store app's, as it should.
    const config = JSON.stringify({ ios: { entitlements: [DEV.appGroup] } });
    expect(hook({ type: 'contents', id: 'expoConfig' }, config, true, 'utf8')).toBe(config);
  });
});
