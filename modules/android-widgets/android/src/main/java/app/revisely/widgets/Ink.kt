package app.revisely.widgets

import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.widget.RemoteViews

/** A colour in the light and the dark appearance. */
internal data class Tone(val light: Int, val dark: Int)

/**
 * The widget's colours. From Android 12 the launcher picks light or dark itself (setColorInt with
 * both), so a widget follows the system's dark theme at once; before, the colour for the current
 * appearance is written, and the next update follows a change. Base colours (ground, ink,
 * hairlines) are resources with a values-night copy; the accent comes from the snapshot.
 */
internal class Ink(context: Context, accent: ColorPair) {
  private val night = isNight(context)
  private val lightContext = themed(context, false)
  private val darkContext = themed(context, true)

  val text = res(R.color.aw_text)
  val secondary = res(R.color.aw_secondary)
  val fill = res(R.color.aw_fill)
  val kaaba = res(R.color.aw_kaaba)

  val accentText = Tone(accent.light.accentText, accent.dark.accentText)
  val done = Tone(accent.light.done, accent.dark.done)
  val onDone = Tone(accent.light.onDone, accent.dark.onDone)
  val primary = Tone(accent.light.primary, accent.dark.primary)
  val onPrimary = Tone(accent.light.onPrimary, accent.dark.onPrimary)
  val accentSubtle = Tone(accent.light.accentSubtle, accent.dark.accentSubtle)
  val subtleText = Tone(accent.light.subtleText, accent.dark.subtleText)

  fun textColor(views: RemoteViews, id: Int, tone: Tone) = set(views, id, "setTextColor", tone)

  /** Tints an image (a white drawable, or a mask bitmap). */
  fun tint(views: RemoteViews, id: Int, tone: Tone) = set(views, id, "setColorFilter", tone)

  private fun set(views: RemoteViews, id: Int, method: String, tone: Tone) {
    if (Build.VERSION.SDK_INT >= 31) {
      views.setColorInt(id, method, tone.light, tone.dark)
    } else {
      views.setInt(id, method, if (night) tone.dark else tone.light)
    }
  }

  private fun res(id: Int) = Tone(lightContext.getColor(id), darkContext.getColor(id))

  companion object {
    fun isNight(context: Context) =
      (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    private fun themed(context: Context, night: Boolean): Context {
      val config = Configuration(context.resources.configuration)
      config.uiMode = (config.uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or
        (if (night) Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO)
      return context.createConfigurationContext(config)
    }
  }
}
