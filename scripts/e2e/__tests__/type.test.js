// .maestro/subflows/type.yaml and type-in-log.yaml type TEXT, then wait until the field shows it,
// matching TEXT as a regex. So what flows pass them (directly, or through add-day-note.yaml and
// add-note.yaml, which hand their TEXT on) must read the same as a regex: letters, digits, spaces and
// . , ' - only. A "?" or "(" would make the wait look for something else, and time out on a field
// that is right.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..', '..');
const maestro = path.join(root, '.maestro');
const SAFE = /^[A-Za-z0-9 .,'-]+$/;
const TYPERS = ['type.yaml', 'type-in-log.yaml'];
// Subflows that hand their own TEXT on to one of them.
const PASSES_ON = ['add-day-note.yaml', 'add-note.yaml'];

function yamlFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'build', 'baselines'].includes(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...yamlFiles(abs));
    else if (/\.ya?ml$/.test(entry.name)) out.push(abs);
  }
  return out;
}

/** Each runFlow of `names` in the flows and subflows, with the TEXT it passes (null: none). */
function calls(names) {
  const out = [];
  for (const file of yamlFiles(maestro)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const m = line.match(/^( *)(?:- +)?file: +["']?(?:\.\.\/subflows\/)?([\w-]+\.yaml)/);
      if (!m || !names.includes(m[2])) return;
      let text = null;
      for (let j = i + 1; j < lines.length && (lines[j].trim() === '' || lines[j].match(/^ */)[0].length >= m[1].length); j++) {
        const t = lines[j].match(/^ +TEXT: +(.+?) *$/);
        if (t) {
          text = t[1].replace(/^["']|["']$/g, '');
          break;
        }
        if (/^ *- /.test(lines[j]) && lines[j].match(/^ */)[0].length <= m[1].length) break;
      }
      out.push({ where: `${path.relative(root, file)}:${i + 1}`, file: path.basename(file), text });
    });
  }
  return out;
}

it('passes the typing subflows only text that reads the same as a regex', () => {
  const direct = calls(TYPERS).filter((c) => !(PASSES_ON.includes(c.file) && c.text === '${TEXT}'));
  const through = calls(PASSES_ON);
  expect(direct.length + through.length).toBeGreaterThanOrEqual(4);
  const wrong = [...direct, ...through]
    .filter(({ text }) => !text || !SAFE.test(text))
    .map(({ where, text }) => `${where}: ${text}`);
  expect(wrong).toEqual([]);
});

it('types the note through type.yaml, never a bare inputText followed by Add', () => {
  const note = fs.readFileSync(path.join(maestro, 'subflows', 'add-day-note.yaml'), 'utf8');
  expect(note).toMatch(/file: type\.yaml/);
  expect(note).not.toMatch(/^- inputText/m);
});
