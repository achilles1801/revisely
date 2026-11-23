/* See recite_host.h. */
#include "recite_host.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

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

void rh_meter_start(rh_meter* m, double hop_s, int thermal) {
  memset(m, 0, sizeof *m);
  m->hop_s = hop_s > 0 ? hop_s : 0.5;
  m->thermal_start = thermal;
}

void rh_meter_fed(rh_meter* m, size_t samples, double ms, long long waiting) {
  const long long hop = (long long)(m->hop_s * 16000.0 + 0.5);
  const long long before = (long long)m->fed / hop;
  m->fed += (double)samples;
  const long long crossed = (long long)m->fed / hop - before;
  const double lag = (double)waiting / 16000.0;
  if (lag > m->max_lag_s) m->max_lag_s = lag;
  if (crossed <= 0) return;
  /* A chunk that crossed two hops did the work of two. */
  const double per_hop = ms / (double)crossed;
  m->hops += (double)crossed;
  if (per_hop > m->worst_hop_ms) m->worst_hop_ms = per_hop;
  if (per_hop > m->hop_s * 1000.0) m->late_hops += (double)crossed;
}

int rh_meter_frame(const rh_meter* m, int thermal, char* out, size_t cap) {
  /* Whole numbers only, so no locale can put a comma in the JSON. */
  const long long lag_ms = (long long)(m->max_lag_s * 1000.0 + 0.5);
  int n = snprintf(out, cap, "{\"type\":\"meter\",\"hops\":%lld,\"late_hops\":%lld,\"worst_hop_ms\":%lld,\"max_lag_s\":%lld.%03lld",
                   (long long)m->hops, (long long)m->late_hops, (long long)(m->worst_hop_ms + 0.5), lag_ms / 1000, lag_ms % 1000);
  if (n < 0 || (size_t)n >= cap) return 0;
  if (m->thermal_start >= 0) {
    const int more = snprintf(out + n, cap - (size_t)n, ",\"thermal_start\":%d", (int)m->thermal_start);
    if (more < 0 || (size_t)(n + more) >= cap) return 0;
    n += more;
  }
  if (thermal >= 0) {
    const int more = snprintf(out + n, cap - (size_t)n, ",\"thermal_end\":%d", thermal);
    if (more < 0 || (size_t)(n + more) >= cap) return 0;
    n += more;
  }
  if ((size_t)n + 2 > cap) return 0;
  out[n++] = '}';
  out[n] = '\0';
  return n;
}
