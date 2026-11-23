/* recite_core.h with no engine behind it: what a build without RECITE_CORE_TOKEN links (CI, E2E, forks, claude-fix).
 * Every call says "not available", so the app uses the server path. The real engine is private and never in this
 * repository: core/fetch.js brings its compiled library into a build that holds the token. */
#include "recite_core.h"

#include <stdio.h>

static void none(int* code, char* err, size_t cap) {
  if (code) *code = RC_ERR_MODEL;
  if (err && cap) snprintf(err, cap, "this build has no on-device engine");
}

int rc_abi(void) { return RC_ABI; }
const char* rc_version(void) { return "stub"; }
const char* rc_info(const rc_engine* e) { (void)e; return "{\"abi\":1,\"version\":\"stub\",\"levels\":[]}"; }

rc_engine* rc_open(const rc_blob* blobs, size_t n, const char* options, int* code, char* err, size_t cap) {
  (void)blobs; (void)n; (void)options;
  none(code, err, cap);
  return NULL;
}
void rc_release(rc_engine* e) { (void)e; }

rc_session* rc_start(rc_engine* e, const char* start, int* code, char* err, size_t cap) {
  (void)e; (void)start;
  none(code, err, cap);
  return NULL;
}
void rc_close(rc_session* s) { (void)s; }

int rc_feed(rc_session* s, const int16_t* pcm, size_t samples) { (void)s; (void)pcm; (void)samples; return RC_ERR_STATE; }
int rc_control(rc_session* s, const char* frame) { (void)s; (void)frame; return RC_ERR_STATE; }
int rc_finish(rc_session* s) { (void)s; return RC_ERR_STATE; }
int rc_poll(rc_session* s, char* out, size_t cap, size_t* needed) {
  (void)s; (void)out; (void)cap; (void)needed;
  return RC_ERR_STATE;
}
size_t rc_clip(const rc_session* s, int64_t s0, int64_t s1, int16_t* out, size_t cap) {
  (void)s; (void)s0; (void)s1; (void)out; (void)cap;
  return 0;
}
