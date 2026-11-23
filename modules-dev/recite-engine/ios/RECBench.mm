// See RECBench.h.
#import "RECBench.h"
#import <mach/mach.h>

#include "RECBenchCore.hpp"

static std::string str(NSDictionary *d, NSString *key) {
  id v = d[key];
  return [v isKindOfClass:[NSString class]] ? std::string([(NSString *)v UTF8String]) : std::string();
}

static int num(NSDictionary *d, NSString *key, int fallback) {
  id v = d[key];
  return [v isKindOfClass:[NSNumber class]] ? [(NSNumber *)v intValue] : fallback;
}

static NSArray<NSNumber *> *numbers(const std::vector<double> &v) {
  NSMutableArray *a = [NSMutableArray arrayWithCapacity:v.size()];
  for (double x : v) [a addObject:@(x)];
  return a;
}

@implementation RECBench

+ (double)footprintMb {
  task_vm_info_data_t info;
  mach_msg_type_number_t count = TASK_VM_INFO_COUNT;
  if (task_info(mach_task_self(), TASK_VM_INFO, (task_info_t)&info, &count) != KERN_SUCCESS) return 0;
  return info.phys_footprint / 1048576.0;
}

+ (NSDictionary<NSString *, id> *)run:(NSDictionary<NSString *, id> *)options
                             progress:(void (^)(NSInteger, NSInteger))progress {
  rec::Plan plan;
  plan.model = str(options, @"model");
  plan.provider = str(options, @"provider");
  if (plan.provider.empty()) plan.provider = "cpu";
  plan.threads = num(options, @"threads", 0);
  NSDictionary *providerOptions = options[@"options"];
  if ([providerOptions isKindOfClass:[NSDictionary class]]) {
    for (id key in providerOptions) {
      id value = providerOptions[key];
      if ([key isKindOfClass:[NSString class]] && [value isKindOfClass:[NSString class]])
        plan.options[[(NSString *)key UTF8String]] = [(NSString *)value UTF8String];
    }
  }
  plan.cacheDir = str(options, @"cacheDir");
  plan.melFilters = str(options, @"melFilters");
  plan.hann = str(options, @"hann");
  plan.audio = str(options, @"audio");
  plan.windows = num(options, @"windows", 60);
  plan.warmup = num(options, @"warmup", 2);
  NSDictionary *check = options[@"check"];
  if ([check isKindOfClass:[NSDictionary class]]) {
    plan.checkPcm = str(check, @"pcm");
    plan.checkMel = str(check, @"mel");
    plan.checkOut = str(check, @"out");
    plan.checkS0 = num(check, @"s0", 0);
    plan.checkEnd = num(check, @"end", 0);
  }

  rec::Result r = rec::runPlan(
      plan, [] { return [RECBench footprintMb]; },
      [progress](int done, int total) {
        if (progress) progress(done, total);
      });

  NSMutableArray *inputs = [NSMutableArray array];
  for (const auto &name : r.inputs) [inputs addObject:[NSString stringWithUTF8String:name.c_str()]];
  NSMutableArray *shape = [NSMutableArray array];
  for (int64_t d : r.outShape) [shape addObject:@(d)];
  id checkResult = [NSNull null];
  if (r.checked) {
    checkResult = @{
      @"frames" : @(r.checkFrames),
      @"melMaxDiff" : @(r.melMaxDiff),
      @"outMaxDiff" : @(r.outMaxDiff),
      @"outTopSame" : @(r.outTopSame),
      @"ownMaxDiff" : @(r.ownMaxDiff),
      @"ownTopSame" : @(r.ownTopSame),
    };
  }
  return @{
    @"ok" : @(r.ok),
    @"error" : r.error.empty() ? [NSNull null] : [NSString stringWithUTF8String:r.error.c_str()],
    @"loadMs" : @(r.loadMs),
    @"firstRunMs" : @(r.firstRunMs),
    @"reloadMs" : @(r.reloadMs),
    @"featureMs" : numbers(r.featureMs),
    @"runMs" : numbers(r.runMs),
    @"inputs" : inputs,
    @"outShape" : shape,
    @"memoryBeforeMb" : @(r.memoryBeforeMb),
    @"memoryLoadedMb" : @(r.memoryLoadedMb),
    @"memoryAfterMb" : @(r.memoryAfterMb),
    @"check" : checkResult,
    @"checkError" : r.checkError.empty() ? [NSNull null] : [NSString stringWithUTF8String:r.checkError.c_str()],
  };
}

@end
