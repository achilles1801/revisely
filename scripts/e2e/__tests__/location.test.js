// E2E flows own the phone's position (.maestro/subflows/location.yaml). A device keeps a position from
// one flow to the next in a job, and Maestro allows every permission at a launch that names none, so a
// position one flow set reached the screens of every flow after it: 06's Chicago gave 11's Home a
// prayer line on Android (#217's run 42687083053, Nov 9 2026), and its baselines failed.
//
// So: every launchApp allows location only when the flow has set a position, setLocation is used only
// in location.yaml, and a flow that sets one does so before its first launch.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..', '..');
const maestro = path.join(root, '.maestro');
const SUBFLOW = path.join(maestro, 'subflows', 'location.yaml');
// Android takes allow | deny for location; iOS always | inuse | never | unset (Maestro 2.11: "wrong argument
// value 'allow' was provided for 'location' permission"). maestro.platform is "ios" or "android".
const LOCATION = `location: "\${maestro.platform == 'ios' ? (output.location == 'allow' ? 'always' : 'never') : (output.location == 'allow' ? 'allow' : 'deny')}"`;

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

const files = yamlFiles(maestro).map((file) => ({
  file,
  rel: path.relative(root, file),
  // Comments out, so a command named in one doesn't count.
  lines: fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.replace(/(^|\s)#.*$/, '')),
}));

const indent = (line) => line.match(/^ */)[0].length;

/** Each `- launchApp` with the lines nested under it. */
function launches({ lines, rel }) {
  const out = [];
  lines.forEach((line, i) => {
    const m = line.match(/^( *)- +launchApp\b/);
    if (!m) return;
    const block = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].trim()) continue;
      if (indent(lines[j]) <= m[1].length) break;
      block.push(lines[j]);
    }
    out.push({ where: `${rel}:${i + 1}`, block });
  });
  return out;
}

/** The permissions a launch names: `name: value` lines under its `permissions:`. */
function permissions(block) {
  const at = block.findIndex((l) => /^ *permissions: *$/.test(l));
  if (at < 0) return null;
  const own = indent(block[at]);
  const out = {};
  for (const line of block.slice(at + 1)) {
    if (indent(line) <= own) break;
    const m = line.trim().match(/^(\w+): *(.+)$/);
    if (m) out[m[1]] = m[0];
  }
  return out;
}

it('allows location at every launch only when the flow has set a position', () => {
  const all = files.flatMap(launches);
  expect(all.length).toBeGreaterThanOrEqual(5);
  const wrong = all
    .filter(({ block }) => {
      const p = permissions(block);
      return !p || p.all !== 'all: allow' || p.location !== LOCATION;
    })
    .map(({ where }) => where);
  // Each must name `permissions: { all: allow, location: <LOCATION's expression> }`.
  expect(wrong).toEqual([]);
});

it('sets a position only in subflows/location.yaml, and marks location allowed there first', () => {
  const setters = files
    .filter(({ lines }) => lines.some((l) => /^ *- +setLocation\b/.test(l)))
    .map(({ rel }) => rel);
  expect(setters).toEqual([path.relative(root, SUBFLOW)]);

  const { lines } = files.find(({ file }) => file === SUBFLOW);
  const mark = lines.findIndex((l) => l.includes("evalScript: ${output.location = 'allow'}"));
  const set = lines.findIndex((l) => /^ *- +setLocation\b/.test(l));
  expect(mark).toBeGreaterThanOrEqual(0);
  expect(mark).toBeLessThan(set);
});

it('sets a position before the flow first launches the app', () => {
  const users = files.filter(({ lines }) => lines.some((l) => /subflows\/location\.yaml/.test(l)));
  expect(users.map(({ rel }) => path.basename(rel)).sort()).toEqual(
    expect.arrayContaining(['04-fajr-boundary.yaml', '06-offline.yaml']),
  );
  const late = users
    .filter(({ lines }) => {
      const set = lines.findIndex((l) => /subflows\/location\.yaml/.test(l));
      const launch = lines.findIndex((l) => /(launch|new-account|relaunch[\w-]*)\.yaml|^ *- +launchApp\b/.test(l));
      return launch >= 0 && launch < set;
    })
    .map(({ rel }) => rel);
  expect(late).toEqual([]);
});
