/* See recite_core_info.h. The self-test drives the replay stand-in through the whole C ABI with a three-frame take. */
#include "recite_core_info.h"

#include <stdio.h>
#include <string.h>

#include "recite_core.h"

static const char FRAMES[] =
    "{\"type\":\"ready\",\"take\":\"self\",\"protocol\":9,\"n\":0}\n"
    "{\"type\":\"at\",\"w\":1,\"t\":0.1,\"n\":1600}\n"
    "{\"type\":\"done\",\"n\":3200}\n";

static const char* self_test(void) {
  if (strstr(rc_version(), "stub")) return "skipped";
  if (!strstr(rc_version(), "replay")) return "skipped"; /* the real engine needs its data pack */
  rc_blob blob = {"frames.jsonl", FRAMES, sizeof FRAMES - 1, 1};
  int code = 0;
  char err[128] = "", frame[256];
  rc_engine* e = rc_open(&blob, 1, "{}", &code, err, sizeof err);
  if (!e) return "failed: open";
  rc_session* s = rc_start(e, "{\"type\":\"start\",\"s\":1,\"a\":1}", &code, err, sizeof err);
  if (!s) { rc_release(e); return "failed: start"; }
  static const int16_t silence[3200];
  const char* result = "passed";
  int got = 0;
  if (rc_feed(s, silence, 3200) < 0 || rc_finish(s) < 0) result = "failed: feed";
  while (rc_poll(s, frame, sizeof frame, NULL) > 0) got++;
  if (result[0] == 'p' && got != 3) result = "failed: frames";
  int16_t back[16];
  if (result[0] == 'p' && rc_clip(s, 0, 16, back, 16) != 16) result = "failed: clip";
  rc_close(s);
  rc_release(e);
  return result;
}

const char* recite_core_info_json(void) {
  static char json[256];
  if (!json[0]) {
    const char* version = rc_version();
    /* A version never holds a quote or a backslash, but this is JSON: keep it so. */
    char safe[64];
    size_t n = 0;
    for (const char* p = version; *p && n < sizeof safe - 1; p++)
      if (*p != '"' && *p != '\\') safe[n++] = *p;
    safe[n] = 0;
    snprintf(json, sizeof json, "{\"version\":\"%s\",\"abi\":%d,\"headerAbi\":%d,\"stub\":%s,\"selfTest\":\"%s\"}", safe,
             rc_abi(), RC_ABI, strstr(version, "stub") ? "true" : "false", self_test());
  }
  return json;
}
