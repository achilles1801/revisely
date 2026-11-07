// The E2E status line's outbox part (lib/e2e/outboxStatus): what flows wait on before a script
// writes the server (.maestro/subflows/app-sent.yaml).

import { enqueue, removeEntry } from '../../offline/outbox';
import { onOutboxChange, outboxText } from '../outboxStatus';

jest.mock('../../logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const op = { kind: 'user', fields: { onboardingComplete: true } } as const;

describe('outboxText', () => {
  it('says nothing to send before the app has made a change', () => {
    expect(outboxText()).toBe(' · nothing to send');
  });

  it('counts the changes held, for every account, until the server has each', async () => {
    const heard = jest.fn();
    const off = onOutboxChange(heard);
    const a = await enqueue('uid-a', op);
    const b = await enqueue('uid-a', op);
    expect(outboxText()).toBe(' · 2 to send');
    const c = await enqueue('uid-b', op);
    expect(outboxText()).toBe(' · 3 to send');
    expect(heard).toHaveBeenCalled();

    await removeEntry('uid-a', a.id);
    await removeEntry('uid-b', c.id);
    expect(outboxText()).toBe(' · 1 to send');
    await removeEntry('uid-a', b.id);
    expect(outboxText()).toBe(' · nothing to send');
    off();
  });

  it('never matches what flows read for "offline" or the clock', () => {
    // network.yaml waits on ".* offline.*" and clock.yaml on "e2e <date> <hour>.*".
    expect(/.* offline.*/.test(outboxText())).toBe(false);
  });
});
