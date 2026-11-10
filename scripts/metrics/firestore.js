// Firestore reads over REST for the metrics collector: whole collections (or collection groups) with
// only the fields asked for (`select`), so question and answer text, chat titles and memory are never
// read. Read-only; the service account has roles/datastore.viewer.

/** A Firestore REST value as plain JS. Integers come as strings; timestamps as ms. */
function decode(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return fields(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('referenceValue' in v) return v.referenceValue;
  return null;
}

function fields(f) {
  const out = {};
  for (const [k, v] of Object.entries(f || {})) out[k] = decode(v);
  return out;
}

/** The path after `/documents/` and its segments: users/{uid}/revoChats/{id}/messages/{id}. */
function pathOf(name) {
  const p = name.split('/documents/')[1] || '';
  return p.split('/');
}

function store(call, project) {
  const root = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
  return {
    /**
     * Every document of a collection (`group: true`: every collection with that id, at any depth), with
     * only `select` fields. Pages through by document name, `pageSize` at a time.
     */
    async all(collectionId, select, { group = false, pageSize = 2000 } = {}) {
      const out = [];
      let after = null;
      for (let page = 0; page < 500; page++) {
        const structuredQuery = {
          from: [{ collectionId, allDescendants: group }],
          select: { fields: [...select, '__name__'].map((fieldPath) => ({ fieldPath })) },
          orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
          limit: pageSize,
        };
        if (after) structuredQuery.startAt = { values: [{ referenceValue: after }], before: false };
        const rows = await call(`${root}:runQuery`, { method: 'POST', body: { structuredQuery } });
        const docs = (rows || []).filter((r) => r.document).map((r) => r.document);
        for (const d of docs) out.push({ path: pathOf(d.name), ...fields(d.fields) });
        if (docs.length < pageSize) break;
        after = docs[docs.length - 1].name;
      }
      return out;
    },
    /** One document's fields, or null. */
    async get(path) {
      try {
        const d = await call(`${root}/${path}`);
        return fields(d.fields);
      } catch (err) {
        if (/-> 404/.test(err.message)) return null;
        throw err;
      }
    },
  };
}

module.exports = { store, decode, fields, pathOf };
