#import "RECCore.h"

#include "recite_core_info.h"

@implementation RECCore
+ (NSString *)infoJSON {
  return [NSString stringWithUTF8String:recite_core_info_json()];
}
@end
