// Objects in the Storage emulator's default bucket, as the server's own accounts write and read them (the checker, the
// lab): the emulator's admin token ("Bearer owner", which only the emulator accepts) passes over storage.rules.

const BUCKET = 'demo-revisely.appspot.com';
const HEADERS = { Authorization: 'Bearer owner' };

function host(): string {
  return `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199'}`;
}

/** Writes `name` as the checker would. */
export async function putObject(name: string, body: Uint8Array | string, contentType: string): Promise<void> {
  const url = `${host()}/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(name)}`;
  const data = typeof body === 'string' ? body : (new Uint8Array(body).buffer as ArrayBuffer);
  const res = await fetch(url, { method: 'POST', headers: { ...HEADERS, 'Content-Type': contentType }, body: data });
  if (!res.ok) throw new Error(`Storage emulator refused ${name}: ${res.status}`);
}

/** The names under `prefix`. */
export async function listObjects(prefix: string): Promise<string[]> {
  const res = await fetch(`${host()}/storage/v1/b/${BUCKET}/o?prefix=${encodeURIComponent(prefix)}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Storage emulator couldn't list ${prefix}: ${res.status}`);
  const body = (await res.json()) as { items?: { name: string }[] };
  return (body.items ?? []).map((i) => i.name).sort();
}
