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
#define RC_ERR_MODEL (-3)  /* a model would not load, or failed its load-time check */
#define RC_ERR_STATE (-4)  /* the call is not allowed now (feeding a finished session) */
#define RC_ERR_SPACE (-5)  /* the caller's buffer is too small; see rc_poll */

typedef struct rc_engine rc_engine;
typedef struct rc_session rc_session;

/* A named piece of the data pack, in memory: "words.rcwt", "ayahs.bin", "config.json", "v7-live", "v7-any", "v5".
 * The host decrypts the pack and hands the bytes over; the engine never opens a file by itself. The bytes must stay
 * valid until rc_release, unless `copy` is set. */
typedef struct {
  const char* name;
  const void* data;
  size_t size;
  int copy; /* nonzero: the engine copies what it needs, and the caller may free the bytes after rc_open */
} rc_blob;

int rc_abi(void);
const char* rc_version(void); /* "recite-core 0.1.0 (abc1234)" */

/* Opens the engine: reads the tables, creates the models' sessions, runs the load-time check.
 * options_json: {"threads": 2, "levels": ["recite", "harakat", "strict"], "hop": 0.5} (all optional).
 * Returns NULL on failure with *code set and a message in err. */
rc_engine* rc_open(const rc_blob* blobs, size_t n_blobs, const char* options_json, int* code, char* err, size_t err_cap);
void rc_release(rc_engine*);

/* What this engine can do, as JSON: {"abi", "version", "pack", "levels", "protocol", "hop", "self_check": {...}}.
 * Valid until rc_release. */
const char* rc_info(const rc_engine*);

/* Starts a take from the contract's start frame ({"type":"start","s":…,"a":…,…}). The first frame to poll is
 * `ready` (or `error`). Returns NULL on failure with *code set and a message in err. */
rc_session* rc_start(rc_engine*, const char* start_frame_json, int* code, char* err, size_t err_cap);
void rc_close(rc_session*);

/* Audio: 16 kHz mono 16-bit, any chunking. Returns the number of frames waiting to be polled, or an error. */
int rc_feed(rc_session*, const int16_t* pcm, size_t samples);

/* A contract control frame, applied at this point of the audio: seek, hint, pause, resume, dismiss, undismiss; and
 * the host's own: {"type":"verdict","id":…,"verdict":"keep|veto|confirm"} for a clip the engine asked for.
 * Returns the number of frames waiting, or an error. */
int rc_control(rc_session*, const char* frame_json);

/* The contract's `end`: the rest of the audio is checked and the take decided. Frames up to `done` (and `into`, when
 * the start frame asked for names after) wait to be polled. Returns their number, or an error. */
int rc_finish(rc_session*);

/* The next frame, as JSON. Returns its length in bytes (without the NUL), 0 when none waits, or RC_ERR_SPACE when cap
 * is too small: then *needed (if not null) is the size to offer and the frame stays queued.
 * Beside the contract's frames the engine emits two for the host alone, which never reach the app's state code:
 *   {"type":"clip","id":…,"kind":"word"|"letters",…,"s0":…,"s1":…}  cut samples [s0, s1) with rc_clip and send
 *                                                                   them to /second (contract draft 14)
 *   {"type":"health",…}                                             numbers only, once, after `done` */
int rc_poll(rc_session*, char* out, size_t cap, size_t* needed);

/* The take's own audio, samples [s0, s1): for a clip and for playing a moment back. Returns the samples written. */
size_t rc_clip(const rc_session*, int64_t s0, int64_t s1, int16_t* out, size_t cap);

#ifdef __cplusplus
}
#endif
#endif
