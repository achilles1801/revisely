import SwiftUI
import WidgetKit

// Verse of the day: a short verse in Arabic (Amiri) with its reference, the same
// for everyone on a given date, from verses.json (scripts/widget-verses.ts). No
// translation: Saheeh International isn't licensed for this and The Clear Quran®
// is shown only through its API, with its credit.

struct Verse: Codable, Hashable {
  let sura: Int
  let ayah: Int
  let surah: String
  let page: Int
  let arabic: String

  var reference: String { "\(surah) \(sura):\(ayah)" }
  var url: URL { URL(string: "revisely://read?page=\(page)")! }
}

enum VerseBook {
  static let all: [Verse] = {
    guard
      let url = Bundle.main.url(forResource: "verses", withExtension: "json"),
      let data = try? Data(contentsOf: url),
      let verses = try? JSONDecoder().decode([Verse].self, from: data)
    else { return [] }
    return verses
  }()

  /// The verse for a calendar day. A fixed stride through the list (coprime with
  /// its length) visits every verse before repeating, without neighbours in the
  /// list following each other.
  static func verse(for date: Date, calendar: Calendar = .current) -> Verse? {
    guard !all.isEmpty else { return nil }
    let start = calendar.startOfDay(for: date)
    let epoch = calendar.date(from: DateComponents(year: 2026, month: 1, day: 1)) ?? start
    let days = calendar.dateComponents([.day], from: epoch, to: start).day ?? 0
    let n = all.count
    let stride = [17, 19, 23, 29, 31, 1].first { gcd($0, n) == 1 } ?? 1
    let index = ((days * stride) % n + n) % n
    return all[index]
  }

  private static func gcd(_ a: Int, _ b: Int) -> Int { b == 0 ? a : gcd(b, a % b) }
}

struct VerseEntry: TimelineEntry {
  let date: Date
  let verse: Verse?
  let colors: ColorPair?

  static let sample = VerseEntry(
    date: Date(),
    verse: Verse(sura: 94, ayah: 5, surah: "Ash-Sharh", page: 596, arabic: "فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا"),
    colors: nil
  )
}

struct VerseProvider: TimelineProvider {
  func placeholder(in context: Context) -> VerseEntry { .sample }

  func getSnapshot(in context: Context, completion: @escaping (VerseEntry) -> Void) {
    if context.isPreview { return completion(.sample) }
    completion(VerseEntry(date: Date(), verse: VerseBook.verse(for: Date()), colors: SnapshotStore.load()?.colors))
  }

  /// Today and the next six days, each from local midnight.
  func getTimeline(in context: Context, completion: @escaping (Timeline<VerseEntry>) -> Void) {
    let calendar = Calendar.current
    let now = Date()
    let today = calendar.startOfDay(for: now)
    let colors = SnapshotStore.load()?.colors
    let entries = (0..<7).compactMap { offset -> VerseEntry? in
      guard let day = calendar.date(byAdding: .day, value: offset, to: today) else { return nil }
      return VerseEntry(date: offset == 0 ? now : day, verse: VerseBook.verse(for: day), colors: colors)
    }
    completion(Timeline(entries: entries, policy: .atEnd))
  }
}

struct VerseWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ReviselyVerse", provider: VerseProvider()) { entry in
      VerseView(entry: entry)
    }
    .configurationDisplayName("Verse of the day")
    .description("A short verse each day, in Arabic.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

struct VerseView: View {
  let entry: VerseEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let palette = Palette.make(scheme, entry.colors)
    let medium = family == .systemMedium
    VStack(spacing: 0) {
      HStack(spacing: 6) {
        RMark(height: medium ? 16 : 14)
        Text("Verse of the day")
          .font(.system(size: medium ? 13 : 12, weight: .semibold))
          .tone(palette.secondary, .secondary)
          .lineLimit(1)
        Spacer(minLength: 0)
      }
      Spacer(minLength: 4)
      if let verse = entry.verse {
        Text(verse.arabic)
          .font(.custom("Amiri-Regular", size: medium ? 26 : 21))
          .tone(palette.text)
          .multilineTextAlignment(.center)
          .lineSpacing(medium ? 4 : 2)
          .lineLimit(medium ? 3 : 4)
          .minimumScaleFactor(0.55)
          .environment(\.layoutDirection, .rightToLeft)
          .frame(maxWidth: .infinity)
        Spacer(minLength: 4)
        Text(verse.reference)
          .font(.system(size: medium ? 13 : 12))
          .tone(palette.secondary, .secondary)
          .lineLimit(1)
          .frame(maxWidth: .infinity, alignment: medium ? .trailing : .center)
      } else {
        Text("Open Revisely").font(.system(size: 13)).tone(palette.secondary, .secondary)
        Spacer(minLength: 0)
      }
    }
    .widgetURL(entry.verse?.url ?? URL(string: "revisely://home")!)
    .widgetGround(palette.bg)
  }
}
