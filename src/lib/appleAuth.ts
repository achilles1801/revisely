import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

export type AppleSignInResult = {
  identityToken: string;
  rawNonce: string;
  fullName: AppleAuthentication.AppleAuthenticationFullName | null;
};

/**
 * Triggers the system Sign in with Apple sheet and returns the identity token.
 *
 * Firebase requires a SHA-256 nonce: we generate a random raw nonce, hash it,
 * pass the hash to Apple, and send the raw nonce to Firebase along with the
 * returned identityToken. Firebase verifies the hash matches.
 */
export async function signInWithApple(): Promise<AppleSignInResult> {
  const isAvailable = await AppleAuthentication.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sign in with Apple is not available on this device.');
  }

  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token.');
  }

  return {
    identityToken: credential.identityToken,
    rawNonce,
    fullName: credential.fullName,
  };
}

export const isAppleSignInAvailable = AppleAuthentication.isAvailableAsync;
