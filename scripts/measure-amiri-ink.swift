// How far Amiri's ink reaches from the baseline, shaped by CoreText (the engine iOS draws with), as fractions of the font
// size: the highest and lowest of every word of the Qur'an (theme/v2's AMIRI_INK, which arabicFullV2's line holds), and
// of the 114 surah names as the app writes them without harakat (AMIRI_NAME_INK, arabicV2's line). The voweled surah
// names are printed too: they carry harakat, so they take arabicFullV2 (src/design/__tests__/arabicLines.test.tsx).
//
//   swift scripts/measure-amiri-ink.swift            (from the repository's root, on a Mac)
//
// Nov 22 2026, Amiri-Regular.ttf as bundled: ascent 1.124, descent 0.634 (hhea). Qur'an words: 1.481 above (ظَمَأٌۭ) and
// 0.950 below; the median word reaches 1.149 above, past the font's own ascent. Surah names: 1.001 above (الأحزاب, الأنبياء) and
// 0.651 below (القلم). Run it again if the font, the word text (src/data/quranWords.dat) or the names
// (src/lib/quranData.ts) change, and update AMIRI_INK and AMIRI_NAME_INK.

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

/** The highest and lowest ink of these texts, with the text that reaches each. */
func reach(_ texts: [String]) -> (above: (CGFloat, String), below: (CGFloat, String), medianAbove: CGFloat) {
  var above: [(CGFloat, String)] = []
  var below: [(CGFloat, String)] = []
  for text in texts {
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: [kCTFontAttributeName as NSAttributedString.Key: amiri]))
    let ink = CTLineGetBoundsWithOptions(line, .useGlyphPathBounds)
    above.append(((ink.origin.y + ink.size.height) / size, text))
    below.append((-ink.origin.y / size, text))
  }
  above.sort { $0.0 < $1.0 }
  below.sort { $0.0 < $1.0 }
  return (above.last!, below.last!, above[above.count / 2].0)
}

/** Every string `field: '…'` in src/lib/quranData.ts. */
func quranData(_ field: String) throws -> [String] {
  let source = try String(contentsOfFile: "src/lib/quranData.ts", encoding: .utf8)
  let pattern = try NSRegularExpression(pattern: field + ": '([^']+)'")
  return pattern.matches(in: source, range: NSRange(source.startIndex..., in: source)).map {
    String(source[Range($0.range(at: 1), in: source)!])
  }
}

let f = { (x: CGFloat) in String(format: "%.3f", x) }
print("font ascent \(f(CTFontGetAscent(amiri) / size)) descent \(f(CTFontGetDescent(amiri) / size))")
let groups: [(String, [String])] = [
  ("Qur'an words", Array(words)),
  ("surah names", try quranData("nameArabic")),
  ("voweled surah names", try quranData("nameArabicVoweled")),
]
for (name, texts) in groups {
  let r = reach(texts)
  print("\(name) (\(texts.count)): above \(f(r.above.0)) (\(r.above.1)), below \(f(r.below.0)) (\(r.below.1)), median above \(f(r.medianAbove))")
}
