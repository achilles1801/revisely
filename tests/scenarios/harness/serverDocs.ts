// Documents on the server as an admin sees them (the owner's scripts, Cloud Functions): the
// Firestore emulator's REST API with its admin token ("Bearer owner", which only the emulator
// accepts). For setting up server state a scenario needs (a tester flag, today's count, the monthly
// cap) and for reading back what our functions wrote.

const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const BASE = `http://${FIRESTORE}/v1/projects/demo-revisely/databases/(default)/documents`;
const HEADERS = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

type Plain = null | boolean | number | string | Plain[] | { [k: string]: Plain };

function encode(v: Plain): Record<string, unknown> {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) } };
}

function decode(v: Record<string, any>): Plain {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decode);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, decode(x as Record<string, any>)]));
  return null;
}

const fields = (doc: { fields?: Record<string, any> }) =>
  Object.fromEntries(Object.entries(doc.fields ?? {}).map(([k, x]) => [k, decode(x)])) as Record<string, Plain>;

/** Merges `data` into the document (top-level fields), creating it if need be. */
export async function setServerDoc(path: string, data: Record<string, Plain>): Promise<void> {
  const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const res = await fetch(`${BASE}/${path}?${mask}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)])) }),
  });
  if (!res.ok) throw new Error(`set ${path}: ${res.status} ${await res.text()}`);
}

export async function getServerDoc(path: string): Promise<Record<string, Plain> | null> {
  const res = await fetch(`${BASE}/${path}`, { headers: HEADERS });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`get ${path}: ${res.status} ${await res.text()}`);
  return fields(await res.json());
}

export async function deleteServerDoc(path: string): Promise<void> {
  const res = await fetch(`${BASE}/${path}`, { method: 'DELETE', headers: HEADERS });
  if (!res.ok && res.status !== 404) throw new Error(`delete ${path}: ${res.status} ${await res.text()}`);
}

/** The documents of a collection (up to 300), with their ids. */
export async function listServerDocs(path: string): Promise<(Record<string, Plain> & { id: string })[]> {
  const res = await fetch(`${BASE}/${path}?pageSize=300`, { headers: HEADERS });
  if (!res.ok) throw new Error(`list ${path}: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { documents?: { name: string; fields?: Record<string, any> }[] };
  return (body.documents ?? []).map((d) => ({ ...fields(d), id: d.name.split('/').pop()! }));
}
