package app.revisely.widgets

import org.json.JSONArray
import org.json.JSONObject

// The snapshot the app writes (WidgetSnapshot in src/lib/widgets/snapshot.ts), the same JSON
// the iOS widgets read from the App Group (targets/widget/Snapshot.swift).

/** One revision day, worked out by the app (WidgetDay in snapshot.ts). */
data class WidgetDay(
  val day: String,
  val startsAt: Long,
  val endsAt: Long,
  /** By surah, never page numbers: "Al-Mujadila to At-Tahrim". */
  val title: String,
  /** Its juz: "Juz 28" (`where` in the JSON). */
  val place: String,
  /** One short line: the title when it fits, else where the day starts. */
  val short: String,
  val total: Int,
  val done: Int,
  val completed: Boolean,
  val streak: Int,
) {
  val left: Int get() = if (completed) 0 else maxOf(total - done, 0)
}

/** The accent's colours for one appearance, as ARGB ints. */
data class AccentColors(
  val accentText: Int,
  val done: Int,
  val onDone: Int,
  val primary: Int,
  val onPrimary: Int,
  /** The next prayer's cell (4×1) and the text on it. */
  val accentSubtle: Int,
  val subtleText: Int,
)

data class ColorPair(val light: AccentColors, val dark: AccentColors) {
  companion object {
    /** Indigo, the default accent, before the app has written anything (theme/v2's tokens). */
    val INDIGO = ColorPair(
      light = AccentColors(
        accentText = argb("#624BD5"), done = argb("#624BD5"), onDone = argb("#FFFFFF"),
        primary = argb("#624BD5"), onPrimary = argb("#FFFFFF"),
        accentSubtle = argb("#EFECFB"), subtleText = argb("#624BD5"),
      ),
      dark = AccentColors(
        accentText = argb("#9789DA"), done = argb("#624BD5"), onDone = argb("#FFFFFF"),
        primary = argb("#624BD5"), onPrimary = argb("#FFFFFF"),
        accentSubtle = argb("#16113A"), subtleText = argb("#9789DA"),
      ),
    )
  }
}

/** The Qibla from the phone's last known position: the bearing and distance only. */
data class QiblaInfo(val bearing: Int, val label: String, val distance: String, val place: String?)

enum class PrayerName(val key: String, val label: String) {
  FAJR("fajr", "Fajr"),
  SUNRISE("sunrise", "Sunrise"),
  DHUHR("dhuhr", "Dhuhr"),
  ASR("asr", "Asr"),
  MAGHRIB("maghrib", "Maghrib"),
  ISHA("isha", "Isha");

  companion object {
    /** The five prayers: sunrise is a time of the day, never the next prayer. */
    val PRAYERS = listOf(FAJR, DHUHR, ASR, MAGHRIB, ISHA)
  }
}

/** A day's times as epoch ms; null when there is none that day (high latitudes). */
data class PrayerDay(val day: String, val times: Map<PrayerName, Long?>) {
  fun time(name: PrayerName): Long? = times[name]
}

data class PrayerInfo(val place: String?, val days: List<PrayerDay>)

data class Snapshot(
  /** "ready", "signedOut" or "noPlan". */
  val state: String,
  val colors: ColorPair,
  val days: List<WidgetDay>,
  val qibla: QiblaInfo?,
  val prayer: PrayerInfo?,
) {
  companion object {
    /** The snapshot, or null when it's missing, unreadable or another version. */
    fun parse(json: String?): Snapshot? {
      if (json.isNullOrBlank()) return null
      return try {
        val o = JSONObject(json)
        if (o.optInt("v") != 1) return null
        Snapshot(
          state = o.optString("state"),
          colors = colorPair(o.optJSONObject("colors")),
          days = o.optJSONArray("days").objects().map(::day),
          qibla = o.optJSONObject("qibla")?.let(::qibla),
          prayer = o.optJSONObject("prayer")?.let(::prayer),
        )
      } catch (e: Exception) {
        null
      }
    }

    private fun day(o: JSONObject) = WidgetDay(
      day = o.optString("day"),
      startsAt = o.optLong("startsAt"),
      endsAt = o.optLong("endsAt"),
      title = o.optString("title"),
      place = o.optString("where"),
      short = o.optString("short"),
      total = o.optInt("total"),
      done = o.optInt("done"),
      completed = o.optBoolean("completed"),
      streak = o.optInt("streak"),
    )

    private fun colorPair(o: JSONObject?): ColorPair {
      if (o == null) return ColorPair.INDIGO
      return ColorPair(
        light = accent(o.optJSONObject("light"), ColorPair.INDIGO.light),
        dark = accent(o.optJSONObject("dark"), ColorPair.INDIGO.dark),
      )
    }

    /** Each colour falls back to Indigo's (snapshots before accentSubtle had five). */
    private fun accent(o: JSONObject?, d: AccentColors): AccentColors {
      if (o == null) return d
      fun c(key: String, fallback: Int) = o.optString(key).takeIf { it.isNotEmpty() }?.let(::argbOrNull) ?: fallback
      return AccentColors(
        accentText = c("accentText", d.accentText),
        done = c("done", d.done),
        onDone = c("onDone", d.onDone),
        primary = c("primary", d.primary),
        onPrimary = c("onPrimary", d.onPrimary),
        accentSubtle = c("accentSubtle", d.accentSubtle),
        subtleText = c("subtleText", d.subtleText),
      )
    }

    private fun qibla(o: JSONObject) = QiblaInfo(
      bearing = o.optInt("bearing"),
      label = o.optString("label"),
      distance = o.optString("distance"),
      place = o.optNullableString("place"),
    )

    private fun prayer(o: JSONObject) = PrayerInfo(
      place = o.optNullableString("place"),
      days = o.optJSONArray("days").objects().map { d ->
        PrayerDay(
          day = d.optString("day"),
          times = PrayerName.values().associateWith { n -> if (d.isNull(n.key)) null else d.optLong(n.key) },
        )
      },
    )
  }
}

/** "#RRGGBB" as an opaque ARGB int. */
fun argb(hex: String): Int = argbOrNull(hex) ?: error("Not a colour: $hex")

fun argbOrNull(hex: String): Int? {
  val s = hex.trim().removePrefix("#")
  if (s.length != 6) return null
  val v = s.toLongOrNull(16) ?: return null
  return (0xFF000000L or v).toInt()
}

private fun JSONArray?.objects(): List<JSONObject> =
  if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

private fun JSONObject.optNullableString(key: String): String? =
  if (!has(key) || isNull(key)) null else optString(key)
