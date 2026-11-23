/* JNI for ReciteCoreNative.kt: which engine this build linked, and recite_core.h for EngineHost. */
#include <jni.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "recite_core.h"
#include "recite_core_info.h"
#include "recite_host.h"

#define FN(name) Java_app_revisely_reciteengine_ReciteCoreNative_##name

JNIEXPORT jstring JNICALL FN(info)(JNIEnv* env, jobject self) {
  (void)self;
  return (*env)->NewStringUTF(env, recite_core_info_json());
}

/* A failed open or start: its code and message, for the host. */
static void report(JNIEnv* env, jintArray code, jobjectArray failure, int rc, const char* err) {
  jint value = rc;
  (*env)->SetIntArrayRegion(env, code, 0, 1, &value);
  jstring text = (*env)->NewStringUTF(env, err);
  if (text) (*env)->SetObjectArrayElement(env, failure, 0, text);
}

JNIEXPORT jlong JNICALL FN(open)(JNIEnv* env, jobject self, jobjectArray names, jobjectArray blobs, jstring options,
                                 jintArray code, jobjectArray failure) {
  (void)self;
  const jsize n = (*env)->GetArrayLength(env, names);
  rc_blob* items = (rc_blob*)calloc(n ? (size_t)n : 1, sizeof *items);
  jstring* name_refs = (jstring*)calloc(n ? (size_t)n : 1, sizeof *name_refs);
  jbyteArray* data_refs = (jbyteArray*)calloc(n ? (size_t)n : 1, sizeof *data_refs);
  if (!items || !name_refs || !data_refs || (*env)->EnsureLocalCapacity(env, 2 * n + 4) != 0) {
    free(items);
    free(name_refs);
    free(data_refs);
    (*env)->ExceptionClear(env);
    report(env, code, failure, RC_ERR_DATA, "out of memory");
    return 0;
  }
  jsize held = 0;
  int ok = 1;
  for (; held < n; held++) {
    name_refs[held] = (jstring)(*env)->GetObjectArrayElement(env, names, held);
    data_refs[held] = (jbyteArray)(*env)->GetObjectArrayElement(env, blobs, held);
    items[held].name = (*env)->GetStringUTFChars(env, name_refs[held], NULL);
    items[held].size = (size_t)(*env)->GetArrayLength(env, data_refs[held]);
    items[held].data = (*env)->GetByteArrayElements(env, data_refs[held], NULL);
    items[held].copy = 1; /* the engine keeps what it needs: the Java arrays go when this returns */
    if (!items[held].name || !items[held].data) {
      ok = 0;
      held++;
      break;
    }
  }
  int rc = RC_ERR_DATA;
  char err[256] = "out of memory";
  rc_engine* engine = NULL;
  if (ok) {
    const char* opts = (*env)->GetStringUTFChars(env, options, NULL);
    if (opts) {
      err[0] = 0;
      engine = rc_open(items, (size_t)n, opts, &rc, err, sizeof err);
      (*env)->ReleaseStringUTFChars(env, options, opts);
    }
  }
  for (jsize i = 0; i < held; i++) {
    if (items[i].name) (*env)->ReleaseStringUTFChars(env, name_refs[i], items[i].name);
    if (items[i].data) (*env)->ReleaseByteArrayElements(env, data_refs[i], (jbyte*)items[i].data, JNI_ABORT);
    (*env)->DeleteLocalRef(env, name_refs[i]);
    (*env)->DeleteLocalRef(env, data_refs[i]);
  }
  free(items);
  free(name_refs);
  free(data_refs);
  if (!engine) {
    report(env, code, failure, rc, err);
    return 0;
  }
  return (jlong)(intptr_t)engine;
}

/* rc_open over direct buffers, which the engine reads without copying: they outlive it (EngineHost). */
JNIEXPORT jlong JNICALL FN(openBlobs)(JNIEnv* env, jobject self, jobjectArray names, jobjectArray buffers, jstring options,
                                      jintArray code, jobjectArray failure) {
  (void)self;
  const jsize n = (*env)->GetArrayLength(env, names);
  rc_blob* items = (rc_blob*)calloc(n ? (size_t)n : 1, sizeof *items);
  jstring* name_refs = (jstring*)calloc(n ? (size_t)n : 1, sizeof *name_refs);
  if (!items || !name_refs || (*env)->EnsureLocalCapacity(env, n + 4) != 0) {
    free(items);
    free(name_refs);
    (*env)->ExceptionClear(env);
    report(env, code, failure, RC_ERR_DATA, "out of memory");
    return 0;
  }
  int rc = RC_ERR_DATA;
  char err[256] = "a blob isn't a direct buffer";
  int ok = 1;
  jsize held = 0;
  for (; held < n && ok; held++) {
    name_refs[held] = (jstring)(*env)->GetObjectArrayElement(env, names, held);
    items[held].name = (*env)->GetStringUTFChars(env, name_refs[held], NULL);
    jobject buffer = (*env)->GetObjectArrayElement(env, buffers, held);
    items[held].data = (*env)->GetDirectBufferAddress(env, buffer);
    const jlong size = (*env)->GetDirectBufferCapacity(env, buffer);
    (*env)->DeleteLocalRef(env, buffer);
    items[held].size = size > 0 ? (size_t)size : 0;
    items[held].copy = 0;
    ok = items[held].name && items[held].data && size >= 0;
  }
  rc_engine* engine = NULL;
  if (ok) {
    const char* opts = (*env)->GetStringUTFChars(env, options, NULL);
    if (opts) {
      err[0] = 0;
      engine = rc_open(items, (size_t)n, opts, &rc, err, sizeof err);
      (*env)->ReleaseStringUTFChars(env, options, opts);
    }
  }
  for (jsize i = 0; i < held; i++) {
    if (items[i].name) (*env)->ReleaseStringUTFChars(env, name_refs[i], items[i].name);
    (*env)->DeleteLocalRef(env, name_refs[i]);
  }
  free(items);
  free(name_refs);
  (*env)->ExceptionClear(env);
  if (!engine) {
    report(env, code, failure, rc, err);
    return 0;
  }
  return (jlong)(intptr_t)engine;
}

JNIEXPORT jobject JNICALL FN(allocBlob)(JNIEnv* env, jobject self, jint size) {
  (void)self;
  void* memory = NULL;
  if (size < 0 || posix_memalign(&memory, 64, size > 0 ? (size_t)size : 1) != 0) return NULL;
  jobject buffer = (*env)->NewDirectByteBuffer(env, memory, size);
  if (!buffer) free(memory);
  return buffer;
}

JNIEXPORT void JNICALL FN(freeBlob)(JNIEnv* env, jobject self, jobject buffer) {
  (void)self;
  free((*env)->GetDirectBufferAddress(env, buffer));
}

JNIEXPORT void JNICALL FN(release)(JNIEnv* env, jobject self, jlong engine) {
  (void)env;
  (void)self;
  rc_release((rc_engine*)(intptr_t)engine);
}

JNIEXPORT jstring JNICALL FN(engineInfo)(JNIEnv* env, jobject self, jlong engine) {
  (void)self;
  return (*env)->NewStringUTF(env, rc_info((const rc_engine*)(intptr_t)engine));
}

JNIEXPORT jint JNICALL FN(probe)(JNIEnv* env, jobject self, jlong engine) {
  (void)env;
  (void)self;
  return rc_probe((rc_engine*)(intptr_t)engine);
}

JNIEXPORT jlong JNICALL FN(start)(JNIEnv* env, jobject self, jlong engine, jstring frame, jintArray code,
                                  jobjectArray failure) {
  (void)self;
  const char* text = (*env)->GetStringUTFChars(env, frame, NULL);
  if (!text) {
    (*env)->ExceptionClear(env);
    report(env, code, failure, RC_ERR_ARG, "out of memory");
    return 0;
  }
  int rc = RC_OK;
  char err[256] = "";
  rc_session* session = rc_start((rc_engine*)(intptr_t)engine, text, &rc, err, sizeof err);
  (*env)->ReleaseStringUTFChars(env, frame, text);
  if (!session) {
    report(env, code, failure, rc, err);
    return 0;
  }
  return (jlong)(intptr_t)session;
}

JNIEXPORT void JNICALL FN(close)(JNIEnv* env, jobject self, jlong session) {
  (void)env;
  (void)self;
  rc_close((rc_session*)(intptr_t)session);
}

JNIEXPORT jint JNICALL FN(feed)(JNIEnv* env, jobject self, jlong session, jbyteArray pcm, jint samples) {
  (void)self;
  if (samples <= 0 || (*env)->GetArrayLength(env, pcm) < samples * 2) return RC_ERR_ARG;
  /* A copy of its own: a Java byte array promises no alignment for int16_t, and the hop must not hold the GC. */
  int16_t* copy = (int16_t*)malloc((size_t)samples * sizeof(int16_t));
  if (!copy) return RC_ERR_ARG;
  (*env)->GetByteArrayRegion(env, pcm, 0, samples * 2, (jbyte*)copy);
  const int r = rc_feed((rc_session*)(intptr_t)session, copy, (size_t)samples);
  free(copy);
  return r;
}

JNIEXPORT jint JNICALL FN(control)(JNIEnv* env, jobject self, jlong session, jstring frame) {
  (void)self;
  const char* text = (*env)->GetStringUTFChars(env, frame, NULL);
  if (!text) {
    (*env)->ExceptionClear(env);
    return RC_ERR_ARG;
  }
  const int r = rc_control((rc_session*)(intptr_t)session, text);
  (*env)->ReleaseStringUTFChars(env, frame, text);
  return r;
}

JNIEXPORT jint JNICALL FN(finish)(JNIEnv* env, jobject self, jlong session) {
  (void)env;
  (void)self;
  return rc_finish((rc_session*)(intptr_t)session);
}

/* The frames packed one after another as a little-endian u32 length and the bytes: UTF-8 as the engine wrote it, where
 * NewStringUTF would want Java's modified UTF-8. */
typedef struct {
  char* data;
  size_t size, cap;
  int failed;
} sink;

static void pack(void* ctx, const char* frame, size_t len) {
  sink* out = (sink*)ctx;
  if (out->failed) return;
  if (out->size + 4 + len > out->cap) {
    size_t cap = out->cap ? out->cap * 2 : 16384;
    while (cap < out->size + 4 + len) cap *= 2;
    char* bigger = (char*)realloc(out->data, cap);
    if (!bigger) {
      out->failed = 1;
      return;
    }
    out->data = bigger;
    out->cap = cap;
  }
  const uint32_t n = (uint32_t)len;
  const unsigned char head[4] = {(unsigned char)n, (unsigned char)(n >> 8), (unsigned char)(n >> 16), (unsigned char)(n >> 24)};
  memcpy(out->data + out->size, head, 4);
  memcpy(out->data + out->size + 4, frame, len);
  out->size += 4 + len;
}

JNIEXPORT jbyteArray JNICALL FN(drain)(JNIEnv* env, jobject self, jlong session, jintArray code) {
  (void)self;
  sink out = {NULL, 0, 0, 0};
  jint result = rh_drain((rc_session*)(intptr_t)session, pack, &out);
  if (out.failed && result >= 0) result = RC_ERR_SPACE;
  (*env)->SetIntArrayRegion(env, code, 0, 1, &result);
  jbyteArray packed = NULL;
  if (out.size > 0) {
    packed = (*env)->NewByteArray(env, (jsize)out.size);
    if (packed) (*env)->SetByteArrayRegion(env, packed, 0, (jsize)out.size, (const jbyte*)out.data);
  }
  free(out.data);
  return packed;
}

/* recite_host.h's meter, held by EngineHost in a double[]. */
JNIEXPORT jdoubleArray JNICALL FN(meterStart)(JNIEnv* env, jobject self, jdouble hop, jint thermal) {
  (void)self;
  rh_meter m;
  rh_meter_start(&m, hop, thermal);
  jdoubleArray out = (*env)->NewDoubleArray(env, RH_METER_DOUBLES);
  if (out) (*env)->SetDoubleArrayRegion(env, out, 0, RH_METER_DOUBLES, (const jdouble*)&m);
  return out;
}

JNIEXPORT void JNICALL FN(meterFed)(JNIEnv* env, jobject self, jdoubleArray meter, jint samples, jdouble ms, jlong waiting) {
  (void)self;
  rh_meter m;
  (*env)->GetDoubleArrayRegion(env, meter, 0, RH_METER_DOUBLES, (jdouble*)&m);
  rh_meter_fed(&m, (size_t)samples, ms, (long long)waiting);
  (*env)->SetDoubleArrayRegion(env, meter, 0, RH_METER_DOUBLES, (const jdouble*)&m);
}

JNIEXPORT jstring JNICALL FN(meterFrame)(JNIEnv* env, jobject self, jdoubleArray meter, jint thermal) {
  (void)self;
  rh_meter m;
  char text[256];
  (*env)->GetDoubleArrayRegion(env, meter, 0, RH_METER_DOUBLES, (jdouble*)&m);
  return rh_meter_frame(&m, thermal, text, sizeof text) > 0 ? (*env)->NewStringUTF(env, text) : NULL;
}

/* rc_clip for the teacher's clips: all the samples asked for, or NULL. `/second` takes 20 s at most. */
JNIEXPORT jbyteArray JNICALL FN(clip)(JNIEnv* env, jobject self, jlong session, jlong s0, jlong s1) {
  (void)self;
  const jlong samples = s1 - s0;
  if (s0 < 0 || samples <= 0 || samples > 320000) return NULL;
  int16_t* pcm = (int16_t*)malloc((size_t)samples * sizeof *pcm);
  if (!pcm) return NULL;
  jbyteArray out = NULL;
  if (rc_clip((const rc_session*)(intptr_t)session, s0, s1, pcm, (size_t)samples) == (size_t)samples) {
    out = (*env)->NewByteArray(env, (jsize)(samples * 2));
    if (out) (*env)->SetByteArrayRegion(env, out, 0, (jsize)(samples * 2), (const jbyte*)pcm);
  }
  free(pcm);
  return out;
}
