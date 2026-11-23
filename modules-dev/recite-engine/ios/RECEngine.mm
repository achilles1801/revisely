#import "RECEngine.h"

#include <atomic>
#include <chrono>
#include <unordered_map>
#include <vector>

#include "recite_core.h"
#include "recite_host.h"

static void collect(void *ctx, const char *frame, size_t len) {
  NSString *text = [[NSString alloc] initWithBytes:frame length:len encoding:NSUTF8StringEncoding];
  if (text) [(__bridge NSMutableArray<NSString *> *)ctx addObject:text];
}

@interface RECEngine ()
@property(atomic, copy, nullable) NSString *info;
@end

@implementation RECEngineBlob
- (instancetype)initWithName:(NSString *)name bytes:(const void *)bytes size:(NSUInteger)size {
  if ((self = [super init])) {
    _name = [name copy];
    _bytes = bytes;
    _size = size;
  }
  return self;
}
@end

@implementation RECEngine {
  dispatch_queue_t _queue;
  rc_engine *_engine;
  id _blobOwner;  // what holds the memory of blobs the engine didn't copy
  std::unordered_map<NSInteger, rc_session *> _takes;
  std::unordered_map<NSInteger, rh_meter> _meters;
  std::atomic<long long> _waiting;  // samples handed over and not yet finished (the JS thread adds, the queue takes off)
  NSInteger _next;
}

+ (RECEngine *)shared {
  static RECEngine *engine;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    engine = [RECEngine new];
  });
  return engine;
}

- (instancetype)init {
  if ((self = [super init])) {
    _queue = dispatch_queue_create("app.revisely.recite-engine",
                                   dispatch_queue_attr_make_with_qos_class(DISPATCH_QUEUE_SERIAL, QOS_CLASS_USER_INITIATED, 0));
    _next = 1;
  }
  return self;
}

/// On the queue: everything the take has waiting, then the failed call's code if there was one.
- (void)drain:(NSInteger)take session:(rc_session *)session code:(int)code {
  [self drain:take session:session code:code then:nil];
}

/// `last`: a frame of the host's own, after the engine's.
- (void)drain:(NSInteger)take session:(rc_session *)session code:(int)code then:(nullable NSString *)last {
  NSMutableArray<NSString *> *frames = [NSMutableArray array];
  const int drained = rh_drain(session, collect, (__bridge void *)frames);
  if (last) [frames addObject:last];
  const int failed = code < 0 ? code : (drained < 0 ? drained : 0);
  RECEngineFrames emit = self.onFrames;
  if (emit && (frames.count > 0 || failed != 0)) emit(take, frames, failed);
}

/// On the queue.
- (void)closeAll {
  for (auto &entry : _takes) rc_close(entry.second);
  _takes.clear();
  _meters.clear();
  if (_engine) rc_release(_engine);
  _engine = nullptr;
  _blobOwner = nil;  // only now: the engine read from it until rc_release
  self.info = nil;
}

/// On the queue: rc_open over these blobs, and the answer.
- (BOOL)openNow:(const std::vector<rc_blob> &)blobs
        options:(NSString *)options
           done:(void (^)(NSDictionary<NSString *, id> *))done {
  int code = RC_OK;
  char err[256] = "";
  _engine = rc_open(blobs.data(), blobs.size(), options.UTF8String, &code, err, sizeof err);
  if (!_engine) {
    done(@{@"ok": @NO, @"code": @(code), @"error": [NSString stringWithUTF8String:err] ?: @""});
    return NO;
  }
  NSString *info = [NSString stringWithUTF8String:rc_info(_engine)] ?: @"{}";
  self.info = info;
  done(@{@"ok": @YES, @"code": @0, @"info": info});
  return YES;
}

- (void)openFiles:(NSArray<NSDictionary<NSString *, NSString *> *> *)items
          options:(NSString *)options
             done:(void (^)(NSDictionary<NSString *, id> *))done {
  dispatch_async(_queue, ^{
    [self closeAll];
    NSMutableArray<NSData *> *held = [NSMutableArray arrayWithCapacity:items.count];
    NSMutableArray<NSString *> *names = [NSMutableArray arrayWithCapacity:items.count];
    for (NSDictionary<NSString *, NSString *> *item in items) {
      NSData *data = item[@"path"] ? [NSData dataWithContentsOfFile:item[@"path"] options:NSDataReadingMappedIfSafe error:nil] : nil;
      if (!data || !item[@"name"]) {
        done(@{@"ok": @NO, @"code": @(RC_ERR_DATA), @"error": [NSString stringWithFormat:@"can't read %@", item[@"name"] ?: @"a blob"]});
        return;
      }
      [held addObject:data];
      [names addObject:item[@"name"]];
    }
    std::vector<rc_blob> blobs;
    for (NSUInteger i = 0; i < held.count; i++) {
      blobs.push_back({names[i].UTF8String, held[i].bytes, held[i].length, 1});
    }
    [self openNow:blobs options:options done:done];
  });
}

- (void)openBlobs:(NSArray<RECEngineBlob *> *)blobs
            owner:(id)owner
          options:(NSString *)options
             done:(void (^)(NSDictionary<NSString *, id> *))done {
  dispatch_async(_queue, ^{
    [self closeAll];
    std::vector<rc_blob> items;
    for (RECEngineBlob *blob in blobs) items.push_back({blob.name.UTF8String, blob.bytes, blob.size, 0});
    // Held before the answer: a take may start as soon as `done` has run.
    self->_blobOwner = owner;
    if (![self openNow:items options:options done:done]) self->_blobOwner = nil;
  });
}

- (void)startTake:(NSString *)frame hop:(double)hop done:(void (^)(NSDictionary<NSString *, id> *))done {
  dispatch_async(_queue, ^{
    if (!self->_engine) {
      done(@{@"code": @(RC_ERR_STATE), @"error": @"the engine isn't open"});
      return;
    }
    int code = RC_OK;
    char err[256] = "";
    rc_session *session = rc_start(self->_engine, frame.UTF8String, &code, err, sizeof err);
    if (!session) {
      done(@{@"code": @(code), @"error": [NSString stringWithUTF8String:err] ?: @""});
      return;
    }
    const NSInteger take = self->_next++;
    self->_takes[take] = session;
    rh_meter_start(&self->_meters[take], hop, static_cast<int>(NSProcessInfo.processInfo.thermalState));
    // Before its first frame: JavaScript has the take's number by the time `ready` reaches it.
    done(@{@"take": @(take)});
    [self drain:take session:session code:0];
  });
}

/// On the queue: the take's session, if it is still open.
- (rc_session *)sessionOf:(NSInteger)take {
  auto found = _takes.find(take);
  return found == _takes.end() ? nullptr : found->second;
}

- (void)feedTake:(NSInteger)take pcm:(NSData *)pcm {
  const size_t samples = pcm.length / sizeof(int16_t);
  _waiting.fetch_add(static_cast<long long>(samples));
  dispatch_async(_queue, ^{
    rc_session *session = [self sessionOf:take];
    if (!session) {
      self->_waiting.fetch_sub(static_cast<long long>(samples));
      return;
    }
    const auto t0 = std::chrono::steady_clock::now();
    const int r = rc_feed(session, static_cast<const int16_t *>(pcm.bytes), samples);
    const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
    const long long behind = self->_waiting.fetch_sub(static_cast<long long>(samples));
    auto meter = self->_meters.find(take);
    if (meter != self->_meters.end()) rh_meter_fed(&meter->second, samples, ms, behind);
    [self drain:take session:session code:r];
  });
}

- (void)controlTake:(NSInteger)take frame:(NSString *)frame {
  dispatch_async(_queue, ^{
    rc_session *session = [self sessionOf:take];
    if (!session) return;
    const int r = rc_control(session, frame.UTF8String);
    [self drain:take session:session code:r];
  });
}

- (void)finishTake:(NSInteger)take {
  dispatch_async(_queue, ^{
    rc_session *session = [self sessionOf:take];
    if (!session) return;
    const int r = rc_finish(session);
    NSString *meterFrame = nil;
    auto meter = self->_meters.find(take);
    if (meter != self->_meters.end()) {
      char text[256];
      const int thermal = static_cast<int>(NSProcessInfo.processInfo.thermalState);
      if (rh_meter_frame(&meter->second, thermal, text, sizeof text) > 0) meterFrame = [NSString stringWithUTF8String:text];
    }
    [self drain:take session:session code:r then:meterFrame];
  });
}

- (void)closeTake:(NSInteger)take {
  dispatch_async(_queue, ^{
    rc_session *session = [self sessionOf:take];
    if (!session) return;
    rc_close(session);
    self->_takes.erase(take);
    self->_meters.erase(take);
  });
}

- (void)clipTake:(NSInteger)take from:(int64_t)s0 to:(int64_t)s1 done:(void (^)(NSString *_Nullable))done {
  dispatch_async(_queue, ^{
    rc_session *session = [self sessionOf:take];
    const int64_t samples = s1 - s0;
    // `/second` takes 20 s at most.
    if (!session || s0 < 0 || samples <= 0 || samples > 320000) {
      done(nil);
      return;
    }
    NSMutableData *pcm = [NSMutableData dataWithLength:static_cast<NSUInteger>(samples) * sizeof(int16_t)];
    const size_t got = rc_clip(session, s0, s1, static_cast<int16_t *>(pcm.mutableBytes), static_cast<size_t>(samples));
    done(got == static_cast<size_t>(samples) ? [pcm base64EncodedStringWithOptions:0] : nil);
  });
}

- (void)probe:(void (^)(double))done {
  dispatch_async(_queue, ^{
    // Never beside a take: rc_probe mustn't run during an rc_feed, and its time would say nothing.
    if (!self->_engine || !self->_takes.empty()) {
      done(-1);
      return;
    }
    const auto t0 = std::chrono::steady_clock::now();
    const int r = rc_probe(self->_engine);
    const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
    done(r == RC_OK ? ms : -1);
  });
}

- (void)releaseEngine:(void (^)(void))done {
  dispatch_async(_queue, ^{
    [self closeAll];
    done();
  });
}

@end
