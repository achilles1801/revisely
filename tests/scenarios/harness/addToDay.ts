// The Activity day's + ("Add to <day>") and the sheet each of its rows opens, driven as a finger
// drives them: the real AddToDaySheet and its Revised, Memorized and Note sheets.

import type { OpenApp } from './phone';

export type AddRow = 'revised' | 'memorized' | 'note';

export class AddToDay {
  constructor(private readonly app: OpenApp) {}

  private get rtl() {
    return this.app.mods.rtl;
  }

  async press(testID: string): Promise<void> {
    await this.app.until(() => this.app.screen.queryByTestId(testID) != null, testID);
    await this.app.act(async () => {
      this.rtl.fireEvent.press(this.app.screen.getByTestId(testID));
    });
  }

  /** The day's +: the menu opens. */
  async open(): Promise<void> {
    await this.press('day-add');
    await this.app.until(() => this.app.screen.queryByTestId('activity-add-menu') != null, 'the add menu');
  }

  /** A row of the menu: its sheet opens once the menu has gone. */
  async choose(row: AddRow): Promise<void> {
    await this.press(`sheet-action-${row}`);
    await this.app.until(() => this.app.screen.queryByTestId(`add-${row}-sheet`) != null, `the ${row} sheet`);
  }

  async type(testID: string, text: string): Promise<void> {
    await this.app.act(async () => {
      this.rtl.fireEvent.changeText(this.app.screen.getByTestId(testID), text);
    });
  }

  /** The sheet's Add; waits for the sheet to go. */
  async add(row: AddRow): Promise<void> {
    await this.press(`add-${row}-add`);
    await this.app.until(() => this.app.screen.queryByTestId(`add-${row}-sheet`) == null, `the ${row} sheet to close`);
  }

  /** + → Revised → pages `from` to `to` → Add. */
  async revised(from: number, to: number): Promise<void> {
    await this.open();
    await this.choose('revised');
    await this.type('add-revised-from', String(from));
    await this.type('add-revised-to', String(to));
    await this.add('revised');
  }

  /** + → Memorized → pages `from` to `to` → Add. */
  async memorized(from: number, to: number): Promise<void> {
    await this.open();
    await this.choose('memorized');
    await this.type('add-memorized-from', String(from));
    await this.type('add-memorized-to', String(to));
    await this.add('memorized');
  }

  /** + → Note → `text` → Add. */
  async note(text: string): Promise<void> {
    await this.open();
    await this.choose('note');
    await this.type('add-note-text', text);
    await this.add('note');
  }

  /** The day's text, flattened (blocks, figures, notes). */
  text(): string {
    return JSON.stringify(this.app.screen.toJSON());
  }
}

/** Back from the pushed screen (the day) to the one under it. */
export async function goBack(app: OpenApp): Promise<void> {
  const nav = app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;
  await app.act(async () => {
    nav.current.goBack();
  });
  await app.idle(100);
}
