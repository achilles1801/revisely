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

/* How a take kept up on this phone (the lead, Nov 23 2026): the host times each rc_feed and says how much audio is still
 * waiting. All doubles, so Android holds one in a double[] and nothing needs freeing. */
typedef struct {
  double hop_s;
  double fed;
  double hops;
  double late_hops;
  double worst_hop_ms;
  double max_lag_s;
  double thermal_start;
} rh_meter;

#define RH_METER_DOUBLES 7

/* `thermal`: the platform's state as a number, or negative where it gives none. */
void rh_meter_start(rh_meter* m, double hop_s, int thermal);

/* After an rc_feed of `samples` that took `ms`. `waiting`: samples handed over and not yet finished, these included. */
void rh_meter_fed(rh_meter* m, size_t samples, double ms, long long waiting);

/* The host's own `meter` frame, for the take's health line. Returns its length, or 0 if it doesn't fit. */
int rh_meter_frame(const rh_meter* m, int thermal, char* out, size_t cap);

#ifdef __cplusplus
}
#endif
#endif
