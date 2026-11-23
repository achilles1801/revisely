/**
 * A failed call, for `logger.error`: "<name> failed: <the error's message>", with the error's own stack.
 *
 * Pass it as the argument (`logger.error(failure('supportApply', err))`), never `{ message }`:
 * firebase-functions' logger takes a plain object as the entry's fields and then writes its own `message`
 * over the object's (the call's text and a stack of the logger call). Cloud Logging showed only
 * "Error: adminConsole failed" for a missing index (Nov 14 2026), and every support callable's failure
 * read the same.
 *
 * Only the message and the stack's frames: never request data (a request may hold someone's answers).
 */
export function failure(name: string, err: unknown): Error {
  const reason = err instanceof Error ? err.message : String(err);
  const out = new Error(`${name} failed: ${reason}`);
  if (err instanceof Error && err.stack) {
    const frames = err.stack.split('\n').filter((line) => /^\s+at /.test(line));
    out.stack = [`Error: ${out.message}`, ...frames].join('\n');
  }
  return out;
}
