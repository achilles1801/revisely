import Foundation

/// The App Group the app writes to (src/lib/widgets/snapshot.ts).
let appGroup = "group.com.revisionbuddy.app"
let snapshotKey = "widget.snapshot"

/// One revision day, worked out by the app (WidgetDay in snapshot.ts).
struct WidgetDay: Codable, Hashable {
  let day: String
  let startsAt: Double
  let endsAt: Double
  let title: String
  let place: String
  let short: String
  let total: Int
  let done: Int
  let completed: Bool
  let streak: Int

  enum CodingKeys: String, CodingKey {
    case day, startsAt, endsAt, title, short, total, done, completed, streak
    case place = "where"
  }

  var start: Date { Date(timeIntervalSince1970: startsAt / 1000) }
  var end: Date { Date(timeIntervalSince1970: endsAt / 1000) }
  var left: Int { completed ? 0 : max(total - done, 0) }
}

struct AccentColors: Codable, Hashable {
  let accentText: String
  let done: String
  let onDone: String
  let primary: String
  let onPrimary: String
}

struct ColorPair: Codable, Hashable {
  let light: AccentColors
  let dark: AccentColors

  /// Indigo, the default accent, before the app has written anything.
  static let indigo = ColorPair(
    light: AccentColors(accentText: "#624BD5", done: "#624BD5", onDone: "#FFFFFF", primary: "#624BD5", onPrimary: "#FFFFFF"),
    dark: AccentColors(accentText: "#9789DA", done: "#624BD5", onDone: "#FFFFFF", primary: "#624BD5", onPrimary: "#FFFFFF")
  )
}

/// The Qibla from the phone's last known position (WidgetQibla in qibla.ts): the
/// bearing and distance only, never the position.
struct QiblaInfo: Codable, Hashable {
  /// Degrees from true north.
  let bearing: Int
  /// "58° NE".
  let label: String
  /// "10,306 km".
  let distance: String
  let place: String?
}

struct Snapshot: Codable {
  let v: Int
  /// "ready", "signedOut" or "noPlan".
  let state: String
  let accent: String
  let colors: ColorPair
  let days: [WidgetDay]
  /// Missing in snapshots written before the Qibla widget.
  let qibla: QiblaInfo?
}

enum SnapshotStore {
  static func load() -> Snapshot? {
    guard
      let json = UserDefaults(suiteName: appGroup)?.string(forKey: snapshotKey),
      let data = json.data(using: .utf8),
      let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data),
      snapshot.v == 1
    else { return nil }
    return snapshot
  }
}
