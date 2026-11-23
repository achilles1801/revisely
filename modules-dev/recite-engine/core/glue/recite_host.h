/* What the iOS and Android glue share over recite_core.h. */
#ifndef RECITE_HOST_H
#define RECITE_HOST_H

#include <stddef.h>

#include "recite_core.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Called once per frame, in order. `frame` is NUL-terminated JSON and valid only during the call. */
typedef void (*rh_emit)(void* ctx, const char* frame, size_t len);

/* Every frame waiting on the session, however long: the buffer grows when rc_poll asks for more.
 * Returns how many were emitted, or a negative RC_ERR_* (the frames before it were still emitted). */
int rh_drain(rc_session* session, rh_emit emit, void* ctx);

#ifdef __cplusplus
}
#endif
#endif
