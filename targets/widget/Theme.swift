import SwiftUI
import WidgetKit

extension Color {
  /// "#RRGGBB".
  init(hex: String) {
    var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.hasPrefix("#") { s.removeFirst() }
    var v: UInt64 = 0
    let ok = s.count == 6 && Scanner(string: s).scanHexInt64(&v)
    self.init(
      .sRGB,
      red: ok ? Double((v >> 16) & 0xFF) / 255 : 0,
      green: ok ? Double((v >> 8) & 0xFF) / 255 : 0,
      blue: ok ? Double(v & 0xFF) / 255 : 0,
      opacity: 1
    )
  }
}

/// The app's new design (src/theme/v2.ts): a white or black ground, ink text,
/// hairlines, and the accent only for the action and for "done".
struct Palette {
  let bg: Color
  let text: Color
  let secondary: Color
  let separator: Color
  let fill: Color
  let accentText: Color
  let done: Color
  let onDone: Color
  let primary: Color
  let onPrimary: Color

  static func make(_ scheme: ColorScheme, _ colors: ColorPair?) -> Palette {
    let dark = scheme == .dark
    let pair = colors ?? .indigo
    let c = dark ? pair.dark : pair.light
    return Palette(
      bg: Color(hex: dark ? "#000000" : "#FFFFFF"),
      text: Color(hex: dark ? "#FFFFFF" : "#1A1A1A"),
      secondary: Color(hex: dark ? "#8A8A93" : "#616977"),
      separator: Color(hex: dark ? "#1F1F1F" : "#E5E7EB"),
      fill: Color(hex: dark ? "#181818" : "#F7F7F8"),
      accentText: Color(hex: c.accentText),
      done: Color(hex: c.done),
      onDone: Color(hex: c.onDone),
      primary: Color(hex: c.primary),
      onPrimary: Color(hex: c.onPrimary)
    )
  }
}

enum Ink { case primary, secondary }

/// The palette's colour in full colour; in the tinted (accented) and Lock Screen
/// (vibrant) modes the system's own hierarchy, so secondary text stays secondary.
struct Tone: ViewModifier {
  @Environment(\.widgetRenderingMode) private var mode
  let color: Color
  let ink: Ink

  func body(content: Content) -> some View {
    if mode == .fullColor {
      content.foregroundStyle(color)
    } else if ink == .primary {
      content.foregroundStyle(.primary)
    } else {
      content.foregroundStyle(.secondary)
    }
  }
}

extension View {
  func tone(_ color: Color, _ ink: Ink = .primary) -> some View { modifier(Tone(color: color, ink: ink)) }

  /// The widget's ground: containerBackground from iOS 17 (removed by the system in
  /// StandBy and when tinted); before that, a padded background.
  @ViewBuilder func widgetGround(_ color: Color) -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      containerBackground(for: .widget) { color }
    } else {
      padding(16).background(color)
    }
  }

}

/// A 0.5pt separator, as between the app's rows.
struct Hairline: View {
  let color: Color
  @Environment(\.widgetRenderingMode) private var mode

  var body: some View {
    Rectangle()
      .fill(mode == .fullColor ? AnyShapeStyle(color) : AnyShapeStyle(.quaternary))
      .frame(height: 0.5)
  }
}

/// The gradient cursive R.
struct RMark: View {
  let height: CGFloat

  var body: some View {
    image
      .frame(height: height)
      .accessibilityHidden(true)
  }

  /// When the Home Screen is tinted (iOS 18), the R keeps its gradient's luminance.
  @ViewBuilder private var image: some View {
    if #available(iOSApplicationExtension 18.0, *) {
      Image("RMark").resizable().widgetAccentedRenderingMode(.accentedDesaturated).scaledToFit()
    } else {
      Image("RMark").resizable().scaledToFit()
    }
  }
}

/// The avatar-size mark of the app's rows (v2/Mark): a quiet circle holding the R,
/// or, once today is revised, the accent's "done" circle with a check.
struct MarkView: View {
  let done: Bool
  let size: CGFloat
  let palette: Palette
  @Environment(\.widgetRenderingMode) private var mode

  var body: some View {
    ZStack {
      if done && mode == .fullColor {
        Circle().fill(palette.done)
        Image(systemName: "checkmark")
          .font(.system(size: size * 0.42, weight: .bold))
          .foregroundStyle(palette.onDone)
      } else if done {
        // Tinted or clear: one colour, so the check is cut out of the circle.
        Image(systemName: "checkmark.circle.fill")
          .resizable()
          .scaledToFit()
          .foregroundStyle(.primary)
          .widgetAccentable()
      } else {
        Circle().fill(mode == .fullColor ? AnyShapeStyle(palette.fill) : AnyShapeStyle(.quaternary))
        RMark(height: size * 0.5)
      }
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }
}

enum Copy {
  static func pages(_ n: Int) -> String { n == 1 ? "1 page" : "\(n) pages" }
  static func streak(_ n: Int) -> String? { n > 0 ? "\(n)-day streak" : nil }
}
