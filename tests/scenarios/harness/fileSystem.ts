// expo-file-system (the File/Directory API) for scenarios, on the real disk:
// each Phone has its own folder (its Documents and Caches), kept across launches
// like the app's storage. Only what the app uses is here.
import fs from 'fs';
import os from 'os';
import path from 'path';

const g = globalThis as unknown as { __scenarioFsRoot?: string };
export function setPhoneFolder(folder: string): void {
  g.__scenarioFsRoot = folder;
  fs.mkdirSync(path.join(folder, 'Documents'), { recursive: true });
  fs.mkdirSync(path.join(folder, 'Caches'), { recursive: true });
}
function root(): string {
  if (!g.__scenarioFsRoot) setPhoneFolder(fs.mkdtempSync(path.join(os.tmpdir(), 'revisely-phone-')));
  return g.__scenarioFsRoot!;
}

const pathOf = (uri: string) => decodeURI(uri.replace(/^file:\/\//, ''));
const uriOf = (p: string) => `file://${p}`;
function join(parts: unknown[]): string {
  return path.join(...parts.map((p) => (typeof p === 'string' ? pathOf(p) : pathOf((p as { uri: string }).uri))));
}

export class File {
  readonly uri: string;
  constructor(...parts: unknown[]) {
    this.uri = uriOf(join(parts));
  }
  get name() {
    return path.basename(pathOf(this.uri));
  }
  get exists() {
    return fs.existsSync(pathOf(this.uri)) && fs.statSync(pathOf(this.uri)).isFile();
  }
  get size() {
    return this.exists ? fs.statSync(pathOf(this.uri)).size : 0;
  }
  get parentDirectory() {
    return new Directory(path.dirname(pathOf(this.uri)));
  }
  create() {
    fs.mkdirSync(path.dirname(pathOf(this.uri)), { recursive: true });
    fs.writeFileSync(pathOf(this.uri), '');
  }
  write(content: string | Uint8Array) {
    fs.mkdirSync(path.dirname(pathOf(this.uri)), { recursive: true });
    fs.writeFileSync(pathOf(this.uri), typeof content === 'string' ? content : Buffer.from(content));
  }
  async text() {
    return fs.readFileSync(pathOf(this.uri), 'utf8');
  }
  textSync() {
    return fs.readFileSync(pathOf(this.uri), 'utf8');
  }
  async bytes() {
    return new Uint8Array(fs.readFileSync(pathOf(this.uri)));
  }
  delete() {
    fs.rmSync(pathOf(this.uri), { force: true });
  }
  move(to: File | Directory) {
    const dest = to instanceof Directory ? path.join(pathOf(to.uri), this.name) : pathOf(to.uri);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(pathOf(this.uri), dest);
    (this as { uri: string }).uri = uriOf(dest);
  }
  copy(to: File | Directory) {
    const dest = to instanceof Directory ? path.join(pathOf(to.uri), this.name) : pathOf(to.uri);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(pathOf(this.uri), dest);
  }
}

export class Directory {
  readonly uri: string;
  constructor(...parts: unknown[]) {
    this.uri = uriOf(join(parts));
  }
  get name() {
    return path.basename(pathOf(this.uri));
  }
  get exists() {
    return fs.existsSync(pathOf(this.uri)) && fs.statSync(pathOf(this.uri)).isDirectory();
  }
  create() {
    fs.mkdirSync(pathOf(this.uri), { recursive: true });
  }
  delete() {
    fs.rmSync(pathOf(this.uri), { recursive: true, force: true });
  }
  list() {
    if (!this.exists) return [];
    return fs.readdirSync(pathOf(this.uri)).map((n) => {
      const p = path.join(pathOf(this.uri), n);
      return fs.statSync(p).isDirectory() ? new Directory(p) : new File(p);
    });
  }
}

export const Paths = {
  get document() {
    return new Directory(path.join(root(), 'Documents'));
  },
  get cache() {
    return new Directory(path.join(root(), 'Caches'));
  },
  get availableDiskSpace() {
    return 50e9;
  },
};

module.exports = { __esModule: true, File, Directory, Paths, setPhoneFolder };
