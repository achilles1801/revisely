const { checkAnswer, excerpt, smokeContext } = require('../live');
const { validateContext } = require('../../../functions/src/revo/validate');

describe('the live smoke check', () => {
  it('sends a context the server accepts (functions/src/revo/validate)', () => {
    expect(() => validateContext(smokeContext('2026-11-07'))).not.toThrow();
  });

  it('accepts only an answer the app would show', () => {
    const q = 'Smoke check?';
    const good = {
      chatId: 'c1',
      title: 'Smoke',
      question: { id: 'q', role: 'user', text: q, at: 1 },
      reply: { id: 'r', role: 'revo', text: 'Today is a rest day.', at: 2 },
      remainingToday: 19,
      cached: false,
    };
    expect(checkAnswer(good, q)).toEqual([]);
    // The envelope read as the answer (REACT-NATIVE-10), an empty reply, a missing count.
    expect(checkAnswer({ result: good }, q)).toContain('no chatId');
    expect(checkAnswer({ ...good, reply: { ...good.reply, text: ' ' } }, q)).toEqual(['the reply has no text']);
    expect(checkAnswer({ ...good, remainingToday: undefined }, q)).toEqual(['no remainingToday']);
    expect(checkAnswer(null, q)).toEqual(['no result']);
  });

  it('never prints a token or a key', () => {
    const jwt = `eyJhbGciOiJSUzI1NiJ9.${'a'.repeat(40)}.${'b'.repeat(40)}`;
    expect(excerpt(`bad ${jwt} and AIza${'x'.repeat(35)}`)).toBe('bad [token] and [key]');
  });
});
