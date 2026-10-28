import SwiftUI
import WidgetKit

// Qibla: a fixed dial, north up, with the Kaaba at the Qibla's bearing from the
// phone's last known position, its compass point and the distance to Makkah.
// WidgetKit can't read the compass, so it doesn't turn with the phone; the tap
// opens the Qibla sheet, which does. The app writes only the bearing and the
// distance (src/lib/widgets/qibla.ts), never the position.

struct QiblaEntry: TimelineEntry {
  let date: Date
  let qibla: QiblaInfo?
  let colors: ColorPair?

  static let sample = QiblaEntry(
    date: Date(),
    qibla: QiblaInfo(bearing: 58, label: "58° NE", distance: "10,306 km", place: nil),
    colors: nil
  )
}

struct QiblaProvider: TimelineProvider {
  func placeholder(in context: Context) -> QiblaEntry { .sample }

  func getSnapshot(in context: Context, completion: @escaping (QiblaEntry) -> Void) {
    if context.isPreview { return completion(.sample) }
    let snapshot = SnapshotStore.load()
    completion(QiblaEntry(date: Date(), qibla: snapshot?.qibla, colors: snapshot?.colors))
  }

  /// One entry: it changes only when the app writes a new position, and the app
  /// reloads the widgets when it does.
  func getTimeline(in context: Context, completion: @escaping (Timeline<QiblaEntry>) -> Void) {
    let snapshot = SnapshotStore.load()
    let entry = QiblaEntry(date: Date(), qibla: snapshot?.qibla, colors: snapshot?.colors)
    completion(Timeline(entries: [entry], policy: .never))
  }
}

struct QiblaWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ReviselyQibla", provider: QiblaProvider()) { entry in
      QiblaView(entry: entry)
    }
    .configurationDisplayName("Qibla")
    .description("The Qibla's direction from true north, from where you last opened Revisely.")
    .supportedFamilies([.systemSmall, .accessoryCircular])
  }
}

struct QiblaView: View {
  let entry: QiblaEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let palette = Palette.make(scheme, entry.colors)
    Group {
      if family == .accessoryCircular {
        QiblaCircular(qibla: entry.qibla)
      } else {
        QiblaSmall(qibla: entry.qibla, palette: palette)
      }
    }
    .widgetURL(URL(string: "revisely://qibla")!)
    .widgetGroundIfHome(family, palette.bg)
  }
}

struct QiblaSmall: View {
  let qibla: QiblaInfo?
  let palette: Palette

  var body: some View {
    VStack(spacing: 6) {
      QiblaDial(bearing: qibla?.bearing, palette: palette, labelSize: 10)
        .frame(width: 76, height: 76)
      if let qibla {
        VStack(spacing: 1) {
          Text("Qibla \(qibla.label)")
            .font(.system(size: 15, weight: .semibold))
            .tone(palette.text)
          Text([qibla.place, "\(qibla.distance) to Makkah"].compactMap { $0 }.joined(separator: " · "))
            .font(.system(size: 12))
            .tone(palette.secondary, .secondary)
            .minimumScaleFactor(0.8)
        }
        .lineLimit(1)
      } else {
        Text("Open Revisely to set your location.")
          .font(.system(size: 12))
          .tone(palette.secondary, .secondary)
          .multilineTextAlignment(.center)
          .lineLimit(2)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(qibla.map { "Qibla \($0.label), \($0.distance) to Makkah" } ?? "Qibla: open Revisely to set your location")
  }
}

struct QiblaCircular: View {
  let qibla: QiblaInfo?

  var body: some View {
    ZStack {
      AccessoryWidgetBackground()
      QiblaDial(bearing: qibla?.bearing, palette: nil, labelSize: 8)
        .padding(3)
      if let qibla {
        Text("\(qibla.bearing)°").font(.system(size: 12, weight: .semibold, design: .rounded))
      } else {
        Image(systemName: "location.slash").font(.system(size: 14, weight: .medium))
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(qibla.map { "Qibla \($0.label)" } ?? "Qibla: open Revisely to set your location")
  }
}

/// A hairline dial, north up: N, the four cardinal ticks, and the Kaaba at the
/// bearing on a hairline from the centre. Without a bearing, just the dial.
struct QiblaDial: View {
  let bearing: Int?
  /// The full-colour palette; nil on the Lock Screen (the system's own tones).
  let palette: Palette?
  let labelSize: CGFloat
  @Environment(\.widgetRenderingMode) private var mode

  private var fullColor: Bool { mode == .fullColor && palette != nil }

  var body: some View {
    GeometryReader { geo in
      let size = min(geo.size.width, geo.size.height)
      let r = size / 2
      let c = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
      let line = fullColor ? AnyShapeStyle(palette!.secondary.opacity(0.55)) : AnyShapeStyle(.secondary)

      ZStack {
        Circle().strokeBorder(line, lineWidth: 1)

        // Cardinal ticks; N is a letter.
        ForEach([90, 180, 270], id: \.self) { angle in
          Path { p in
            p.move(to: point(c, r - 1, angle))
            p.addLine(to: point(c, r - size * 0.09, angle))
          }
          .stroke(line, lineWidth: 1)
        }
        Text("N")
          .font(.system(size: labelSize, weight: .semibold))
          .foregroundStyle(fullColor ? AnyShapeStyle(palette!.secondary) : AnyShapeStyle(.secondary))
          .position(point(c, r - labelSize * 0.95, 0))

        if let bearing {
          let marker = size * 0.15
          Path { p in
            p.move(to: c)
            p.addLine(to: point(c, r - marker * 0.9, Double(bearing)))
          }
          .stroke(fullColor ? AnyShapeStyle(palette!.accentText) : AnyShapeStyle(.primary), lineWidth: 1)
          .widgetAccentable()
          Circle()
            .fill(fullColor ? AnyShapeStyle(palette!.text) : AnyShapeStyle(.primary))
            .frame(width: 3, height: 3)
            .position(c)
          KaabaMark(palette: fullColor ? palette : nil)
            .frame(width: marker, height: marker)
            .rotationEffect(.degrees(Double(bearing)))
            .position(point(c, r - marker * 0.55, Double(bearing)))
            .widgetAccentable()
        }
      }
    }
  }

  /// The point `radius` from the centre at `degrees` clockwise from north (up).
  private func point(_ c: CGPoint, _ radius: CGFloat, _ degrees: Double) -> CGPoint {
    let a = degrees * .pi / 180
    return CGPoint(x: c.x + radius * CGFloat(sin(a)), y: c.y - radius * CGFloat(cos(a)))
  }
}

/// The Kaaba: a black cube with a band in the accent (a hairline edge keeps it
/// visible on black). One tone on the Lock Screen and when tinted.
struct KaabaMark: View {
  let palette: Palette?

  var body: some View {
    GeometryReader { geo in
      let s = geo.size.width
      if let palette {
        ZStack(alignment: .top) {
          RoundedRectangle(cornerRadius: s * 0.12)
            .fill(Color(hex: "#111111"))
            .overlay(RoundedRectangle(cornerRadius: s * 0.12).strokeBorder(palette.text.opacity(0.35), lineWidth: 0.5))
          Rectangle()
            .fill(palette.accentText)
            .frame(height: max(1, s * 0.16))
            .padding(.top, s * 0.24)
        }
      } else {
        RoundedRectangle(cornerRadius: s * 0.12).fill(.primary)
      }
    }
  }
}
