# The native library of Recite on the phone: the JNI glue over recite_core.h, linked with the private engine or its stub
# (../core/recite_core.cmake). Nothing of the engine is exported from the .so: only the JNI functions are.
cmake_minimum_required(VERSION 3.22.1)
project(reciteengine C CXX)

set(CMAKE_C_VISIBILITY_PRESET hidden)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)

include(${CMAKE_CURRENT_SOURCE_DIR}/../core/recite_core.cmake)

add_library(reciteengine SHARED
  src/main/cpp/core_jni.c
  ${RECITE_CORE_OUT}/glue/recite_core_info.c
  ${RECITE_CORE_OUT}/glue/recite_host.c)
target_include_directories(reciteengine PRIVATE ${RECITE_CORE_OUT}/glue)
target_link_libraries(reciteengine PRIVATE recite_core)
# These sources are C and the engine is C++: only a C++ link brings its runtime.
set_target_properties(reciteengine PROPERTIES LINKER_LANGUAGE CXX)
# The real engine calls ONNX Runtime; the stub doesn't.
if(EXISTS "${RECITE_CORE_OUT}/lib/${ANDROID_ABI}/librecite_core.a")
  target_link_libraries(reciteengine PRIVATE "${ONNXRUNTIME_JNI}/${ANDROID_ABI}/libonnxruntime.so")
endif()
# 16 KB pages (Android 15+; every native library in the app is aligned), and no symbol of a static library exported.
target_link_options(reciteengine PRIVATE -Wl,-z,max-page-size=16384 -Wl,--exclude-libs,ALL)
