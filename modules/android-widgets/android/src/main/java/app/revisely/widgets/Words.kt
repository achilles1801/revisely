package app.revisely.widgets

import org.json.JSONObject
import java.util.Locale

// The widgets' words in the app's language (WidgetWords and WidgetDayWords in src/lib/widgets/words.ts), from the
// snapshot, as the iOS widgets read them (targets/widget/Words.swift). Revisely's own Settings → Appearance → Language
// can differ from the phone's, so the widgets show what the app wrote. Before an app that writes them, the English the
// widgets always had. (The widget picker's names and previews are resources, in the phone's language: values-ar.)

data class Words(
  val language: String,
  val rtl: Boolean,
  val today: String,
  val revised: String,
  val revisedToday: String,
  val doneForToday: String,
  val todayDone: String,
  val continueLabel: String,
  val startLabel: String,
  val left: String,
  val openRevisely: String,
  val openToSeeToday: String,
  val openToSetUp: String,
  val verseOfTheDay: String,
  val prayer: String,
  val prayerTimes: String,
  val openToSeePrayer: String,
  /** "in {time}": the live countdown goes where {time} is. */
  val countdown: String,
  val qiblaOpen: String,
  val qiblaOpenLabel: String,
  val north: String,
  val prayerNames: Map<PrayerName, String>,
  /** The language's digits 0–9. */
  val digits: String,
) {
  val isEnglish: Boolean get() = language == "en"

  /** Dates and times in the app's language: the phone's own locale in English, as before. */
  val locale: Locale get() = if (isEnglish) Locale.getDefault() else Locale.forLanguageTag(language)

  fun name(prayer: PrayerName): String = prayerNames[prayer] ?: prayer.label

  /** The Chronometer's format: "in %s". */
  val countdownFormat: String get() = countdown.replace("%", "%%").replace("{time}", "%s")

  /** A number the widget writes itself (a verse's reference), in the language's digits. */
  fun number(n: Int): String {
    if (digits.length != 10) return n.toString()
    return n.toString().map { c -> if (c in '0'..'9') digits[c - '0'] else c }.joinToString("")
  }

  companion object {
    val ENGLISH = Words(
      language = "en", rtl = false,
      today = "Today", revised = "Revised", revisedToday = "Revised today", doneForToday = "Done for today",
      todayDone = "Today's revision is done", continueLabel = "Continue", startLabel = "Start", left = "left",
      openRevisely = "Open Revisely", openToSeeToday = "Open Revisely to see today's revision.",
      openToSetUp = "Open Revisely to set up your plan.", verseOfTheDay = "Verse of the day", prayer = "Prayer",
      prayerTimes = "Prayer times", openToSeePrayer = "Open Revisely to see prayer times.", countdown = "in {time}",
      qiblaOpen = "Open Revisely to set your location.", qiblaOpenLabel = "Qibla: open Revisely to set your location",
      north = "N", prayerNames = PrayerName.values().associateWith { it.label }, digits = "0123456789",
    )

    /** The snapshot's words; each one missing keeps its English. */
    fun parse(o: JSONObject?): Words {
      if (o == null) return ENGLISH
      val e = ENGLISH
      fun s(key: String, fallback: String) = o.optString(key).takeIf { it.isNotEmpty() } ?: fallback
      val names = o.optJSONObject("prayerNames")
      return Words(
        language = s("language", e.language),
        rtl = o.optBoolean("rtl", e.rtl),
        today = s("today", e.today),
        revised = s("revised", e.revised),
        revisedToday = s("revisedToday", e.revisedToday),
        doneForToday = s("doneForToday", e.doneForToday),
        todayDone = s("todayDone", e.todayDone),
        continueLabel = s("continueLabel", e.continueLabel),
        startLabel = s("startLabel", e.startLabel),
        left = s("left", e.left),
        openRevisely = s("openRevisely", e.openRevisely),
        openToSeeToday = s("openToSeeToday", e.openToSeeToday),
        openToSetUp = s("openToSetUp", e.openToSetUp),
        verseOfTheDay = s("verseOfTheDay", e.verseOfTheDay),
        prayer = s("prayer", e.prayer),
        prayerTimes = s("prayerTimes", e.prayerTimes),
        openToSeePrayer = s("openToSeePrayer", e.openToSeePrayer),
        countdown = s("countdown", e.countdown),
        qiblaOpen = s("qiblaOpen", e.qiblaOpen),
        qiblaOpenLabel = s("qiblaOpenLabel", e.qiblaOpenLabel),
        north = s("north", e.north),
        prayerNames = PrayerName.values().associateWith { n -> names?.optString(n.key)?.takeIf { it.isNotEmpty() } ?: n.label },
        digits = s("digits", e.digits),
      )
    }
  }
}

/** One day's pieces (WidgetDayWords in words.ts). */
data class DayWords(
  val pages: String,
  val left: String,
  val leftToday: String,
  val revised: String,
  val leftCount: String,
  val leftNumber: String,
  val leftAndDone: String,
  val doneOf: String,
  val streak: String?,
  val streakShort: String?,
  val asTomorrow: String,
) {
  companion object {
    /** The widgets' own English for a day, as they wrote it before the app did. */
    fun english(d: WidgetDay): DayWords {
      fun pages(n: Int) = if (n == 1) "1 page" else "$n pages"
      return DayWords(
        pages = pages(d.total),
        left = "${pages(d.left)} left",
        leftToday = "${pages(d.left)} left today",
        revised = "${pages(d.total)} revised",
        leftCount = "${d.left} left",
        leftNumber = "${d.left}",
        leftAndDone = "${d.left} left · ${d.done} done",
        doneOf = "${d.done} of ${d.total} done",
        streak = if (d.streak > 0) "${d.streak}-day streak" else null,
        streakShort = if (d.streak > 0) "${d.streak}d" else null,
        asTomorrow = "Tomorrow · ${d.title}",
      )
    }

    fun parse(o: JSONObject?): DayWords? {
      if (o == null) return null
      fun s(key: String): String? = if (!o.has(key) || o.isNull(key)) null else o.optString(key)
      return DayWords(
        pages = s("pages") ?: return null,
        left = s("left") ?: return null,
        leftToday = s("leftToday") ?: return null,
        revised = s("revised") ?: return null,
        leftCount = s("leftCount") ?: return null,
        leftNumber = s("leftNumber") ?: return null,
        leftAndDone = s("leftAndDone") ?: return null,
        doneOf = s("doneOf") ?: return null,
        streak = s("streak"),
        streakShort = s("streakShort"),
        asTomorrow = s("asTomorrow") ?: return null,
      )
    }
  }
}
