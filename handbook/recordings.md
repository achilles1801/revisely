# Recording backup

Moved from CLAUDE.md word for word on Nov 22 2026. CLAUDE.md keeps the rules every session needs.

**Recording backup** (`src/lib/recordingBackup.ts`, `recordingCloud.ts`, `recordingBackupController.ts`):
recordings upload to Storage `recordings/<uid>/<id>-<n>.m4a`, with a record per recording in Firestore
`users/<uid>/recordings/<id>`. It's on unless `recordingBackup === false`, Wi-Fi only unless
`recordingBackupCellular`, and a one-time notice comes before the first upload.

These invariants must not be broken:
- **Local audio** is only ever deleted by the user deleting it on that phone.
- **Tombstones** (`{deletedAt}`) are permanent:
  - The rules refuse writing a live record over one, and refuse deleting one (only `deleteUserAccount` removes them).
  - A phone whose put meets a tombstone keeps its copy local-only (`backupDeleted`) and removes the files it uploaded.
- **Live records** can be written only while the account's backup is on (the rules read the user doc).
- **Storage objects are create-only** (`resource == null`): a name is one file, ever.
- **Copies from another phone** (`restored`) are never continued here. They are uploaded only when `adopted`: the backup lost them without a tombstone and every part is on the phone.

How it works:
- **Deleting a recording** queues it in `Documents/recordings-sync/<uid>-deletes.json` and works offline. The run then:
  1. Tombstones every queued recording, even one with no record yet.
  2. Lists the files once and deletes every file named after those recordings.

  Deletions run even with backup off, and are flushed on sign-out. "Delete all" first lists the backup (it refuses offline) so that recordings this phone hasn't seen go too.
- **"Turn off and delete backups"** needs the connection:
  1. Save "off" first.
  2. List the backup and merge it into the phone.
  3. Download everything that is only in the backup. A part that is already gone (404) is dropped; any other failure refuses.
  4. Delete exactly the files and live records that were listed. Tombstones stay.

  It refuses while an earlier wipe is pending, or if a record can't be read.
- **Uploads:**
  - The resumable protocol in 4 MB chunks on the foreground session (REST plus `createUploadTask`).
  - The session is saved in the index, so an upload carries on after the app closes.
  - The network is checked before every chunk.
  - The chunk in flight is cancelled on leaving Wi-Fi, sign-out or account deletion.
- **"Recording saved · Undo · View"** (Majd, Nov 15 2026: "there should be an undo button for it not just view";
  `components/recordings/RecordingSavedToast`, in the reader and a session; never after a Recite take, RMEM-6):
  - **The hold:** a recording uploads nothing while the recorder runs, nor while its note offers Undo
    (`holdUpload` in `lib/recordings`). Each segment is held as `appendSegment` writes it, so no run sees it unheld.
    Stopping gives it `UPLOAD_HOLD_MS` (20 s). The note going, or View, releases it; so does leaving a session kept
    open. The hold lives in memory only, so a restart lets everything upload.
  - **Undo** is `undoRecording`. If that go at the recorder began the recording (a take always does), Undo deletes
    the whole recording as a delete does, tombstone rules included. If it carried on a day's session recording, only
    that go's segments and their page marks go, and the earlier recording stays. Those segments never uploaded; a
    segment that did is refused ("Couldn't undo"), since a segment can't leave the backup on its own.
  - With VoiceOver or TalkBack the note stays 15 s and is said aloud (never while the microphone is on).
  - **"Saved to today · Undo · View"** (REC-1, Nov 15 2026; `components/timer/SittingSavedToast`, `undoSitting` in
    `lib/sitting`): a sitting's note can be undone too. Undo deletes the session (`reading.delete`, as the day's Delete
    session) and undoes the recording that ended with it, the same way. That recording's hold lasts while the note
    shows. The timer's `finish()` returns the saved session's id for it.
- **Listing:** the backup is listed on an account's first run, then at most every 15 minutes.
- **Account deletion:** `deleteUserAccount` deletes the Storage prefix first.
- **Known limits:**
  - NetInfo reports an iPhone hotspot as Wi-Fi.
  - File uploads aren't gated on the server. A phone that hasn't yet heard that backup is off, or that is still signed in to an account deleted elsewhere (its ID token lasts up to an hour), can leave files without a record. A Storage rule using `firestore.get` would close this. It needs the IAM role `roles/firebaserules.firestoreServiceAgent` for the Storage service agent (`firebase deploy --only storage` prompts to grant it), so it isn't in place yet.
  - Two phones restored from one iCloud backup both own its open recording. Their name clash is reported and the file skipped, never overwritten.
  - Tombstones accumulate, adding listing reads.
- **Deploy order:** `firestore.rules` and `storage.rules` must be live before this reaches `develop`, which publishes to `preview` at once (`firebase deploy --only firestore:rules,storage`). Keep the profile-image rules that were live before.
- **Release:** the client is JS-only but reaches App Store users only with 1.0.2 (develop's runtime is build 19's). The App Privacy answers (Audio Data: collected, linked, App Functionality) must be updated before 1.0.2 goes to review.
- **Emulator check of the real requests:**
  `firebase emulators:exec --only storage --project demo-revisely 'npx jest recordingCloud.emulator'`.
