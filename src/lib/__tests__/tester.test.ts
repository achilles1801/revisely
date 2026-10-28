import { isTester } from '../tester';

describe('isTester', () => {
  const tf = () => true;
  const notTf = () => false;

  it('development builds: always', () => {
    expect(isTester(null, { dev: true, testFlight: notTf })).toBe(true);
  });

  it('a TestFlight install signed in to a previewTester account', () => {
    expect(isTester({ previewTester: true }, { dev: false, testFlight: tf })).toBe(true);
  });

  it('never the App Store, App Review (not a tester), or anyone signed out', () => {
    expect(isTester({ previewTester: true }, { dev: false, testFlight: notTf })).toBe(false);
    expect(isTester({ previewTester: false }, { dev: false, testFlight: tf })).toBe(false);
    expect(isTester({}, { dev: false, testFlight: tf })).toBe(false);
    expect(isTester(null, { dev: false, testFlight: tf })).toBe(false);
  });
});
