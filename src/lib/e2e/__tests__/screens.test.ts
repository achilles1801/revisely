import { sayModal, screenListeners } from '../screens';

describe('lib/e2e/screens: the E2E build’s trace of screens', () => {
  let log: jest.SpyInstance;
  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => log.mockRestore());

  it('says each stack screen’s focus, blur and transitions, opening or closing', () => {
    const on = screenListeners({ route: { name: 'JournalEntry' } });
    on.transitionStart({ data: { closing: false } });
    on.focus();
    on.transitionEnd({ data: { closing: false } });
    on.blur();
    on.transitionStart({ data: { closing: true } });
    on.transitionEnd({});
    expect(log.mock.calls.map((c) => c[0])).toEqual([
      '[e2e] screen JournalEntry opening start',
      '[e2e] screen JournalEntry focus',
      '[e2e] screen JournalEntry opening end',
      '[e2e] screen JournalEntry blur',
      '[e2e] screen JournalEntry closing start',
      '[e2e] screen JournalEntry opening end',
    ]);
  });

  it('says when a sheet’s native modal is presented, dismissed or replaced', () => {
    sayModal('add-memorized-sheet', 'shown');
    sayModal(undefined, 'dismissed');
    sayModal('jump-sheet', 'replaced');
    expect(log.mock.calls.map((c) => c[0])).toEqual([
      '[e2e] sheet add-memorized-sheet shown',
      '[e2e] sheet (no id) dismissed',
      '[e2e] sheet jump-sheet replaced',
    ]);
  });
});
