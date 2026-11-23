#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Which engine this build linked: recite-core or its stub (core/fetch.js, ReciteEngine.podspec).
@interface RECCore : NSObject
/// core/glue/recite_core_info.h's JSON.
+ (NSString *)infoJSON;
@end

NS_ASSUME_NONNULL_END
