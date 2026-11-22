import SwiftUI

// The widgets' words in the app's language (WidgetWords and WidgetDayWords in src/lib/widgets/words.ts), from the
// snapshot. Revisely's own Settings → Appearance → Language can differ from the phone's, so the widgets show what the
// app wrote rather than what iOS would pick. Before an app that writes them, the English the widgets always had.

struct PrayerNames: Codable, Hashable {
  let fajr: String
  let sunrise: String
  let dhuhr: String
  let asr: String
  let maghrib: String
  let isha: String
}

struct Words: Codable, Hashable {
  let language: String
  let rtl: Bool
  let galleryToday: String
  let galleryTodayDescription: String
  let galleryVerse: String
  let galleryVerseDescription: String
  let galleryQibla: String
  let galleryQiblaDescription: String
  let galleryPrayer: String
  let galleryPrayerDescription: String
  let today: String
  let revised: String
  let revisedToday: String
  let doneForToday: String
  let todayDone: String
  let continueLabel: String
  let startLabel: String
  let left: String
  let openRevisely: String
  let openToSeeToday: String
  let openToSetUp: String
  let verseOfTheDay: String
  let prayer: String
  let prayerTimes: String
  let openToSeePrayer: String
  let prayerTimesOpen: String
  /// "in {time}": the live countdown goes where {time} is.
  let countdown: String
  /// "Next prayer: {name} at {time}".
  let nextPrayerAt: String
  let qiblaOpen: String
  let qiblaOpenLabel: String
  let north: String
  let prayerNames: PrayerNames
  let sampleTitle: String
  let samplePlace: String
  /// The example day's pieces and Qibla (from New York); nil in the widgets' own English.
  var sampleDay: DayWords? = nil
  var sampleQibla: QiblaInfo? = nil
  /// The language's digits 0–9.
  let digits: String

  /// The widgets' own English: what they showed before the app wrote its words.
  static let english = Words(
    language: "en", rtl: false,
    galleryToday: "Today", galleryTodayDescription: "Today's revision, whether it's done, and your streak.",
    galleryVerse: "Verse of the day", galleryVerseDescription: "A short verse each day, in Arabic.",
    galleryQibla: "Qibla", galleryQiblaDescription: "The Qibla's direction from true north, from where you last opened Revisely.",
    galleryPrayer: "Prayer times", galleryPrayerDescription: "The next prayer and today's times.",
    today: "Today", revised: "Revised", revisedToday: "Revised today", doneForToday: "Done for today",
    todayDone: "Today's revision is done", continueLabel: "Continue", startLabel: "Start", left: "left",
    openRevisely: "Open Revisely", openToSeeToday: "Open Revisely to see today's revision.",
    openToSetUp: "Open Revisely to set up your plan.", verseOfTheDay: "Verse of the day", prayer: "Prayer",
    prayerTimes: "Prayer times", openToSeePrayer: "Open Revisely to see prayer times.",
    prayerTimesOpen: "Prayer times: open Revisely", countdown: "in {time}", nextPrayerAt: "Next prayer: {name} at {time}",
    qiblaOpen: "Open Revisely to set your location.", qiblaOpenLabel: "Qibla: open Revisely to set your location",
    north: "N",
    prayerNames: PrayerNames(fajr: "Fajr", sunrise: "Sunrise", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha"),
    sampleTitle: "An\u{2011}Naba to At\u{2011}Takwir", samplePlace: "Juz 30", digits: "0123456789"
  )

  /// The words the app last wrote.
  static var current: Words { SnapshotStore.load()?.words ?? .english }

  var direction: LayoutDirection { rtl ? .rightToLeft : .leftToRight }

  var isEnglish: Bool { language == "en" }

  /// A number the widget writes itself (a verse's reference), in the language's digits.
  func number(_ n: Int) -> String {
    let local = Array(digits)
    guard local.count == 10 else { return String(n) }
    return String(String(n).map { c in c.wholeNumberValue.map { local[$0] } ?? c })
  }

  func name(_ prayer: PrayerName) -> String {
    switch prayer {
    case .fajr: return prayerNames.fajr
    case .sunrise: return prayerNames.sunrise
    case .dhuhr: return prayerNames.dhuhr
    case .asr: return prayerNames.asr
    case .maghrib: return prayerNames.maghrib
    case .isha: return prayerNames.isha
    }
  }

  /// The countdown with the system's live time in it ("in 1 hr, 12 min").
  func countdown(to date: Date) -> Text {
    Words.fill(countdown, time: Text(date, style: .relative))
  }

  /// "Next prayer: Asr at 2:21 PM", for VoiceOver.
  func nextPrayer(_ name: String, at date: Date) -> Text {
    Words.fill(nextPrayerAt.replacingOccurrences(of: "{name}", with: name), time: Text(date, style: .time))
  }

  /// A template with its {time} filled by a live Text.
  private static func fill(_ template: String, time: Text) -> Text {
    let parts = template.components(separatedBy: "{time}")
    guard parts.count == 2 else { return Text(verbatim: template) }
    return Text(verbatim: parts[0]) + time + Text(verbatim: parts[1])
  }
}

/// One day's pieces (WidgetDayWords in words.ts).
struct DayWords: Codable, Hashable {
  let pages: String
  let left: String
  let leftToday: String
  let revised: String
  let leftCount: String
  let leftNumber: String
  let leftAndDone: String
  let doneOf: String
  let streak: String?
  let streakShort: String?
  let asTomorrow: String

  /// The widgets' own English for a day, as they wrote it before the app did.
  static func english(_ day: WidgetDay) -> DayWords {
    func pages(_ n: Int) -> String { n == 1 ? "1 page" : "\(n) pages" }
    return DayWords(
      pages: pages(day.total),
      left: "\(pages(day.left)) left",
      leftToday: "\(pages(day.left)) left today",
      revised: "\(pages(day.total)) revised",
      leftCount: "\(day.left) left",
      leftNumber: "\(day.left)",
      leftAndDone: "\(day.left) left · \(day.done) done",
      doneOf: "\(day.done) of \(day.total) done",
      streak: day.streak > 0 ? "\(day.streak)-day streak" : nil,
      streakShort: day.streak > 0 ? "\(day.streak)d" : nil,
      asTomorrow: "Tomorrow · \(day.title)"
    )
  }
}

private struct WordsKey: EnvironmentKey {
  static let defaultValue = Words.english
}

extension EnvironmentValues {
  /// The widgets' words, set once at each widget's root (inLanguage).
  var words: Words {
    get { self[WordsKey.self] }
    set { self[WordsKey.self] = newValue }
  }
}

extension View {
  /// The widget in the app's language: its words, its direction, and (not English) its locale for dates and times,
  /// so Arabic gets Arabic-Indic digits. English keeps the phone's locale, as before.
  @ViewBuilder func inLanguage(_ words: Words) -> some View {
    let base = environment(\.words, words).environment(\.layoutDirection, words.direction)
    if words.isEnglish { base } else { base.environment(\.locale, Locale(identifier: words.language)) }
  }
}
