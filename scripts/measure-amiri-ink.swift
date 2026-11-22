// How far voweled Amiri's ink reaches from the baseline: the highest and lowest of every word of the Qur'an, shaped by
// CoreText (the engine iOS draws with), as fractions of the font size. theme/v2's AMIRI_INK holds the result, and
// arabicFullV2's line is built to hold it (src/design/__tests__/arabicLines.test.tsx).
//
//   swift scripts/measure-amiri-ink.swift            (from the repository's root, on a Mac)
//
// Nov 22 2026, Amiri-Regular.ttf as bundled: ascent 1.124, descent 0.634 (hhea); ink 1.481 above (ظَمَأٌۭ) and 0.950
// below (عَظِيمٌۭ); the median word reaches 1.149 above, past the font's own ascent. Run it again if the font or the
// word text (src/data/quranWords.dat) changes, and update AMIRI_INK.

import CoreText
import Foundation

let font = URL(fileURLWithPath: "assets/fonts/Amiri-Regular.ttf") as CFURL
var error: Unmanaged<CFError>?
guard CTFontManagerRegisterFontsForURL(font, .process, &error) else {
  fatalError("Couldn't load assets/fonts/Amiri-Regular.ttf (run from the repository's root)")
}
let size: CGFloat = 100
let amiri = CTFontCreateWithName("Amiri-Regular" as CFString, size, nil)

let data = try Data(contentsOf: URL(fileURLWithPath: "src/data/quranWords.dat"))
guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any], let verses = json["uthmani"] as? [String] else {
  fatalError("src/data/quranWords.dat has no uthmani verses")
}
// Words are separated by spaces; a no-break space keeps يا أيها one word, as on the page.
let words = Set(verses.flatMap { $0.split(separator: " ").map(String.init) })

var above: [(CGFloat, String)] = []
var below: [(CGFloat, String)] = []
for word in words {
  let line = CTLineCreateWithAttributedString(NSAttributedString(string: word, attributes: [kCTFontAttributeName as NSAttributedString.Key: amiri]))
  let ink = CTLineGetBoundsWithOptions(line, .useGlyphPathBounds)
  above.append(((ink.origin.y + ink.size.height) / size, word))
  below.append((-ink.origin.y / size, word))
}
above.sort { $0.0 < $1.0 }
below.sort { $0.0 < $1.0 }
let f = { (x: CGFloat) in String(format: "%.3f", x) }
print("words \(words.count)")
print("font ascent \(f(CTFontGetAscent(amiri) / size)) descent \(f(CTFontGetDescent(amiri) / size))")
print("ink above \(f(above.last!.0)) (\(above.last!.1)), median \(f(above[above.count / 2].0))")
print("ink below \(f(below.last!.0)) (\(below.last!.1)), median \(f(below[below.count / 2].0))")
