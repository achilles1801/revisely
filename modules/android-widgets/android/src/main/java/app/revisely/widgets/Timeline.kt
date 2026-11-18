package app.revisely.widgets

import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

// What each widget shows at an instant, and when that next changes. The same rules as the iOS
// timelines (targets/widget: TodayTimeline, PrayerTimeline, VerseBook), as plain functions of the
// snapshot and the time, so the JVM tests can check them. Times are epoch ms; days are the
// phone's calendar days.

sealed class TodayState {
  /** The day, and the one after it (the 4×2 widget says what comes next once it's done). */
  data class Ready(val day: WidgetDay, val next: WidgetDay?) : TodayState()

  /** Signed out, a new account, or no snapshot yet. */
  object SetUp : TodayState()

  /** The app hasn't been opened for longer than the days it wrote ahead. */
  object Stale : TodayState()
}

data class PrayerSlot(val name: PrayerName, val at: Long?)

data class PrayerMoment(
  val next: PrayerName,
  val nextAt: Long,
  /** The prayer before it (or the start of its day). */
  val previous: Long,
  /** The calendar day's six times. */
  val today: List<PrayerSlot>,
  /** The prayer whose time it is today; none between sunrise and Dhuhr. */
  val current: PrayerName?,
  val place: String?,
)

object Timeline {
  // ---------------------------------------------------------------- Today

  fun today(snapshot: Snapshot?, now: Long): TodayState {
    if (snapshot == null || snapshot.state != "ready") return TodayState.SetUp
    val live = snapshot.days.filter { it.endsAt > now }
    if (live.isEmpty()) return TodayState.Stale
    return TodayState.Ready(live[0], live.getOrNull(1))
  }

  /** When Today next changes: the end of the day shown. */
  fun todayBoundary(snapshot: Snapshot?, now: Long): Long? {
    if (snapshot == null || snapshot.state != "ready") return null
    return snapshot.days.firstOrNull { it.endsAt > now }?.endsAt
  }

  // ---------------------------------------------------------------- Prayer times

  /** The next prayer after `now`, the one before it and the day's times; null once the days written run out. */
  fun prayer(info: PrayerInfo?, now: Long, zone: TimeZone): PrayerMoment? {
    if (info == null) return null
    val prayers = info.days
      .flatMap { d -> PrayerName.PRAYERS.mapNotNull { n -> d.time(n)?.let { n to it } } }
      .sortedBy { it.second }
    val next = prayers.firstOrNull { it.second > now } ?: return null
    val previous = prayers.lastOrNull { it.second <= now }?.second
    // Today's list (the calendar day), else the day of the next prayer.
    val today = localDay(now, zone)
    val day = info.days.firstOrNull { it.day == today }
      ?: info.days.firstOrNull { d -> PrayerName.PRAYERS.any { d.time(it) == next.second } }
    val slots = day?.let { d -> PrayerName.values().map { PrayerSlot(it, d.time(it)) } } ?: emptyList()
    var current: PrayerName? = null
    for (slot in slots) {
      val at = slot.at
      if (at != null && at <= now) current = if (slot.name == PrayerName.SUNRISE) null else slot.name
    }
    return PrayerMoment(
      next = next.first,
      nextAt = next.second,
      previous = previous ?: day?.let { dayStart(it.day, zone) } ?: now,
      today = slots,
      current = current,
      place = info.place,
    )
  }

  /** When Prayer times next changes: the next of the six times or midnight; null once nothing is left. */
  fun prayerBoundary(info: PrayerInfo?, now: Long, zone: TimeZone): Long? {
    if (info == null || prayer(info, now, zone) == null) return null
    val instants = info.days.flatMap { d ->
      PrayerName.values().mapNotNull { d.time(it) } + listOfNotNull(dayStart(d.day, zone))
    }
    return instants.filter { it > now }.minOrNull()
  }

  // ---------------------------------------------------------------- Verse of the day

  /** The verse for the calendar day: a fixed stride through the list, as VerseBook on iOS. */
  fun verseIndex(now: Long, zone: TimeZone, count: Int): Int {
    if (count <= 0) return -1
    val days = epochDay(localDay(now, zone)) - epochDay("2026-01-01")
    val stride = listOf(17, 19, 23, 29, 31, 1).first { gcd(it, count) == 1 }
    return (((days * stride) % count + count) % count).toInt()
  }

  // ---------------------------------------------------------------- the calendar

  /** "YYYY-MM-DD" of the instant in the zone. */
  fun localDay(at: Long, zone: TimeZone): String {
    val c = Calendar.getInstance(zone).apply { timeInMillis = at }
    return String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
  }

  /** The start of a "YYYY-MM-DD" day in the zone. */
  fun dayStart(day: String, zone: TimeZone): Long? {
    val p = day.split("-").mapNotNull { it.toIntOrNull() }
    if (p.size != 3) return null
    return Calendar.getInstance(zone).apply {
      clear()
      set(p[0], p[1] - 1, p[2], 0, 0, 0)
    }.timeInMillis
  }

  fun nextMidnight(now: Long, zone: TimeZone): Long =
    Calendar.getInstance(zone).apply {
      timeInMillis = now
      add(Calendar.DAY_OF_MONTH, 1)
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }.timeInMillis

  private fun epochDay(day: String): Long {
    val start = dayStart(day, UTC) ?: return 0
    return Math.floorDiv(start, 86_400_000L)
  }

  private val UTC: TimeZone = TimeZone.getTimeZone("UTC")

  private tailrec fun gcd(a: Int, b: Int): Int = if (b == 0) a else gcd(b, a % b)
}

/** The widgets' words, as the iOS widgets say them (targets/widget). */
object Copy {
  fun pages(n: Int) = if (n == 1) "1 page" else "$n pages"
  fun streak(n: Int): String? = if (n > 0) "$n-day streak" else null

  const val SET_UP = "Open Revisely to set up your plan."
  const val STALE = "Open Revisely to see today's revision."
  const val PRAYER_OPEN = "Open Revisely to see prayer times."
  const val QIBLA_OPEN = "Open Revisely to set your location."

  fun setUp(state: TodayState) = if (state is TodayState.Stale) STALE else SET_UP

  /** 2×2: what's left, or what was revised. */
  fun smallStatus(d: WidgetDay) = when {
    d.completed -> "${pages(d.total)} revised"
    d.done > 0 -> "${d.left} left · ${d.done} done"
    else -> "${pages(d.left)} left"
  }

  /** 4×2: progress, or tomorrow once today is done. */
  fun mediumStatus(d: WidgetDay, next: WidgetDay?) = when {
    d.completed -> next?.let { "Tomorrow · ${it.title}" } ?: "Revised"
    d.done > 0 -> "${d.done} of ${d.total} done"
    else -> "${pages(d.left)} left"
  }

  fun mediumPlace(d: WidgetDay) = if (d.completed) "${pages(d.total)} revised · ${d.place}" else d.place

  /** 4×1: the title, and one line under it. */
  fun wideLine(d: WidgetDay) = when {
    d.completed -> listOfNotNull("${pages(d.total)} revised", streak(d.streak)).joinToString(" · ")
    d.done > 0 -> listOf("${d.done} of ${d.total} done", d.place).filter { it.isNotEmpty() }.joinToString(" · ")
    else -> listOf("${pages(d.left)} left", d.place).filter { it.isNotEmpty() }.joinToString(" · ")
  }

  /** 2×1: what's left over where it starts, or done over the streak. */
  fun tinyTitle(d: WidgetDay) = if (d.completed) "Done for today" else "${pages(d.left)} left"
  fun tinyLine(d: WidgetDay) = if (d.completed) streak(d.streak) ?: "${pages(d.total)} revised" else d.short

  /** Start or Continue, while there's something to revise. */
  fun action(d: WidgetDay): String? = when {
    d.completed || d.total <= 0 -> null
    d.done > 0 -> "Continue"
    else -> "Start"
  }

  /** Today's session, or Home once it's done (or there's nothing to start). */
  fun todayLink(state: TodayState): String =
    if (state is TodayState.Ready && !state.day.completed && state.day.total > 0) "revisely://today" else "revisely://home"
}
