/* JNI for ReciteCoreNative.kt: which engine this build linked. The transport's glue joins this library. */
#include <jni.h>

#include "recite_core_info.h"

JNIEXPORT jstring JNICALL Java_app_revisely_reciteengine_ReciteCoreNative_info(JNIEnv* env, jobject self) {
  (void)self;
  return (*env)->NewStringUTF(env, recite_core_info_json());
}
