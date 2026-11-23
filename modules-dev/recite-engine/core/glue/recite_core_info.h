/* Which engine this build linked, for Settings → Testing and the build's own check (on-device-plan.md §14.7). */
#ifndef RECITE_CORE_INFO_H
#define RECITE_CORE_INFO_H
#ifdef __cplusplus
extern "C" {
#endif
/* JSON: {"version","abi","headerAbi","stub","selfTest"}. selfTest: "passed", "skipped" (the stub, or an engine that needs
 * its data pack) or "failed: <step>". Static storage; safe to call from any thread after the first call returns. */
const char* recite_core_info_json(void);
#ifdef __cplusplus
}
#endif
#endif
