/**
 * The name to greet the user by: the app profile's name, else the sign-in
 * provider's, trimmed with inner runs of whitespace collapsed. '' when both
 * are blank, so callers can simply hide the name.
 */
export function greetingName(
  profileName: string | null | undefined,
  authName: string | null | undefined,
): string {
  for (const candidate of [profileName, authName]) {
    const cleaned = (candidate ?? '').replace(/\s+/g, ' ').trim();
    if (cleaned) return cleaned;
  }
  return '';
}

/**
 * One character for an avatar: the first letter of the name, else of the
 * email, else '?'. Whole code points, so an emoji or other astral character
 * is not cut in half.
 */
export function avatarInitial(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  for (const candidate of [name, email]) {
    const first = Array.from((candidate ?? '').trim())[0];
    if (first) return first.toLocaleUpperCase();
  }
  return '?';
}
