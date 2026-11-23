// The on-device bench, for Swift (ReciteEngineModule.swift): options and results as dictionaries, the work in
// RECBenchCore.cpp. Blocking: call it off the main thread.
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface RECBench : NSObject

/** Runs one plan (model, provider, threads, the clip, the check); see index.ts's BenchPlan and BenchResult. */
+ (NSDictionary<NSString *, id> *)run:(NSDictionary<NSString *, id> *)options
                             progress:(void (^)(NSInteger done, NSInteger total))progress;

/** The app's memory footprint in MB (what iOS counts against it). */
+ (double)footprintMb;

@end

NS_ASSUME_NONNULL_END
