// lib/premium and lib/earlyAccess: Premium's errors and the early access lines.
export const premium = {
  errors: {
    tooMany: 'That’s a lot of tries for one day. Try again tomorrow.',
    signIn: 'Sign in again, then try once more.',
    notOpen: 'Applying for support isn’t open yet.',
    devOnly: 'Only in Revisely Dev.',
    offline: 'Couldn’t connect. Try again when you’re online.',
    other: 'Something went wrong. Try again.',
  },
  /** Early access (lib/earlyAccess). */
  earlyAccess: {
    /** Settings' Premium row, while early access is on. */
    line: 'Premium is free for everyone who signs up during early access, which has no end date yet. After it ends, Premium will be paid, and every account that got it during early access keeps it for life, bi-idhnillah.',
    /** Settings' Premium row, after early access, for an account that had it then. */
    kept: 'Yours for life: your account got Premium during early access.',
    /** Marking mistakes' intro, in place of Apply for support. */
    intro: 'Premium is free for everyone during early access, which has no end date yet. After it ends, Premium will be paid, and you’ll keep it for life, bi-idhnillah.',
    /** The take summary's quiet line. */
    short: 'Premium is free for everyone during early access, and yours for life.',
    keptShort: 'Premium is yours for life, from early access.',
  },
} as const;
