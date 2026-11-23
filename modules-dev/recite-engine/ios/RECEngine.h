#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// A take's frames from the engine, in order. code: 0, or the RC_ERR_* of the call that failed.
typedef void (^RECEngineFrames)(NSInteger take, NSArray<NSString *> *frames, NSInteger code);

/// A named piece of the data pack already in memory: an rc_blob the engine reads without copying.
@interface RECEngineBlob : NSObject
@property(nonatomic, copy, readonly) NSString *name;
@property(nonatomic, readonly) const void *bytes;
@property(nonatomic, readonly) NSUInteger size;
- (instancetype)initWithName:(NSString *)name bytes:(const void *)bytes size:(NSUInteger)size;
@end

/// recite_core.h on one background thread: every call on the engine and its takes runs there, in the order made, so
/// audio, controls and the end reach a take as the app sent them and the JavaScript thread never waits on a hop.
@interface RECEngine : NSObject

@property(class, nonatomic, readonly) RECEngine *shared;
@property(atomic, copy, nullable) RECEngineFrames onFrames;
/// rc_info's JSON while the engine is open.
@property(atomic, copy, readonly, nullable) NSString *info;

/// Opens the engine from named files read into memory ({name, path}); an engine already open is released first.
/// done: {ok, code, error, info}.
- (void)openFiles:(NSArray<NSDictionary<NSString *, NSString *> *> *)items
          options:(NSString *)options
             done:(void (^)(NSDictionary<NSString *, id> *result))done;
/// Opens the engine from blobs in memory, which it reads without copying. `owner` holds their memory: it is kept until
/// rc_release has returned (at once let go if the open fails). done: {ok, code, error, info}.
- (void)openBlobs:(NSArray<RECEngineBlob *> *)blobs
            owner:(id)owner
          options:(NSString *)options
             done:(void (^)(NSDictionary<NSString *, id> *result))done;
/// Starts a take from the contract's start frame. done: {take} or {code, error}.
- (void)startTake:(NSString *)frame hop:(double)hop done:(void (^)(NSDictionary<NSString *, id> *result))done;
/// 16 kHz mono 16-bit little-endian samples.
- (void)feedTake:(NSInteger)take pcm:(NSData *)pcm;
- (void)controlTake:(NSInteger)take frame:(NSString *)frame;
- (void)finishTake:(NSInteger)take;
- (void)closeTake:(NSInteger)take;
/// Samples [s0, s1) of an open take, as base64 of 16-bit little-endian PCM; nil if the take is gone or they aren't there.
- (void)clipTake:(NSInteger)take from:(int64_t)s0 to:(int64_t)s1 done:(void (^)(NSString *_Nullable base64))done;
/// One model call on the pack's check input, timed on the engine's thread: its ms, or negative when it can't run (no
/// engine, a take open, no check input).
- (void)probe:(void (^)(double ms))done NS_SWIFT_NAME(probe(_:));
/// Closes every take and the engine.
/// Named for Swift: its importer would otherwise drop "Engine" and leave `release`, which ARC forbids.
- (void)releaseEngine:(void (^)(void))done NS_SWIFT_NAME(releaseEngine(_:));

@end

NS_ASSUME_NONNULL_END
