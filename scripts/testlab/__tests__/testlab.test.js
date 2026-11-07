const { pickDevices, toAttempts } = require('../testlab');

const model = (id, brand, name, versions, extra = {}) => ({ id, brand, name, form: 'PHYSICAL', formFactor: 'PHONE', supportedAbis: ['arm64-v8a'], supportedVersionIds: versions, ...extra });
const catalogue = [
  model('oriole', 'Google', 'Pixel 6', ['31', '32', '33']),
  model('husky', 'Google', 'Pixel 8 Pro', ['34']),
  model('dm1q', 'samsung', 'Galaxy S23', ['33', '34']),
  model('a15', 'samsung', 'Galaxy A15', ['34']),
  model('a10', 'samsung', 'Galaxy A10', ['27']), // too old
  model('MediumPhone.arm', 'Generic', 'Medium Phone', ['34'], { form: 'VIRTUAL' }),
  model('tangorpro', 'Google', 'Pixel Tablet', ['34'], { formFactor: 'TABLET' }),
];

describe('Test Lab', () => {
  it('picks a Pixel, a Galaxy S and a Galaxy A, physical phones at their newest Android', () => {
    expect(pickDevices(catalogue)).toEqual([
      { id: 'husky', version: '34', name: 'Pixel 8 Pro' },
      { id: 'dm1q', version: '34', name: 'Galaxy S23' },
      { id: 'a15', version: '34', name: 'Galaxy A15' },
    ]);
    // Without Samsungs: the newest other phones fill the three.
    expect(pickDevices(catalogue.filter((m) => m.brand !== 'samsung')).map((d) => d.id)).toEqual(['husky', 'oriole']);
  });

  it("turns gcloud's outcomes into attempts.json: a crash or an ANR fails its phone, inconclusive is left out", () => {
    const rec = toAttempts(
      [
        { axis_value: 'husky-34-en-portrait', outcome: 'Passed', test_details: '--' },
        { axis_value: 'dm1q-34-en-portrait', outcome: 'Failed', test_details: 'Application crashed.' },
        { axis_value: 'a15-34-en-portrait', outcome: 'Inconclusive', test_details: 'Infrastructure failure.' },
      ],
      catalogue,
    );
    expect(rec.platform).toBe('devices');
    expect(rec.flows.map((f) => [f.flow, f.passed, f.attempts[0].reason])).toEqual([
      ['Pixel 8 Pro (Android 14)', true, undefined],
      ['Galaxy S23 (Android 14)', false, 'Application crashed.'],
    ]);
  });
});
