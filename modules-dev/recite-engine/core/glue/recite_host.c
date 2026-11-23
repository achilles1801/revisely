/* See recite_host.h. */
#include "recite_host.h"

#include <stdlib.h>

int rh_drain(rc_session* session, rh_emit emit, void* ctx) {
  char first[8192];
  char* buf = first;
  size_t cap = sizeof first;
  int count = 0, result = 0;
  for (;;) {
    size_t needed = 0;
    const int n = rc_poll(session, buf, cap, &needed);
    if (n == 0) break;
    if (n == RC_ERR_SPACE) {
      /* An engine that asks for no more than it was offered would loop here for good. */
      if (needed <= cap) {
        result = RC_ERR_SPACE;
        break;
      }
      char* bigger = (char*)malloc(needed);
      if (!bigger) {
        result = RC_ERR_SPACE;
        break;
      }
      if (buf != first) free(buf);
      buf = bigger;
      cap = needed;
      continue;
    }
    if (n < 0) {
      result = n;
      break;
    }
    emit(ctx, buf, (size_t)n);
    count++;
  }
  if (buf != first) free(buf);
  return result < 0 ? result : count;
}
