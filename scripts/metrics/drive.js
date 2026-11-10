// The dashboard's two Drive files (in the owner's private "Revisely metrics" folder, shared with the
// read-only service account as Editor): metrics.json, which the collector overwrites, and the
// "refresh" marker, whose description the dashboard sets to the time of a Refresh tap.

/** When the dashboard last asked for a refresh (an ISO time in the marker's description), or null. */
async function refreshRequest(call, fileId) {
  const f = await call(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=description,modifiedTime`);
  const m = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/.exec(f.description || '');
  return m ? m[1] : null;
}

/** Replaces metrics.json's content (the file stays the owner's; the service account only edits it). */
async function writeMetrics(call, fileId, metrics) {
  await call(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,modifiedTime`, {
    method: 'PATCH',
    raw: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metrics),
  });
}

module.exports = { refreshRequest, writeMetrics };
