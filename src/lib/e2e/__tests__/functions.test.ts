// An E2E build's route to our functions (src/lib/e2e/functions.ts): the functions emulator, an App
// Check token the emulator accepts, and the E2E clock.
import { Platform } from 'react-native';
import { E2E_APP_CHECK_TOKEN, e2eFunction } from '../functions';

describe('E2E functions', () => {
  it('calls the functions emulator on this computer, with the E2E clock', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_793_000_000_000);
    const { url, headers } = e2eFunction('deleteUserAccount');
    const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
    expect(url).toBe(`http://${host}:5001/demo-revisely/us-central1/deleteUserAccount`);
    expect(headers).toEqual({ 'X-Revisely-Test-Now': '1793000000000' });
  });

  it('hands out a token in App Check’s shape, unsigned (the emulator decodes it; nothing else accepts it)', () => {
    // firebase-functions' JWT pattern for a token the emulator decodes.
    expect(E2E_APP_CHECK_TOKEN).toMatch(/^[a-zA-Z0-9\-_=]+?\.[a-zA-Z0-9\-_=]+?\.([a-zA-Z0-9\-_=]+)?$/);
    const [head, body, signature] = E2E_APP_CHECK_TOKEN.split('.');
    expect(JSON.parse(Buffer.from(head, 'base64url').toString())).toEqual({ alg: 'none', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(body, 'base64url').toString()).sub).toBe('1:123456789012:ios:e2e');
    expect(signature).toBe('');
  });
});
