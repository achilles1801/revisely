package app.revisely.widgets

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Paint
import android.graphics.Typeface
import android.net.Uri
import android.os.SystemClock
import android.text.SpannableString
import android.text.Spanned
import android.text.format.DateFormat
import android.text.style.TypefaceSpan
import android.util.SizeF
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

internal enum class Kind { TODAY, VERSE, QIBLA, PRAYER }

/** The layout for a size (dp): 4 cells wide from WIDE, 2 cells tall from TALL. */
private enum class Shape { TINY, WIDE, SMALL, MEDIUM }

private const val WIDE = 280f
private const val TALL = 140f

private fun shapeOf(size: SizeF) = when {
  size.width >= WIDE && size.height >= TALL -> Shape.MEDIUM
  size.width >= WIDE -> Shape.WIDE
  size.height >= TALL -> Shape.SMALL
  else -> Shape.TINY
}

/** Builds a widget's views for one size, from the snapshot at one instant. */
internal class Render(private val context: Context, private val snapshot: Snapshot?, private val now: Long) {
  private val ink = Ink(context, snapshot?.colors ?: ColorPair.INDIGO)
  private val zone: TimeZone = TimeZone.getDefault()
  private val pkg = context.packageName
  private val fontScale = context.resources.configuration.fontScale

  fun views(kind: Kind, size: SizeF): RemoteViews = when (kind) {
    Kind.TODAY -> today(size)
    Kind.VERSE -> verse(size)
    Kind.QIBLA -> qibla(size)
    Kind.PRAYER -> prayer(size)
  }

  // ---------------------------------------------------------------- Today

  private fun today(size: SizeF): RemoteViews {
    val state = Timeline.today(snapshot, now)
    val day = (state as? TodayState.Ready)?.day
    val next = (state as? TodayState.Ready)?.next
    val shape = shapeOf(size)
    val v = RemoteViews(pkg, when (shape) {
      Shape.MEDIUM -> R.layout.aw_today_medium
      Shape.WIDE -> R.layout.aw_today_wide
      Shape.SMALL -> R.layout.aw_today_small
      Shape.TINY -> R.layout.aw_today_tiny
    })
    mark(v, day?.completed == true)

    when (shape) {
      Shape.SMALL, Shape.MEDIUM -> {
        val streak = day?.let { Copy.streak(it.streak) }
        v.setTextViewText(R.id.aw_streak, if (shape == Shape.MEDIUM) "· ${streak.orEmpty()}" else streak.orEmpty())
        v.visible(R.id.aw_streak, streak != null)
        val ready = day != null
        listOf(R.id.aw_title, R.id.aw_place, R.id.aw_hairline).forEach { v.visible(it, ready) }
        v.visible(R.id.aw_setup, !ready)
        if (shape == Shape.SMALL) v.visible(R.id.aw_status, ready) else v.visible(R.id.aw_foot, ready)
        if (day != null) {
          val title = if (day.completed) "Done for today" else day.title
          v.setTextViewText(R.id.aw_title, title)
          if (shape == Shape.SMALL) fit(v, R.id.aw_title, title, 16f, size.width - 32f, 2)
          else fit(v, R.id.aw_title, title, 17f, size.width - 32f - 52f, 1)
          ink.textColor(v, R.id.aw_title, if (day.completed) ink.accentText else ink.text)
          if (shape == Shape.SMALL) {
            v.setTextViewText(R.id.aw_place, day.place)
            v.setTextViewText(R.id.aw_status, Copy.smallStatus(day))
          } else {
            v.setTextViewText(R.id.aw_place, Copy.mediumPlace(day))
            v.setTextViewText(R.id.aw_status, Copy.mediumStatus(day, next))
            pill(v, Copy.action(day))
          }
        } else {
          v.setTextViewText(R.id.aw_setup, Copy.setUp(state))
        }
      }
      Shape.WIDE, Shape.TINY -> {
        if (day != null) {
          val title = if (shape == Shape.WIDE) (if (day.completed) "Done for today" else day.title) else Copy.tinyTitle(day)
          v.setTextViewText(R.id.aw_title, title)
          val room = if (shape == Shape.WIDE) size.width - 28f - 48f - (if (Copy.action(day) != null) 84f else 0f) else size.width - 28f - 42f
          fit(v, R.id.aw_title, title, 15f, room, 1)
          ink.textColor(v, R.id.aw_title, if (day.completed) ink.accentText else ink.text)
          v.setTextViewText(R.id.aw_line, if (shape == Shape.WIDE) Copy.wideLine(day) else Copy.tinyLine(day))
          v.setInt(R.id.aw_line, "setMaxLines", 1)
          if (shape == Shape.WIDE) pill(v, Copy.action(day))
        } else {
          v.setTextViewText(R.id.aw_title, context.getString(R.string.aw_today))
          v.setTextViewTextSize(R.id.aw_title, TypedValue.COMPLEX_UNIT_SP, 15f)
          ink.textColor(v, R.id.aw_title, ink.text)
          v.setTextViewText(R.id.aw_line, Copy.setUp(state))
          v.setInt(R.id.aw_line, "setMaxLines", 2)
          if (shape == Shape.WIDE) pill(v, null)
        }
      }
    }
    v.setOnClickPendingIntent(android.R.id.background, link(Copy.todayLink(state)))
    return v
  }

  /**
   * iOS's minimumScaleFactor(0.8): the title at `sp`, or smaller (to 80%) until it fits its lines
   * without breaking inside a word. The app holds a surah and its ayahs together ("Al‑Baqarah
   * 142–252", a no-break space), which Android would otherwise break inside the number.
   */
  private fun fit(v: RemoteViews, id: Int, text: String, sp: Float, widthDp: Float, lines: Int) {
    v.setTextViewTextSize(id, TypedValue.COMPLEX_UNIT_SP, fitSize(text, sp, widthDp, lines))
  }

  private fun fitSize(text: String, sp: Float, widthDp: Float, lines: Int): Float {
    // Widths in dp: the paint's size is the text's dp size, so measured widths are dp too.
    val words = text.split(' ', '\n').filter { it.isNotEmpty() }
    var size = sp
    while (size > sp * 0.8f) {
      medium.textSize = size * fontScale
      val whole = medium.measureText(text)
      val widest = words.maxOfOrNull { medium.measureText(it) } ?: 0f
      val fits = if (lines == 1) whole <= widthDp else widest <= widthDp && whole <= widthDp * lines * 0.9f
      if (fits) return size
      size -= 0.5f
    }
    return sp * 0.8f
  }

  private val medium = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL) }

  /** v2/Mark: a quiet circle holding the R, or the accent's "done" circle with a check. */
  private fun mark(v: RemoteViews, done: Boolean) {
    v.visible(R.id.aw_mark_r, !done)
    v.visible(R.id.aw_mark_check, done)
    ink.tint(v, R.id.aw_mark_circle, if (done) ink.done else ink.fill)
    ink.tint(v, R.id.aw_mark_check, ink.onDone)
  }

  /** The primary pill (v2/PillButton), while there's something to start. */
  private fun pill(v: RemoteViews, action: String?) {
    v.visible(R.id.aw_pill, action != null)
    if (action == null) return
    v.setTextViewText(R.id.aw_pill_text, action)
    ink.tint(v, R.id.aw_pill_bg, ink.primary)
    ink.textColor(v, R.id.aw_pill_text, ink.onPrimary)
  }

  // ---------------------------------------------------------------- Verse of the day

  private fun verse(size: SizeF): RemoteViews {
    val medium = size.width >= WIDE
    val v = RemoteViews(pkg, if (medium) R.layout.aw_verse_medium else R.layout.aw_verse_small)
    val verse = Verses.of(context, now, zone)
    v.visible(R.id.aw_arabic, verse != null)
    v.visible(R.id.aw_reference, verse != null)
    v.visible(R.id.aw_open, verse == null)
    if (verse == null) {
      v.setOnClickPendingIntent(android.R.id.background, link("revisely://home"))
      return v
    }
    // The room between the header and the reference (their lines grow with the font size).
    val lines = (if (medium) 18f else 17f) * 2 * fontScale
    val height = size.height - 32f - lines - 8f
    val bitmap = Masks.arabic(context, verse.arabic, size.width - 32f, height, if (medium) 26f else 21f, if (medium) 3 else 4)
    v.setImageViewBitmap(R.id.aw_arabic, bitmap)
    ink.tint(v, R.id.aw_arabic, ink.text)
    v.setContentDescription(R.id.aw_arabic, verse.arabic)
    v.setTextViewText(R.id.aw_reference, verse.reference)
    v.setOnClickPendingIntent(android.R.id.background, link("revisely://read?page=${verse.page}"))
    return v
  }

  // ---------------------------------------------------------------- Qibla

  private fun qibla(size: SizeF): RemoteViews {
    val tiny = minOf(size.width, size.height) < TALL
    val v = RemoteViews(pkg, if (tiny) R.layout.aw_qibla_tiny else R.layout.aw_qibla_small)
    val q = snapshot?.qibla
    val dial = Masks.dial(context, if (tiny) 60f else 72f, q?.bearing, if (tiny) 8f else 10f, if (tiny) 13f else 0f)
    v.setImageViewBitmap(R.id.aw_dial_ring, dial.ring)
    v.setImageViewBitmap(R.id.aw_dial_body, dial.body)
    v.setImageViewBitmap(R.id.aw_dial_accent, dial.accent)
    v.setImageViewBitmap(R.id.aw_dial_ink, dial.ink)
    ink.tint(v, R.id.aw_dial_ring, ink.secondary)
    ink.tint(v, R.id.aw_dial_body, ink.kaaba)
    ink.tint(v, R.id.aw_dial_accent, ink.accentText)
    ink.tint(v, R.id.aw_dial_ink, ink.text)
    if (tiny) {
      v.visible(R.id.aw_qibla_short, q != null)
      v.visible(R.id.aw_no_location, q == null)
      if (q != null) v.setTextViewText(R.id.aw_qibla_short, "${q.bearing}°")
    } else {
      v.visible(R.id.aw_qibla_text, q != null)
      v.visible(R.id.aw_open, q == null)
      if (q != null) {
        v.setTextViewText(R.id.aw_qibla_label, "Qibla ${q.label}")
        v.visible(R.id.aw_qibla_place, q.place != null)
        v.setTextViewText(R.id.aw_qibla_place, q.place.orEmpty())
        v.setTextViewText(R.id.aw_qibla_distance, "${q.distance} to Makkah")
      } else {
        v.setTextViewText(R.id.aw_open, Copy.QIBLA_OPEN)
      }
    }
    v.setContentDescription(
      android.R.id.background,
      q?.let { "Qibla ${it.label}, ${it.distance} to Makkah" } ?: "Qibla: open Revisely to set your location",
    )
    v.setOnClickPendingIntent(android.R.id.background, link("revisely://qibla"))
    return v
  }

  // ---------------------------------------------------------------- Prayer times

  private fun prayer(size: SizeF): RemoteViews {
    val moment = Timeline.prayer(snapshot?.prayer, now, zone)
    val shape = shapeOf(size)
    val v = RemoteViews(pkg, when (shape) {
      Shape.MEDIUM -> R.layout.aw_prayer_medium
      Shape.WIDE -> R.layout.aw_prayer_wide
      Shape.SMALL -> R.layout.aw_prayer_small
      Shape.TINY -> R.layout.aw_prayer_tiny
    })

    when (shape) {
      Shape.SMALL, Shape.MEDIUM -> {
        val place = moment?.place
        v.visible(R.id.aw_place, place != null)
        v.setTextViewText(R.id.aw_place, place.orEmpty())
        v.visible(R.id.aw_ready, moment != null)
        v.visible(R.id.aw_open, moment == null)
        if (shape == Shape.MEDIUM) v.visible(R.id.aw_rows, moment != null)
        if (moment != null) {
          nextPrayer(v, moment)
          if (shape == Shape.MEDIUM) rows(v, moment)
        } else {
          v.setTextViewText(R.id.aw_open, Copy.PRAYER_OPEN)
        }
      }
      Shape.WIDE -> {
        val cells = moment?.today?.filter { it.name != PrayerName.SUNRISE }.orEmpty()
        for (i in 0 until 5) cell(v, i, cells.getOrNull(i), moment)
        v.visible(R.id.aw_open, moment == null)
        if (moment == null) v.setTextViewText(R.id.aw_open, Copy.PRAYER_OPEN)
      }
      Shape.TINY -> {
        v.visible(R.id.aw_ready, moment != null)
        v.visible(R.id.aw_title, moment == null)
        v.visible(R.id.aw_open, moment == null)
        v.visible(R.id.aw_countdown_preview, false)
        if (moment != null) {
          v.setTextViewText(R.id.aw_next_name, moment.next.label)
          ink.textColor(v, R.id.aw_next_name, ink.accentText)
          v.setTextViewText(R.id.aw_next_time, time(moment.nextAt))
          countdown(v, moment.nextAt)
        } else {
          v.visible(R.id.aw_countdown, false)
          v.setTextViewText(R.id.aw_open, Copy.PRAYER_OPEN)
        }
      }
    }
    v.setOnClickPendingIntent(android.R.id.background, link("revisely://prayer"))
    return v
  }

  /** The next prayer: its name in the accent, the time large, the countdown under a hairline. */
  private fun nextPrayer(v: RemoteViews, moment: PrayerMoment) {
    v.setTextViewText(R.id.aw_next_name, moment.next.label)
    ink.textColor(v, R.id.aw_next_name, ink.accentText)
    v.setTextViewText(R.id.aw_next_time, time(moment.nextAt))
    v.visible(R.id.aw_countdown_preview, false)
    countdown(v, moment.nextAt)
  }

  /** The day's six times: the next in the accent, the ones that have passed (and sunrise) quieter. */
  private fun rows(v: RemoteViews, moment: PrayerMoment) {
    val names = listOf(R.id.aw_row0_name, R.id.aw_row1_name, R.id.aw_row2_name, R.id.aw_row3_name, R.id.aw_row4_name, R.id.aw_row5_name)
    val times = listOf(R.id.aw_row0_time, R.id.aw_row1_time, R.id.aw_row2_time, R.id.aw_row3_time, R.id.aw_row4_time, R.id.aw_row5_time)
    for (i in names.indices) {
      val slot = moment.today.getOrNull(i)
      val name = slot?.name ?: PrayerName.values()[i]
      val at = slot?.at
      val isNext = name == moment.next && at == moment.nextAt
      val past = at != null && at <= now && name != moment.current
      val quiet = !isNext && (past || name == PrayerName.SUNRISE)
      val tone = if (isNext) ink.accentText else if (quiet) ink.secondary else ink.text
      v.setTextViewText(names[i], weighted(name.label, isNext))
      v.setTextViewText(times[i], weighted(at?.let(::time) ?: "—", isNext))
      ink.textColor(v, names[i], tone)
      ink.textColor(v, times[i], tone)
    }
  }

  /** A prayer in the 4×1 row: the next on the accent's tint, the ones that have passed quieter. */
  private fun cell(v: RemoteViews, i: Int, slot: PrayerSlot?, moment: PrayerMoment?) {
    val frame = listOf(R.id.aw_cell0, R.id.aw_cell1, R.id.aw_cell2, R.id.aw_cell3, R.id.aw_cell4)[i]
    val bg = listOf(R.id.aw_cell0_bg, R.id.aw_cell1_bg, R.id.aw_cell2_bg, R.id.aw_cell3_bg, R.id.aw_cell4_bg)[i]
    val name = listOf(R.id.aw_cell0_name, R.id.aw_cell1_name, R.id.aw_cell2_name, R.id.aw_cell3_name, R.id.aw_cell4_name)[i]
    val time = listOf(R.id.aw_cell0_time, R.id.aw_cell1_time, R.id.aw_cell2_time, R.id.aw_cell3_time, R.id.aw_cell4_time)[i]
    val shown = moment != null && slot != null
    v.visible(frame, shown)
    if (!shown) return
    val at = slot!!.at
    val isNext = slot.name == moment!!.next && at == moment.nextAt
    val past = at != null && at <= now && slot.name != moment.current
    v.setViewVisibility(bg, if (isNext) View.VISIBLE else View.INVISIBLE)
    if (isNext) ink.tint(v, bg, ink.accentSubtle)
    v.setTextViewText(name, weighted(slot.name.label, isNext))
    v.setTextViewText(time, at?.let(::shortTime) ?: "—")
    ink.textColor(v, name, if (isNext) ink.subtleText else ink.secondary)
    ink.textColor(v, time, if (isNext) ink.subtleText else if (past) ink.secondary else ink.text)
  }

  /** Android's countdown, kept ticking by the launcher: "in 1:12:05". */
  private fun countdown(v: RemoteViews, at: Long) {
    val base = SystemClock.elapsedRealtime() + (at - System.currentTimeMillis())
    v.visible(R.id.aw_countdown, true)
    v.setChronometer(R.id.aw_countdown, base, context.getString(R.string.aw_countdown_format), true)
    v.setChronometerCountDown(R.id.aw_countdown, true)
  }

  /** "2:21 PM", or "14:21" on a 24-hour phone. */
  private fun time(at: Long): String = DateFormat.getTimeFormat(context).format(Date(at))

  /** The time without AM/PM ("2:21", or "14:21"), for the 4×1 row. */
  private fun shortTime(at: Long): String {
    val locale = Locale.getDefault()
    val skeleton = if (DateFormat.is24HourFormat(context)) "Hm" else "hm"
    var quoted = false
    val pattern = DateFormat.getBestDateTimePattern(locale, skeleton).filter { c ->
      if (c == '\'') quoted = !quoted
      quoted || c !in "abB"
    }.trim()
    return SimpleDateFormat(pattern, locale).apply { timeZone = zone }.format(Date(at))
  }

  private fun weighted(text: String, medium: Boolean): CharSequence {
    if (!medium) return text
    return SpannableString(text).apply { setSpan(TypefaceSpan("sans-serif-medium"), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
  }

  // ---------------------------------------------------------------- links

  /** Opens the app at a link (lib/widgets/links), whether or not it's running. */
  private fun link(url: String): PendingIntent {
    val intent = (context.packageManager.getLaunchIntentForPackage(pkg) ?: Intent()).apply {
      action = Intent.ACTION_VIEW
      data = Uri.parse(url)
      setPackage(pkg)
      removeCategory(Intent.CATEGORY_LAUNCHER)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    return PendingIntent.getActivity(context, url.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun RemoteViews.visible(id: Int, on: Boolean) = setViewVisibility(id, if (on) View.VISIBLE else View.GONE)
}

/** One of the verses in verses.json (the iOS widget's list, scripts/widget-verses.ts). */
internal data class Verse(val sura: Int, val ayah: Int, val surah: String, val page: Int, val arabic: String) {
  val reference get() = "$surah $sura:$ayah"
}

internal object Verses {
  @Volatile private var all: List<Verse>? = null

  fun list(context: Context): List<Verse> = all ?: load(context).also { all = it }

  /** The verse for the calendar day: the same as the iOS widget's on that date. */
  fun of(context: Context, now: Long, zone: TimeZone): Verse? {
    val verses = list(context)
    val i = Timeline.verseIndex(now, zone, verses.size)
    return verses.getOrNull(i)
  }

  private fun load(context: Context): List<Verse> = try {
    val json = context.assets.open("widgets/verses.json").bufferedReader().use { it.readText() }
    val a = JSONArray(json)
    (0 until a.length()).map { i ->
      val o = a.getJSONObject(i)
      Verse(o.getInt("sura"), o.getInt("ayah"), o.getString("surah"), o.getInt("page"), o.getString("arabic"))
    }
  } catch (e: Exception) {
    emptyList()
  }
}
