# The target `recite_core` for this ABI, from what core/fetch.js put in RECITE_CORE_OUT: the private engine's library
# when the build held the token, otherwise the stub (and always the stub for an ABI the release doesn't carry, x86).
if(NOT RECITE_CORE_OUT)
  message(FATAL_ERROR "RECITE_CORE_OUT is not set: android/build.gradle runs core/fetch.js and passes it")
endif()

set(_recite_core_lib "${RECITE_CORE_OUT}/lib/${ANDROID_ABI}/librecite_core.a")
if(EXISTS "${_recite_core_lib}")
  add_library(recite_core STATIC IMPORTED GLOBAL)
  set_target_properties(recite_core PROPERTIES
    IMPORTED_LOCATION "${_recite_core_lib}"
    INTERFACE_INCLUDE_DIRECTORIES "${RECITE_CORE_OUT}/include")
else()
  add_library(recite_core STATIC "${RECITE_CORE_OUT}/stub/recite_core_stub.c")
  target_include_directories(recite_core PUBLIC "${RECITE_CORE_OUT}/include")
  set_target_properties(recite_core PROPERTIES C_VISIBILITY_PRESET hidden)
endif()
