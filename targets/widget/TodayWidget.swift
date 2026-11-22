import SwiftUI
import WidgetKit

// Today: today's revision, whether it's done, and the streak. Home Screen (small,
// medium), Lock Screen (rectangular, circular, inline) and StandBy.

enum TodayState: Hashable {
  /// The day, and the one after it (what the medium widget says comes next).
  case ready(WidgetDay, next: WidgetDay?)
  /// Signed out, a new account, or no snapshot yet.
  case setUp
  /// The app hasn't been opened for longer than the days it wrote ahead.
  case stale
}

struct TodayEntry: TimelineEntry {
  let date: Date
  let state: TodayState
  let colors: ColorPair?
  var words: Words = .english

  /// The widget gallery's example: pages 582–586 as the app names them (surahs and juz,
  /// never page numbers; lib/passages via snapshot.ts), no-break hyphens included, in the
  /// app's language.
  static var sample: TodayEntry {
    let words = Words.current
    return TodayEntry(
      date: Date(),
      state: .ready(WidgetDay(
        day: "", startsAt: 0, endsAt: 0, title: words.sampleTitle, place: words.samplePlace,
        short: words.sampleTitle, total: 5, done: 0, completed: false, streak: 7, words: words.sampleDay
      ), next: nil),
      colors: nil,
      words: words
    )
  }

  /// Today's session, or Home once it's done (or there's nothing to start).
  var url: URL {
    if case .ready(let day, _) = state, !day.completed, day.total > 0 { return URL(string: "revisely://today")! }
    return URL(string: "revisely://home")!
  }
}

enum TodayTimeline {
  /// An entry for each day the app wrote ahead, starting at its boundary (fajr or
  /// midnight), then a "stale" one when they run out.
  static func entries(_ snapshot: Snapshot?, now: Date) -> [TodayEntry] {
    let words = snapshot?.words ?? .english
    guard let snapshot, snapshot.state == "ready" else {
      return [TodayEntry(date: now, state: .setUp, colors: snapshot?.colors, words: words)]
    }
    let live = snapshot.days.filter { $0.end > now }
    guard let last = live.last else { return [TodayEntry(date: now, state: .stale, colors: snapshot.colors, words: words)] }
    var out = live.enumerated().map { i, day in
      TodayEntry(
        date: max(day.start, now), state: .ready(day, next: i + 1 < live.count ? live[i + 1] : nil),
        colors: snapshot.colors, words: words
      )
    }
    out.append(TodayEntry(date: last.end, state: .stale, colors: snapshot.colors, words: words))
    return out
  }

  /// Read again at the next boundary, or at midnight if that comes first (a clock
  /// or time-zone change); the app also reloads whenever it writes.
  static func refresh(after entries: [TodayEntry], now: Date) -> Date {
    let midnight = Calendar.current.startOfDay(for: now.addingTimeInterval(86_400))
    let next = entries.first(where: { $0.date > now })?.date ?? midnight
    return min(next, midnight)
  }
}

struct TodayProvider: TimelineProvider {
  func placeholder(in context: Context) -> TodayEntry { .sample }

  func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
    if context.isPreview { return completion(.sample) }
    completion(TodayTimeline.entries(SnapshotStore.load(), now: Date()).first ?? .sample)
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
    let now = Date()
    let entries = TodayTimeline.entries(SnapshotStore.load(), now: now)
    completion(Timeline(entries: entries, policy: .after(TodayTimeline.refresh(after: entries, now: now))))
  }
}

struct TodayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ReviselyToday", provider: TodayProvider()) { entry in
      TodayView(entry: entry)
    }
    .configurationDisplayName(Words.current.galleryToday)
    .description(Words.current.galleryTodayDescription)
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular, .accessoryInline])
  }
}

struct TodayView: View {
  let entry: TodayEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let palette = Palette.make(scheme, entry.colors)
    Group {
      switch family {
      case .accessoryRectangular: TodayRectangular(entry: entry)
      case .accessoryCircular: TodayCircular(entry: entry)
      case .accessoryInline: TodayInline(entry: entry)
      case .systemMedium: TodayMedium(entry: entry, palette: palette)
      default: TodaySmall(entry: entry, palette: palette)
      }
    }
    .widgetURL(entry.url)
    .widgetGroundIfHome(family, palette.bg)
    .inLanguage(entry.words)
  }
}

extension View {
  /// Lock Screen widgets have no ground of their own.
  @ViewBuilder func widgetGroundIfHome(_ family: WidgetFamily, _ color: Color) -> some View {
    switch family {
    case .accessoryRectangular, .accessoryCircular, .accessoryInline:
      if #available(iOSApplicationExtension 17.0, *) { containerBackground(for: .widget) { Color.clear } } else { self }
    default: widgetGround(color)
    }
  }
}

private func setUpText(_ state: TodayState, _ words: Words) -> String {
  state == .stale ? words.openToSeeToday : words.openToSetUp
}

// MARK: Home Screen

struct TodaySmall: View {
  let entry: TodayEntry
  let palette: Palette
  @Environment(\.words) private var words

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 8) {
        MarkView(done: day?.completed ?? false, size: 28, palette: palette)
        VStack(alignment: .leading, spacing: 0) {
          Text(words.today).font(.system(size: 15, weight: .semibold)).tone(palette.text)
          if let streak = day?.w.streak {
            Text(streak).font(.system(size: 12)).tone(palette.secondary, .secondary).lineLimit(1)
          }
        }
      }
      Spacer(minLength: 6)
      if let day {
        Text(day.completed ? words.doneForToday : day.title)
          .font(.system(size: 16, weight: .semibold))
          .tone(day.completed ? palette.accentText : palette.text)
          .lineLimit(2)
          .minimumScaleFactor(0.8)
        Text(day.place).font(.system(size: 12)).tone(palette.secondary, .secondary).lineLimit(1)
        Spacer(minLength: 6)
        Hairline(color: palette.separator)
        Text(status(day))
          .font(.system(size: 13, weight: .semibold))
          .tone(palette.text)
          .padding(.top, 6)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
      } else {
        Text(setUpText(entry.state, words)).font(.system(size: 13)).tone(palette.secondary, .secondary).lineLimit(3)
        Spacer(minLength: 0)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }

  private var day: WidgetDay? { if case .ready(let d, _) = entry.state { return d } else { return nil } }

  private func status(_ day: WidgetDay) -> String {
    if day.completed { return day.w.revised }
    if day.done > 0 { return day.w.leftAndDone }
    return day.w.left
  }
}

struct TodayMedium: View {
  let entry: TodayEntry
  let palette: Palette
  @Environment(\.words) private var words

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      MarkView(done: day?.completed ?? false, size: 40, palette: palette)
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 4) {
          Text(words.today).font(.system(size: 15, weight: .semibold)).tone(palette.text)
          if let streak = day?.w.streak {
            Text("· \(streak)").font(.system(size: 13)).tone(palette.secondary, .secondary)
          }
        }
        .lineLimit(1)
        if let day {
          Text(day.completed ? words.doneForToday : day.title)
            .font(.system(size: 17, weight: .semibold))
            .tone(day.completed ? palette.accentText : palette.text)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.top, 2)
          Text(day.completed ? "\(day.w.revised) · \(day.place)" : day.place)
            .font(.system(size: 13))
            .tone(palette.secondary, .secondary)
            .lineLimit(2)
          Spacer(minLength: 6)
          Hairline(color: palette.separator)
          HStack {
            Text(status(day)).font(.system(size: 13, weight: .semibold)).tone(palette.text).lineLimit(1)
            Spacer(minLength: 8)
            if !day.completed && day.total > 0 { Pill(text: day.done > 0 ? words.continueLabel : words.startLabel, palette: palette) }
          }
          .padding(.top, 6)
        } else {
          Text(setUpText(entry.state, words)).font(.system(size: 13)).tone(palette.secondary, .secondary).padding(.top, 2)
          Spacer(minLength: 0)
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }

  private var day: WidgetDay? { if case .ready(let d, _) = entry.state { return d } else { return nil } }

  private var next: WidgetDay? { if case .ready(_, let n) = entry.state { return n } else { return nil } }

  private func status(_ day: WidgetDay) -> String {
    if day.completed { return next.map { $0.w.asTomorrow } ?? words.revised }
    if day.done > 0 { return day.w.doneOf }
    return day.w.left
  }
}

/// The app's primary pill (v2/PillButton): solid, in the accent (ink for Jade).
struct Pill: View {
  let text: String
  let palette: Palette
  @Environment(\.widgetRenderingMode) private var mode

  var body: some View {
    let label = Text(text)
      .font(.system(size: 13, weight: .semibold))
      .padding(.horizontal, 14)
      .padding(.vertical, 6)
    if mode == .fullColor {
      label.foregroundStyle(palette.onPrimary).background(Capsule().fill(palette.primary))
    } else {
      // Tinted or clear: one colour for label and pill, so an outline keeps the label readable.
      label.foregroundStyle(.primary).background(Capsule().strokeBorder(.primary, lineWidth: 1)).widgetAccentable()
    }
  }
}

// MARK: Lock Screen

struct TodayRectangular: View {
  let entry: TodayEntry
  @Environment(\.words) private var words

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if case .ready(let day, _) = entry.state {
        HStack(spacing: 4) {
          Image(systemName: day.completed ? "checkmark.circle.fill" : "book.closed")
            .widgetAccentable()
          Text(day.completed ? words.revised : words.today).font(.headline).widgetAccentable()
        }
        Text(day.short).font(.body).lineLimit(1)
        Text(detail(day)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
      } else {
        Text(verbatim: "Revisely").font(.headline).widgetAccentable()
        Text(setUpText(entry.state, words)).font(.caption).foregroundStyle(.secondary).lineLimit(2)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func detail(_ day: WidgetDay) -> String {
    let streak = day.w.streak
    if day.completed { return streak ?? day.w.pages }
    // Short, so the streak fits on the line: "20 left · 54-day streak".
    return [day.w.leftCount, streak].compactMap { $0 }.joined(separator: " · ")
  }
}

struct TodayCircular: View {
  let entry: TodayEntry
  @Environment(\.words) private var words

  var body: some View {
    ZStack {
      AccessoryWidgetBackground()
      if case .ready(let day, _) = entry.state {
        if day.completed {
          VStack(spacing: 0) {
            Image(systemName: "checkmark").font(.system(size: 20, weight: .bold)).widgetAccentable()
            if let streak = day.w.streakShort { Text(streak).font(.system(size: 11, weight: .medium)) }
          }
        } else {
          VStack(spacing: -2) {
            Text(day.w.leftNumber).font(.system(size: 22, weight: .semibold, design: .rounded)).widgetAccentable()
            Text(words.left).font(.system(size: 10, weight: .medium))
          }
        }
      } else {
        Image(systemName: "book.closed").font(.system(size: 20, weight: .medium))
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(label)
  }

  private var label: String {
    guard case .ready(let day, _) = entry.state else { return "Revisely" }
    return day.completed ? words.todayDone : day.w.leftToday
  }
}

struct TodayInline: View {
  let entry: TodayEntry
  @Environment(\.words) private var words

  var body: some View {
    if case .ready(let day, _) = entry.state {
      if day.completed {
        Label(day.w.streak.map { "\(words.revised) · \($0)" } ?? words.revisedToday, systemImage: "checkmark.circle")
      } else {
        // Short: it shares the line with the date.
        Label("\(day.w.leftCount) · \(day.short)", systemImage: "book.closed")
      }
    } else {
      Label(words.openRevisely, systemImage: "book.closed")
    }
  }
}
