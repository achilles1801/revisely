import SwiftUI
import WidgetKit

// Prayer times: the next prayer, its time and a live countdown, and (medium) the
// day's times. Home Screen (small, medium), Lock Screen (rectangular, circular,
// inline) and StandBy. The app writes a week of times ahead as absolute instants
// (WidgetPrayer in src/lib/widgets/snapshot.ts), worked out for the place with the
// account's method; the widget shows them in the phone's time zone and 12/24-hour
// setting, and moves on at each prayer with the app closed.

enum PrayerName: String, CaseIterable, Hashable {
  case fajr, sunrise, dhuhr, asr, maghrib, isha

  /// As the app says them (TIME_LABELS in src/lib/prayer/times.ts).
  var label: String {
    switch self {
    case .fajr: return "Fajr"
    case .sunrise: return "Sunrise"
    case .dhuhr: return "Dhuhr"
    case .asr: return "Asr"
    case .maghrib: return "Maghrib"
    case .isha: return "Isha"
    }
  }

  /// The five prayers: sunrise is a time of the day, never the next prayer.
  static let prayers: [PrayerName] = [.fajr, .dhuhr, .asr, .maghrib, .isha]
}

extension PrayerDay {
  func time(_ name: PrayerName) -> Date? {
    let ms: Double?
    switch name {
    case .fajr: ms = fajr
    case .sunrise: ms = sunrise
    case .dhuhr: ms = dhuhr
    case .asr: ms = asr
    case .maghrib: ms = maghrib
    case .isha: ms = isha
    }
    return ms.map { Date(timeIntervalSince1970: $0 / 1000) }
  }

  /// The start of its day ("YYYY-MM-DD") in the phone's calendar.
  func start(_ calendar: Calendar) -> Date? {
    let parts = day.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
  }
}

struct PrayerTime: Hashable {
  let name: PrayerName
  let date: Date
}

/// One of the day's six times; nil when there is none that day.
struct PrayerSlot: Hashable {
  let name: PrayerName
  let date: Date?
}

/// What the widget shows at one instant.
struct PrayerMoment: Hashable {
  let next: PrayerTime
  /// The prayer before it, where the circular gauge starts.
  let previous: Date
  /// The calendar day's six times, for the medium widget.
  let today: [PrayerSlot]
  /// The prayer whose time it is (it began, the next hasn't), today; none between
  /// sunrise and Dhuhr. As the app's currentPrayer.
  let current: PrayerName?
  let place: String?
}

struct PrayerEntry: TimelineEntry {
  let date: Date
  /// Nil: no prayer times (no place, or not on yet), or past the last day written.
  let moment: PrayerMoment?
  let colors: ColorPair?

  /// The widget gallery: an afternoon in London.
  static var sample: PrayerEntry {
    let now = Date()
    let at = { (minutes: Double) in now.addingTimeInterval(minutes * 60) }
    let today = [
      PrayerSlot(name: .fajr, date: at(-555)),
      PrayerSlot(name: .sunrise, date: at(-470)),
      PrayerSlot(name: .dhuhr, date: at(-172)),
      PrayerSlot(name: .asr, date: at(72)),
      PrayerSlot(name: .maghrib, date: at(190)),
      PrayerSlot(name: .isha, date: at(270)),
    ]
    return PrayerEntry(
      date: now,
      moment: PrayerMoment(
        next: PrayerTime(name: .asr, date: at(72)),
        previous: at(-172),
        today: today,
        current: .dhuhr,
        place: "London"
      ),
      colors: nil
    )
  }
}

enum PrayerTimeline {
  /// The five prayers the app wrote, in order.
  static func prayers(_ info: PrayerInfo) -> [PrayerTime] {
    info.days
      .flatMap { day in PrayerName.prayers.compactMap { name in day.time(name).map { PrayerTime(name: name, date: $0) } } }
      .sorted { $0.date < $1.date }
  }

  /// The next prayer after `date`, the prayer before it and the day's times; nil
  /// once the days written run out.
  static func moment(_ info: PrayerInfo, prayers: [PrayerTime], at date: Date, calendar: Calendar = .current) -> PrayerMoment? {
    guard let next = prayers.first(where: { $0.date > date }) else { return nil }
    let previous = prayers.last(where: { $0.date <= date })?.date
    // Today's list (the calendar day), else the day of the next prayer.
    let day = info.days.first { d in
      guard let start = d.start(calendar) else { return false }
      return calendar.isDate(start, inSameDayAs: date)
    } ?? info.days.first { d in PrayerName.prayers.contains { d.time($0) == next.date } }
    let today = day.map { d in PrayerName.allCases.map { PrayerSlot(name: $0, date: d.time($0)) } } ?? []
    var current: PrayerName?
    for slot in today {
      if let at = slot.date, at <= date { current = slot.name == .sunrise ? nil : slot.name }
    }
    return PrayerMoment(
      next: next,
      // Before the first prayer written: from the start of that day.
      previous: previous ?? day?.start(calendar) ?? date,
      today: today,
      current: current,
      place: info.place
    )
  }

  /// An entry now, at each of the six times and at each midnight (the medium
  /// widget's day), then a quiet one once the days written run out.
  static func entries(_ snapshot: Snapshot?, now: Date, calendar: Calendar = .current) -> [PrayerEntry] {
    let colors = snapshot?.colors
    guard let info = snapshot?.prayer else { return [PrayerEntry(date: now, moment: nil, colors: colors)] }
    let prayers = prayers(info)
    var instants = Set<Date>()
    for day in info.days {
      for name in PrayerName.allCases {
        if let at = day.time(name), at > now { instants.insert(at) }
      }
      if let start = day.start(calendar), start > now { instants.insert(start) }
    }
    var out: [PrayerEntry] = []
    for date in [now] + instants.sorted() {
      let moment = moment(info, prayers: prayers, at: date, calendar: calendar)
      out.append(PrayerEntry(date: date, moment: moment, colors: colors))
      if moment == nil { break }
    }
    return out
  }
}

struct PrayerProvider: TimelineProvider {
  func placeholder(in context: Context) -> PrayerEntry { .sample }

  func getSnapshot(in context: Context, completion: @escaping (PrayerEntry) -> Void) {
    if context.isPreview { return completion(.sample) }
    completion(PrayerTimeline.entries(SnapshotStore.load(), now: Date()).first ?? .sample)
  }

  /// Read again after the last entry; the app also reloads whenever it writes.
  func getTimeline(in context: Context, completion: @escaping (Timeline<PrayerEntry>) -> Void) {
    let entries = PrayerTimeline.entries(SnapshotStore.load(), now: Date())
    let quiet = entries.count == 1 && entries[0].moment == nil
    completion(Timeline(entries: entries, policy: quiet ? .never : .atEnd))
  }
}

struct PrayerWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ReviselyPrayer", provider: PrayerProvider()) { entry in
      PrayerView(entry: entry)
    }
    .configurationDisplayName("Prayer times")
    .description("The next prayer and today's times.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular, .accessoryInline])
  }
}

struct PrayerView: View {
  let entry: PrayerEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let palette = Palette.make(scheme, entry.colors)
    Group {
      switch family {
      case .accessoryRectangular: PrayerRectangular(moment: entry.moment)
      case .accessoryCircular: PrayerCircular(moment: entry.moment)
      case .accessoryInline: PrayerInline(moment: entry.moment)
      case .systemMedium: PrayerMedium(entry: entry, palette: palette)
      default: PrayerSmall(moment: entry.moment, palette: palette)
      }
    }
    .widgetURL(URL(string: "revisely://prayer")!)
    .widgetGroundIfHome(family, palette.bg)
  }
}

private let openText = "Open Revisely to see prayer times."

/// "in 1 hr, 12 min" ("in 12 min, 5 sec" in the last hour), kept current by the
/// system. iOS 18's `.reference` format rounds to one unit ("in 1 hour" at 1:59),
/// and `.offset` spells the units out, too long for the small widget.
struct Countdown: View {
  let to: Date

  var body: some View {
    Text("in \(Text(to, style: .relative))")
  }
}

/// The time without AM/PM ("3:42", or "15:42" on a 24-hour phone), for the circle.
/// A DateFormatter on the phone's own locale follows its 12/24-hour setting (the
/// view's locale, used by a format style, rendered "06:48" on a 12-hour phone).
private func shortTime(_ date: Date) -> Text {
  let f = DateFormatter()
  f.locale = .autoupdatingCurrent
  f.timeZone = .autoupdatingCurrent
  f.setLocalizedDateFormatFromTemplate("jmm")
  // Drop the day period ("a", or "b"/"B" as in Urdu's "شام"), outside quoted text.
  var quoted = false
  let pattern = f.dateFormat.filter { c in
    if c == "'" { quoted.toggle() }
    return quoted || !"abB".contains(c)
  }
  f.dateFormat = pattern.trimmingCharacters(in: .whitespaces)
  return Text(verbatim: f.string(from: date))
}

// MARK: Home Screen

/// The row's mark (v2/Mark with an icon): a quiet circle holding a clock, as the
/// app's next-prayer line.
struct PrayerMark: View {
  let size: CGFloat
  let palette: Palette
  @Environment(\.widgetRenderingMode) private var mode

  var body: some View {
    ZStack {
      Circle().fill(mode == .fullColor ? AnyShapeStyle(palette.fill) : AnyShapeStyle(.quaternary))
      Image(systemName: "clock")
        .font(.system(size: size * 0.5, weight: .medium))
        .tone(palette.text)
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }
}

/// The mark, "Prayer" and the place, as Today's header.
struct PrayerHeader: View {
  let place: String?
  let palette: Palette

  var body: some View {
    HStack(spacing: 8) {
      PrayerMark(size: 28, palette: palette)
      VStack(alignment: .leading, spacing: 0) {
        Text("Prayer").font(.system(size: 15, weight: .semibold)).tone(palette.text)
        if let place {
          Text(place).font(.system(size: 12)).tone(palette.secondary, .secondary).minimumScaleFactor(0.8)
        }
      }
      .lineLimit(1)
    }
  }
}

/// The next prayer: its name in the accent, the time large, the countdown under a hairline.
struct NextPrayer: View {
  let next: PrayerTime
  let palette: Palette

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(next.name.label)
        .font(.system(size: 16, weight: .semibold))
        .tone(palette.accentText)
        .widgetAccentable()
        .lineLimit(1)
      Text(next.date, style: .time)
        .font(.system(size: 28, weight: .semibold))
        .monospacedDigit()
        .tone(palette.text)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
      Spacer(minLength: 6)
      Hairline(color: palette.separator)
      Countdown(to: next.date)
        .font(.system(size: 13, weight: .semibold))
        .tone(palette.text)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .padding(.top, 6)
    }
    .accessibilityElement(children: .combine)
  }
}

struct PrayerSmall: View {
  let moment: PrayerMoment?
  let palette: Palette

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      PrayerHeader(place: moment?.place, palette: palette)
      Spacer(minLength: 6)
      if let moment {
        NextPrayer(next: moment.next, palette: palette)
      } else {
        Text(openText).font(.system(size: 13)).tone(palette.secondary, .secondary).lineLimit(3)
        Spacer(minLength: 0)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }
}

struct PrayerMedium: View {
  let entry: PrayerEntry
  let palette: Palette

  var body: some View {
    if let moment = entry.moment {
      HStack(alignment: .top, spacing: 16) {
        VStack(alignment: .leading, spacing: 0) {
          PrayerHeader(place: moment.place, palette: palette)
          Spacer(minLength: 6)
          NextPrayer(next: moment.next, palette: palette)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        PrayerDayList(moment: moment, now: entry.date, palette: palette)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    } else {
      HStack(alignment: .top, spacing: 12) {
        PrayerMark(size: 40, palette: palette)
        VStack(alignment: .leading, spacing: 2) {
          Text("Prayer times").font(.system(size: 15, weight: .semibold)).tone(palette.text)
          Text(openText).font(.system(size: 13)).tone(palette.secondary, .secondary).padding(.top, 2)
          Spacer(minLength: 0)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
  }
}

/// The day's six times, spread over the widget's height: the next one in the
/// accent, the ones that have passed (and sunrise) quieter. As the app's Times tab.
struct PrayerDayList: View {
  let moment: PrayerMoment
  let now: Date
  let palette: Palette

  var body: some View {
    VStack(spacing: 0) {
      ForEach(Array(moment.today.enumerated()), id: \.offset) { i, slot in
        row(slot)
        if i < moment.today.count - 1 { Spacer(minLength: 0) }
      }
    }
  }

  @ViewBuilder private func row(_ slot: PrayerSlot) -> some View {
    let isNext = slot.date == moment.next.date && slot.name == moment.next.name
    let past = slot.date.map { $0 <= now } == true && slot.name != moment.current
    let quiet = !isNext && (past || slot.name == .sunrise)
    let weight: Font.Weight = isNext ? .semibold : .regular
    HStack(spacing: 6) {
      Text(slot.name.label).font(.system(size: 13, weight: weight)).lineLimit(1)
      Spacer(minLength: 0)
      Group {
        if let date = slot.date { Text(date, style: .time) } else { Text("—") }
      }
      .font(.system(size: 13, weight: weight))
      .monospacedDigit()
      .lineLimit(1)
    }
    .minimumScaleFactor(0.8)
    .tone(isNext ? palette.accentText : quiet ? palette.secondary : palette.text, quiet ? .secondary : .primary)
    .widgetAccentable(isNext)
    .accessibilityElement(children: .combine)
  }
}

// MARK: Lock Screen

struct PrayerRectangular: View {
  let moment: PrayerMoment?

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if let moment {
        HStack(spacing: 4) {
          Image(systemName: "clock")
          Text("\(moment.next.name.label) \(Text(moment.next.date, style: .time))")
        }
        .font(.headline)
        .widgetAccentable()
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        Countdown(to: moment.next.date).font(.body).lineLimit(1).minimumScaleFactor(0.8)
        if let place = moment.place {
          Text(place).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
      } else {
        Text("Prayer times").font(.headline).widgetAccentable()
        Text(openText).font(.caption).foregroundStyle(.secondary).lineLimit(2)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// A ring that fills from the last prayer to the next (kept moving by the
/// system), around the next prayer's name and time.
struct PrayerCircular: View {
  let moment: PrayerMoment?

  var body: some View {
    if let moment {
      ProgressView(timerInterval: moment.previous...moment.next.date, countsDown: false) {
        Text(moment.next.name.label)
      } currentValueLabel: {
        VStack(spacing: -1) {
          Text(moment.next.name.label)
            .font(.system(size: 11, weight: .semibold))
            .widgetAccentable()
          shortTime(moment.next.date)
            .font(.system(size: 15, weight: .semibold, design: .rounded))
            .monospacedDigit()
        }
        .lineLimit(1)
        .minimumScaleFactor(0.6)
      }
      .progressViewStyle(.circular)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text("Next prayer: \(moment.next.name.label) at \(Text(moment.next.date, style: .time))"))
    } else {
      ZStack {
        AccessoryWidgetBackground()
        Image(systemName: "clock").font(.system(size: 20, weight: .medium))
      }
      .accessibilityLabel("Prayer times: open Revisely")
    }
  }
}

struct PrayerInline: View {
  let moment: PrayerMoment?

  var body: some View {
    if let moment {
      // Short: it shares the line with the date.
      Label {
        Text("\(moment.next.name.label) \(Text(moment.next.date, style: .time))")
      } icon: {
        Image(systemName: "clock")
      }
    } else {
      Label("Open Revisely", systemImage: "clock")
    }
  }
}
