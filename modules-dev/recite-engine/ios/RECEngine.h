#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// A take's frames from the engine, in order. code: 0, or the RC_ERR_* of the call that failed.
typedef void (^RECEngineFrames)(NSInteger take, NSArray<NSString *> *frames, NSInteger code);

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
/// Starts a take from the contract's start frame. done: {take} or {code, error}.
- (void)startTake:(NSString *)frame done:(void (^)(NSDictionary<NSString *, id> *result))done;
/// 16 kHz mono 16-bit little-endian samples.
- (void)feedTake:(NSInteger)take pcm:(NSData *)pcm;
- (void)controlTake:(NSInteger)take frame:(NSString *)frame;
- (void)finishTake:(NSInteger)take;
- (void)closeTake:(NSInteger)take;
/// Closes every take and the engine.
- (void)releaseEngine:(void (^)(void))done;

@end

NS_ASSUME_NONNULL_END
