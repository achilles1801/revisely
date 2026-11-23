// A plain-text licence, wrapped at 74 columns for a terminal, laid out for a phone (SET-5): the lines of a paragraph
// join into one, so the text wraps at the screen's width; each numbered or lettered item, the "EN:" and "AR:" notices
// and every paragraph start a line of their own, indented as in the file; a block where every line sits far to the
// right (a centred title) keeps its lines, centred. Only whitespace changes: every word stays, in order
// (licenseLines.test).

export interface LicenseLine {
  text: string;
  /** Indent level, from the file's leading spaces (0–4). */
  indent: number;
  centred: boolean;
  /** The line opens a paragraph (space above it). */
  opens: boolean;
}

// An item that starts a line: (a) (ii) (1), 1. 1.1 2.3(b), EN: AR:, a separator, a heading in capitals.
const ITEM = /^(\((?:[a-z]|[ivx]+|\d+)\)\s|\d+(?:\.\d+)*\.?(?:\([a-z]\))?\s|(?:EN|AR):|-{5,}$|[A-Z][A-Z0-9 ,.:()'-]{6,}$)/;
const SEPARATOR = /^-{5,}$/;
const CENTRED_FROM = 15;

const leading = (line: string) => line.length - line.trimStart().length;
const level = (spaces: number) => Math.min(4, Math.floor(spaces / 3));

export function licenseLines(text: string): LicenseLine[] {
  const out: LicenseLine[] = [];
  const blocks = text.replace(/\r\n/g, '\n').split(/\n[ \t]*\n/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    if (lines.length === 0) continue;
    if (lines.every((l) => leading(l) >= CENTRED_FROM)) {
      lines.forEach((l, i) => out.push({ text: l.trim().replace(/\s+/g, ' '), indent: 0, centred: true, opens: i === 0 }));
      continue;
    }
    let current: LicenseLine | null = null;
    lines.forEach((l, i) => {
      const trimmed = l.trim().replace(/\s+/g, ' ');
      if (current === null || ITEM.test(trimmed) || SEPARATOR.test(current.text)) {
        current = { text: trimmed, indent: level(leading(l)), centred: false, opens: i === 0 };
        out.push(current);
      } else {
        current.text += ' ' + trimmed;
      }
    });
  }
  return out;
}
