// The system font's advance widths (SF Pro, as iOS draws chrome text), for the tests that check a line fits
// (jest/textWidth.ts; BEHAVIOUR.md ACT-37). Run on a Mac: `swift scripts/measure-sf-advances.swift > jest/sfAdvances.json`.
// Each style is measured at its own size, so SF Pro's optical sizes (Text under 20 pt, Display from 20) are as drawn.
import CoreText
import Foundation

let styles: [(name: String, size: CGFloat, weight: CGFloat)] = [
  ("meta", 13, 0.0),        // typeV2.meta: 13 pt regular
  ("figure", 20, 0.4),      // a row's figure: 20 pt bold (700)
  ("title", 17, 0.3),       // a row's title: 17 pt semibold (600)
]
var chars = (32...126).map { Character(UnicodeScalar($0)!) }
chars += ["\u{00A0}", "\u{00B7}", "\u{2013}", "\u{2014}", "\u{2011}", "\u{2019}", "\u{2018}", "\u{201C}", "\u{201D}", "\u{2026}", "\u{2192}", "\u{203A}", "\u{00D7}"]
var out: [String: [String: Double]] = [:]
for s in styles {
  let traits: [CFString: Any] = [kCTFontWeightTrait: s.weight]
  let desc = CTFontDescriptorCreateWithAttributes([kCTFontTraitsAttribute: traits, kCTFontFamilyNameAttribute: ".AppleSystemUIFont"] as CFDictionary)
  let font = CTFontCreateWithFontDescriptor(desc, s.size, nil)
  var widths: [String: Double] = [:]
  for c in chars {
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: String(c), attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font]))
    widths[String(c)] = (CTLineGetTypographicBounds(line, nil, nil, nil) * 100).rounded() / 100
  }
  out["\(s.name)@\(Int(s.size))"] = widths
}
let data = try JSONSerialization.data(withJSONObject: out, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
