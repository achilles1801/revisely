// The Dev build's widget (plugins/withDevVariant): every store App Group and revisely:// link in the
// widget's Swift sources becomes Revisely Dev's, in the build's own copy.
const fs = require('fs');
const path = require('path');
const { devWidgetSources } = require('../withDevVariant');

const dir = path.join(__dirname, '..', '..', 'targets', 'widget');
const files = Object.fromEntries(
  fs.readdirSync(dir).filter((f) => f.endsWith('.swift')).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]),
);
const dev = { appGroup: 'group.com.revisionbuddy.app.dev', scheme: 'revisely-dev' };

describe('withDevVariant', () => {
  it("points the widget at Revisely Dev's App Group and links", () => {
    const out = devWidgetSources(files, dev);
    const all = Object.values(out).join('\n');
    expect(all).toContain('let appGroup = "group.com.revisionbuddy.app.dev"');
    expect(all).not.toContain('"group.com.revisionbuddy.app"');
    expect(all).not.toContain('"revisely://');
    expect(all).toContain('"revisely-dev://today');
    expect(all).toContain('"revisely-dev://read?page=');
    // Nothing else changes.
    const back = Object.fromEntries(
      Object.entries(out).map(([f, t]) => [f, t.split('group.com.revisionbuddy.app.dev').join('group.com.revisionbuddy.app').split('"revisely-dev://').join('"revisely://')]),
    );
    expect(back).toEqual(files);
  });

  it('stops the Dev build when the widget no longer names its App Group that way', () => {
    expect(() => devWidgetSources({ 'Snapshot.swift': 'let group = "x"' }, dev)).toThrow(/withDevVariant/);
  });
});
