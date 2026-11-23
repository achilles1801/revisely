/* recite-core: the Recite engine's C ABI (on-device-plan.md, section 5). One header, the whole surface.
 *
 * The engine checks a recitation as it is fed: it finds the place, follows, marks, scores. It speaks the socket
 * contract (recite-contract.md): the host gives it the contract's start and control frames as JSON and reads the
 * contract's frames back as JSON. So a phone's native module, a server's socket handler and a replay tool drive it
 * the same way.
 *
 * Rules:
 * - Time is audio time. The engine has no clock and starts no threads; the same input gives the same frames.
 * - One thread at a time per session. Sessions of one engine may run on different threads.
 * - Strings are UTF-8 JSON, NUL-terminated. Nothing the engine returns must be freed by the caller.
 * - No call throws or aborts on bad input: it returns an error code and, where there is room for one, a message.
 */
#ifndef RECITE_CORE_H
#define RECITE_CORE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define RC_ABI 1 /* raised when this header changes incompatibly; rc_abi() must equal it */

#define RC_OK 0
#define RC_ERR_ARG (-1)    /* a null or malformed argument */
#define RC_ERR_DATA (-2)   /* a blob missing, damaged, or made for another engine or pack version */
#define RC_ERR_MODEL (-3)  /* a model would not load (rc_open), or a take needs one that failed its check (rc_start) */
#define RC_ERR_STATE (-4)  /* the call is not allowed now (feeding a finished session) */
#define RC_ERR_SPACE (-5)  /* the caller's buffer is too small; see rc_poll */

typedef struct rc_engine rc_engine;
typedef struct rc_session rc_session;

/* A named piece of the data pack, in memory. The host decrypts the pack and hands the bytes over; the engine never
 * opens a file by itself. The bytes must stay valid until rc_release, unless `copy` is set. The names:
 *   tables   "words.rcwt", "ayahs.bin", "norms.bin", "stops.bin", "lexicon.bin", "letters.bin", "mel.bin",
 *            "config.json" (checker/pack.py), and for Strict "strict.bin" (checker/pack_strict.py)
 *   identity "manifest.json" (optional): only its `version` and `content` are read, for rc_info's `pack` and
 *            `pack_content`. It is no check: missing or unreadable, the pack still opens, named by its word table's key.
 *   v7       "v7.graph.onnx" (the any-length graph, its weights external), "v7.weights.json" (each tensor's name,
 *            offsets and shape, and `fp32_bytes`), "v7.weights.f16" (the weights as fp16, widened to fp32 in place:
 *            writable, `copy` 0, 64-byte aligned, the fp16 data at its start, and `size` is the whole buffer, at
 *            least `fp32_bytes`). The engine takes the fp16 length from the layout and never writes past `size`.
 *            The layout is untrusted: every tensor's fp16 and fp32 range must lie inside `size`, and no fp32 range
 *            may overlap another. A buffer or layout that fails this is RC_ERR_DATA, with a message.
 *            and "v7.check" (a known input and v7's expected answer: the load-time self-check; with it absent
 *            the engine reports self_check as not run and the host decides)
 *   Strict   "v5.onnx" (self-contained), or "v5.graph.onnx", "v5.weights.json", "v5.weights.f16" under v7's rules; never
 *            both. "v5.check" as v7's.
 * A level whose blobs are missing is simply not in rc_info's levels. */
typedef struct {
  const char* name;
  const void* data;
  size_t size;
  int copy; /* nonzero: the engine copies what it needs, and the caller may free the bytes after rc_open */
} rc_blob;

/* What is for the host alone. None of it is in the app's socket contract or reaches the app's state code:
 *   start frame, in   "clips": true   the host can send this take's clips to the teacher: it is signed in, online at
 *                     the start, and the server has /second. Without it the engine emits no `clip` frames and every
 *                     mark stands on the phone's own verdict, which is a valid take. On an engine whose rc_info lacks
 *                     can.clips, rc_start refuses it with RC_ERR_ARG.
 *   control, in       {"type":"verdict","id":…,"verdict":"keep|veto|confirm"}  the teacher's answer to a clip
 *   frame, out        {"type":"clip","id":…,"kind":"word"|"letters",…,"s0":…,"s1":…}  cut samples [s0, s1) with
 *                     rc_clip and send them to /second (contract draft 14)
 *   frame, out        {"type":"health",…}  numbers only, once, after `done` */

int rc_abi(void);
const char* rc_version(void); /* "recite-core 0.1.0 (abc1234)" */

/* Opens the engine: reads the tables, creates the models' sessions, runs the load-time check.
 * options_json: {"threads": 2, "levels": ["recite", "harakat", "strict"], "hop": 0.5} (all optional). `hop` is 0.5 or 1
 * (seconds between the model's runs; anything else is RC_ERR_ARG). A phone at 1 s is held to the 1 s goldens.
 * A model that fails its load-time check does not fail rc_open: the engine opens, rc_info reports the numbers with
 * `ok` false and leaves out what that model does, and rc_start refuses takes that need it with RC_ERR_MODEL.
 * Returns NULL on failure (a bad pack, or a model that will not load) with *code set and a message in err. */
rc_engine* rc_open(const rc_blob* blobs, size_t n_blobs, const char* options_json, int* code, char* err, size_t err_cap);
void rc_release(rc_engine*);

/* What this engine can do, as JSON. Valid until rc_release. A host sends the engine only takes it can do, and tells
 * the app in `ready` only what the engine says here. Keys (a missing key means no):
 *   "abi", "version", "protocol", "hop"
 *   "pack"            the manifest's `version` (with no manifest blob, or one from before it, the word table's key)
 *   "pack_content"    the manifest's `content`, a hash over every file of the pack (absent in those cases)
 *   "levels": ["recite", "harakat", "strict"]  the levels it runs at all
 *   "can": {"letters": bool,    harakat and letter marks (a letters-on take needs it)
 *           "tajweed": bool,    Strict's notes
 *           "names": bool,      `into` (where a slip went)
 *           "startBy": bool, "startIn": bool,  finding the start on the page, and anywhere in the Qur'an
 *           "controls": bool,   seek, hint, dismiss, undismiss
 *           "clips": bool}      it emits `clip` frames and takes `verdict` controls
 *   "said": "voice"             `said` follows the voice detector (the contract's `ready.said`); absent: it doesn't
 *   "self_check": {"ran": bool, "ok": bool, "max_diff": number,  every model that ran passed; the largest difference
 *                  "ort": "1.31.1",                               when a model is open: the runtime
 *                  "models": {"v7": M, "v5": M}}
 *      M: {"ran": false}, or {"ran": true, "ok": bool, "max_diff": number (log p), "top_diff": frames whose top sound
 *      differs, "not_finite": values that aren't finite, "frames": frames compared (0: the model gave no usable output),
 *      "tol": the check's bar}, with "prepacking": bool (the setting its session uses) whenever that model is open.
 *      `ok`: within tol, no top sound changed, every value finite. */
const char* rc_info(const rc_engine*);

/* Runs the model once on v7.check's input, on the calling thread, and does nothing else: the host times it to choose
 * the hop, or the server. No state changes and it is safe to call repeatedly, but never during a session's rc_feed on
 * the same engine. Space the calls as a take would (one per hop): a burst reads faster than live pace (48 ms against
 * 72 ms on an iPhone). Returns RC_OK, or RC_ERR_STATE when the pack has no check input. */
int rc_probe(rc_engine*);

/* Starts a take from the contract's start frame ({"type":"start","s":…,"a":…,…}), plus the host's `clips` key (above).
 * The first frame to poll is `ready` (or `error`). Returns NULL on failure with *code set and a message in err. */
rc_session* rc_start(rc_engine*, const char* start_frame_json, int* code, char* err, size_t err_cap);
void rc_close(rc_session*);

/* Audio: 16 kHz mono 16-bit, any chunking. Returns the number of frames waiting to be polled, or an error. */
int rc_feed(rc_session*, const int16_t* pcm, size_t samples);

/* A contract control frame, applied at this point of the audio: seek, hint, pause, resume, dismiss, undismiss; and the
 * host's own `verdict` (above). Returns the number of frames waiting, or an error. */
int rc_control(rc_session*, const char* frame_json);

/* The contract's `end`: the rest of the audio is checked and the take decided. Frames up to `done` (and `into`, when
 * the start frame asked for names after) wait to be polled. Returns their number, or an error. */
int rc_finish(rc_session*);

/* The next frame, as JSON. Returns its length in bytes (without the NUL), 0 when none waits, or RC_ERR_SPACE when cap
 * is too small: then *needed (if not null) is the size to offer and the frame stays queued. Beside the contract's
 * frames come the host's own `clip` and `health` (above). */
int rc_poll(rc_session*, char* out, size_t cap, size_t* needed);

/* The take's own audio, samples [s0, s1): for a clip and for playing a moment back. Returns the samples written. */
size_t rc_clip(const rc_session*, int64_t s0, int64_t s1, int16_t* out, size_t cap);

#ifdef __cplusplus
}
#endif
#endif
