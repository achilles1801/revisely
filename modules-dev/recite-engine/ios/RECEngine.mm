#import "RECEngine.h"

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

@implementation RECEngine {
  dispatch_queue_t _queue;
  rc_engine *_engine;
  std::unordered_map<NSInteger, rc_session *> _takes;
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
  NSMutableArray<NSString *> *frames = [NSMutableArray array];
  const int drained = rh_drain(session, collect, (__bridge void *)frames);
  const int failed = code < 0 ? code : (drained < 0 ? drained : 0);
  RECEngineFrames emit = self.onFrames;
  if (emit && (frames.count > 0 || failed != 0)) emit(take, frames, failed);
}

/// On the queue.
- (void)closeAll {
  for (auto &entry : _takes) rc_close(entry.second);
  _takes.clear();
  if (_engine) rc_release(_engine);
  _engine = nullptr;
  self.info = nil;
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
    int code = RC_OK;
    char err[256] = "";
    self->_engine = rc_open(blobs.data(), blobs.size(), options.UTF8String, &code, err, sizeof err);
    if (!self->_engine) {
      done(@{@"ok": @NO, @"code": @(code), @"error": [NSString stringWithUTF8String:err] ?: @""});
      return;
    }
    NSString *info = [NSString stringWithUTF8String:rc_info(self->_engine)] ?: @"{}";
    self.info = info;
    done(@{@"ok": @YES, @"code": @0, @"info": info});
  });
}

- (void)startTake:(NSString *)frame done:(void (^)(NSDictionary<NSString *, id> *))done {
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
  dispatch_async(_queue, ^{
    rc_session *session = [self sessionOf:take];
    if (!session) return;
    const int r = rc_feed(session, static_cast<const int16_t *>(pcm.bytes), pcm.length / sizeof(int16_t));
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
    [self drain:take session:session code:r];
  });
}

- (void)closeTake:(NSInteger)take {
  dispatch_async(_queue, ^{
    rc_session *session = [self sessionOf:take];
    if (!session) return;
    rc_close(session);
    self->_takes.erase(take);
  });
}

- (void)releaseEngine:(void (^)(void))done {
  dispatch_async(_queue, ^{
    [self closeAll];
    done();
  });
}

@end
