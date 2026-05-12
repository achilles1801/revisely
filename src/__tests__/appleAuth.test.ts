/**
 * Unit tests for the Apple Sign-In helper.
 *
 * Strategy:
 *   - expo-apple-authentication and expo-crypto are mocked so we can verify
 *     the helper passes the right arguments and returns the right shape
 *     without actually presenting the Apple sheet.
 */

const mockIsAvailableAsync = jest.fn();
const mockSignInAsync = jest.fn();
const mockRandomUUID = jest.fn();
const mockDigestStringAsync = jest.fn();

jest.mock('expo-apple-authentication', () => ({
  __esModule: true,
  isAvailableAsync: () => mockIsAvailableAsync(),
  signInAsync: (opts: unknown) => mockSignInAsync(opts),
  AppleAuthenticationScope: { FULL_NAME: 'fullName', EMAIL: 'email' },
}));

jest.mock('expo-crypto', () => ({
  __esModule: true,
  randomUUID: () => mockRandomUUID(),
  digestStringAsync: (algo: unknown, value: unknown) =>
    mockDigestStringAsync(algo, value),
  CryptoDigestAlgorithm: { SHA256: 'sha256' },
}));

import { signInWithApple } from '../lib/appleAuth';

describe('signInWithApple', () => {
  beforeEach(() => {
    mockIsAvailableAsync.mockReset();
    mockSignInAsync.mockReset();
    mockRandomUUID.mockReset();
    mockDigestStringAsync.mockReset();
  });

  it('throws when Apple Sign-In is not available', async () => {
    mockIsAvailableAsync.mockResolvedValueOnce(false);

    await expect(signInWithApple()).rejects.toThrow(/not available/i);
    expect(mockSignInAsync).not.toHaveBeenCalled();
  });

  it('generates a SHA-256 nonce and forwards the hash to Apple', async () => {
    mockIsAvailableAsync.mockResolvedValueOnce(true);
    mockRandomUUID.mockReturnValueOnce('raw-nonce-uuid');
    mockDigestStringAsync.mockResolvedValueOnce('hashed-nonce');
    mockSignInAsync.mockResolvedValueOnce({
      identityToken: 'apple-id-token',
      fullName: { givenName: 'Majd', familyName: 'K' },
    });

    const result = await signInWithApple();

    expect(mockDigestStringAsync).toHaveBeenCalledWith(
      'sha256',
      'raw-nonce-uuid',
    );
    expect(mockSignInAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        nonce: 'hashed-nonce',
        requestedScopes: expect.arrayContaining(['fullName', 'email']),
      }),
    );
    expect(result).toEqual({
      identityToken: 'apple-id-token',
      rawNonce: 'raw-nonce-uuid',
      fullName: { givenName: 'Majd', familyName: 'K' },
    });
  });

  it('throws if Apple returns no identity token', async () => {
    mockIsAvailableAsync.mockResolvedValueOnce(true);
    mockRandomUUID.mockReturnValueOnce('raw');
    mockDigestStringAsync.mockResolvedValueOnce('hashed');
    mockSignInAsync.mockResolvedValueOnce({
      identityToken: null,
      fullName: null,
    });

    await expect(signInWithApple()).rejects.toThrow(/identity token/i);
  });
});
