package app.revisely.widgets

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

// Run: cd android && ./gradlew :android-widgets:testDebugUnitTest (after `npx expo prebuild -p android`).
class TimelineTest {
  private val ny: TimeZone = TimeZone.getTimeZone("America/New_York")

  private fun at(y: Int, m: Int, d: Int, h: Int, min: Int, s: Int = 0, zone: TimeZone = ny): Long =
    Calendar.getInstance(zone).apply {
      clear()
      set(y, m - 1, d, h, min, s)
    }.timeInMillis

  private fun day(day: String, start: Long, end: Long, done: Int = 0, completed: Boolean = false) = WidgetDay(
    day = day, startsAt = start, endsAt = end, title = "Al‑Mujadila to At‑Tahrim", place = "Juz 28",
    short = "Al‑Mujadila", total = 20, done = done, completed = completed, streak = 12,
  )

  // New York, ISNA, Mon 9 and Tue 10 Nov 2026 (lib/prayer/times).
  private val nov9 = PrayerDay("2026-11-09", mapOf(
    PrayerName.FAJR to at(2026, 11, 9, 5, 18), PrayerName.SUNRISE to at(2026, 11, 9, 6, 36),
    PrayerName.DHUHR to at(2026, 11, 9, 11, 41), PrayerName.ASR to at(2026, 11, 9, 14, 21),
    PrayerName.MAGHRIB to at(2026, 11, 9, 16, 43), PrayerName.ISHA to at(2026, 11, 9, 18, 1),
  ))
  private val nov10 = PrayerDay("2026-11-10", mapOf(
    PrayerName.FAJR to at(2026, 11, 10, 5, 19), PrayerName.SUNRISE to at(2026, 11, 10, 6, 37),
    PrayerName.DHUHR to at(2026, 11, 10, 11, 41), PrayerName.ASR to at(2026, 11, 10, 14, 20),
    PrayerName.MAGHRIB to at(2026, 11, 10, 16, 42), PrayerName.ISHA to at(2026, 11, 10, 18, 0),
  ))
  private val prayer = PrayerInfo("New York", listOf(nov9, nov10))

  private fun snapshot(days: List<WidgetDay>, state: String = "ready") =
    Snapshot(state, ColorPair.INDIGO, days, null, prayer)

  @Test fun `today shows the day whose span holds now, then the next at its boundary`() {
    val fajr9 = at(2026, 11, 9, 5, 18)
    val fajr10 = at(2026, 11, 10, 5, 19)
    val fajr11 = at(2026, 11, 11, 5, 20)
    val s = snapshot(listOf(day("2026-11-09", fajr9 - 1000, fajr10, done = 6), day("2026-11-10", fajr10, fajr11)))
    val noon = at(2026, 11, 9, 13, 8)
    val ready = Timeline.today(s, noon) as TodayState.Ready
    assertEquals("2026-11-09", ready.day.day)
    assertEquals("2026-11-10", ready.next?.day)
    assertEquals(14, ready.day.left)
    assertEquals(fajr10, Timeline.todayBoundary(s, noon))
    assertEquals("2026-11-10", (Timeline.today(s, fajr10) as TodayState.Ready).day.day)
    assertTrue(Timeline.today(s, fajr11) is TodayState.Stale)
    assertNull(Timeline.todayBoundary(s, fajr11))
  }

  @Test fun `signed out, no plan or no snapshot asks to open Revisely`() {
    assertTrue(Timeline.today(null, 0) is TodayState.SetUp)
    assertTrue(Timeline.today(snapshot(emptyList(), "signedOut"), 0) is TodayState.SetUp)
    assertTrue(Timeline.today(snapshot(emptyList(), "noPlan"), 0) is TodayState.SetUp)
    assertEquals("Open Revisely to set up your plan.", Copy.setUp(TodayState.SetUp))
    assertEquals("Open Revisely to see today's revision.", Copy.setUp(TodayState.Stale))
  }

  @Test fun `the words match the iOS widget`() {
    val d = day("2026-11-09", 0, 1, done = 6)
    assertEquals("14 left · 6 done", Copy.smallStatus(d))
    assertEquals("6 of 20 done", Copy.mediumStatus(d, null))
    assertEquals("Continue", Copy.action(d))
    assertEquals("revisely://today", Copy.todayLink(TodayState.Ready(d, null)))
    val fresh = day("2026-11-09", 0, 1)
    assertEquals("20 pages left", Copy.smallStatus(fresh))
    assertEquals("20 pages left · Juz 28", Copy.wideLine(fresh))
    assertEquals("Start", Copy.action(fresh))
    val done = day("2026-11-09", 0, 1, done = 20, completed = true)
    assertEquals("20 pages revised", Copy.smallStatus(done))
    assertEquals("Tomorrow · Al‑Mujadila to At‑Tahrim", Copy.mediumStatus(done, fresh))
    assertEquals("20 pages revised · 12-day streak", Copy.wideLine(done))
    assertEquals("Done for today", Copy.tinyTitle(done))
    assertEquals("12-day streak", Copy.tinyLine(done))
    assertNull(Copy.action(done))
    assertEquals("revisely://home", Copy.todayLink(TodayState.Ready(done, null)))
    assertEquals("1 page", Copy.pages(1))
  }

  @Test fun `the next prayer, the one whose time it is, and the countdown's end`() {
    val m = Timeline.prayer(prayer, at(2026, 11, 9, 13, 8, 55), ny)!!
    assertEquals(PrayerName.ASR, m.next)
    assertEquals(at(2026, 11, 9, 14, 21), m.nextAt)
    assertEquals(at(2026, 11, 9, 11, 41), m.previous)
    assertEquals(PrayerName.DHUHR, m.current)
    assertEquals(6, m.today.size)
    assertEquals("New York", m.place)
    // Between sunrise and Dhuhr no prayer's time is current; sunrise is never the next prayer.
    val morning = Timeline.prayer(prayer, at(2026, 11, 9, 7, 0), ny)!!
    assertNull(morning.current)
    assertEquals(PrayerName.DHUHR, morning.next)
    // After Isha: tomorrow's Fajr, today's list still.
    val night = Timeline.prayer(prayer, at(2026, 11, 9, 22, 0), ny)!!
    assertEquals(PrayerName.FAJR, night.next)
    assertEquals(at(2026, 11, 10, 5, 19), night.nextAt)
    assertEquals(PrayerName.ISHA, night.current)
    assertEquals(nov9.time(PrayerName.ISHA), night.today.last().at)
    // At the prayer's time it moves on.
    assertEquals(PrayerName.MAGHRIB, Timeline.prayer(prayer, at(2026, 11, 9, 14, 21), ny)!!.next)
    // Past the last day written: nothing.
    assertNull(Timeline.prayer(prayer, at(2026, 11, 10, 18, 1), ny))
  }

  @Test fun `prayer times change at each of the six times and at midnight`() {
    assertEquals(at(2026, 11, 9, 14, 21), Timeline.prayerBoundary(prayer, at(2026, 11, 9, 13, 8), ny))
    assertEquals(at(2026, 11, 9, 6, 36), Timeline.prayerBoundary(prayer, at(2026, 11, 9, 6, 0), ny))
    assertEquals(at(2026, 11, 10, 0, 0), Timeline.prayerBoundary(prayer, at(2026, 11, 9, 20, 0), ny))
    assertNull(Timeline.prayerBoundary(prayer, at(2026, 11, 10, 18, 30), ny))
    assertNull(Timeline.prayerBoundary(null, 0, ny))
  }

  @Test fun `a high-latitude day without Isha skips it`() {
    val noIsha = PrayerInfo(null, listOf(nov9.copy(times = nov9.times + (PrayerName.ISHA to null)), nov10))
    val m = Timeline.prayer(noIsha, at(2026, 11, 9, 17, 0), ny)!!
    assertEquals(PrayerName.FAJR, m.next)
    assertNull(m.today.last().at)
  }

  @Test fun `the verse of the day steps through the list as on iOS`() {
    // 44 verses: stride 17. 1 Jan 2026 is the first, the next day the 18th.
    assertEquals(0, Timeline.verseIndex(at(2026, 1, 1, 12, 0), ny, 44))
    assertEquals(17, Timeline.verseIndex(at(2026, 1, 2, 0, 0), ny, 44))
    assertEquals(17, Timeline.verseIndex(at(2026, 1, 2, 23, 59), ny, 44))
    assertEquals((312L * 17 % 44).toInt(), Timeline.verseIndex(at(2026, 11, 9, 9, 0), ny, 44))
    // Before the epoch it still lands in the list.
    assertEquals(44 - 17, Timeline.verseIndex(at(2025, 12, 31, 12, 0), ny, 44))
    // A list whose length shares a factor with 17 takes the next stride (34: 19).
    assertEquals(19, Timeline.verseIndex(at(2026, 1, 2, 12, 0), ny, 34))
    assertEquals(-1, Timeline.verseIndex(0, ny, 0))
  }

  @Test fun `midnight and days follow the phone's zone, across a clock change`() {
    // US clocks went back on 1 Nov 2026.
    assertEquals(at(2026, 11, 2, 0, 0), Timeline.nextMidnight(at(2026, 11, 1, 12, 0), ny))
    assertEquals(at(2026, 11, 1, 0, 0) + 25 * 3_600_000L, Timeline.nextMidnight(at(2026, 11, 1, 0, 30), ny))
    assertEquals("2026-11-09", Timeline.localDay(at(2026, 11, 9, 23, 59), ny))
    assertEquals(at(2026, 11, 9, 0, 0), Timeline.dayStart("2026-11-09", ny))
    assertNull(Timeline.dayStart("nope", ny))
  }

  @Test fun `parses the app's snapshot, older snapshots and junk`() {
    val json = """
      {"v":1,"state":"ready","accent":"crimson",
       "colors":{"light":{"accentText":"#DC1433","done":"#DC1433","onDone":"#FFFFFF","primary":"#DC1433","onPrimary":"#FFFFFF","accentSubtle":"#FCE8EB","subtleText":"#B30F28"},
                 "dark":{"accentText":"#F03C56","done":"#DC1433","onDone":"#FFFFFF","primary":"#DC1433","onPrimary":"#FFFFFF"}},
       "days":[{"day":"2026-11-09","startsAt":1,"endsAt":2,"title":"Al‑Mujadila to At‑Tahrim","where":"Juz 28","short":"Al‑Mujadila","total":20,"done":6,"completed":false,"streak":12}],
       "qibla":{"bearing":58,"label":"58° NE","distance":"10,307 km","place":null},
       "prayer":{"place":"New York","days":[{"day":"2026-11-09","fajr":5,"sunrise":6,"dhuhr":7,"asr":8,"maghrib":9,"isha":null}]}}
    """.trimIndent()
    val s = Snapshot.parse(json)!!
    assertEquals("ready", s.state)
    assertEquals(argb("#DC1433"), s.colors.light.accentText)
    assertEquals(argb("#B30F28"), s.colors.light.subtleText)
    // A colour the snapshot doesn't have falls back to Indigo's.
    assertEquals(ColorPair.INDIGO.dark.accentSubtle, s.colors.dark.accentSubtle)
    assertEquals("Juz 28", s.days[0].place)
    assertEquals(14, s.days[0].left)
    assertEquals(QiblaInfo(58, "58° NE", "10,307 km", null), s.qibla)
    assertEquals("New York", s.prayer?.place)
    assertEquals(8L, s.prayer?.days?.get(0)?.time(PrayerName.ASR))
    assertNull(s.prayer?.days?.get(0)?.time(PrayerName.ISHA))

    assertNull(Snapshot.parse(null))
    assertNull(Snapshot.parse(""))
    assertNull(Snapshot.parse("{"))
    assertNull(Snapshot.parse("""{"v":2,"state":"ready"}"""))
    val bare = Snapshot.parse("""{"v":1,"state":"signedOut","days":[],"qibla":null}""")!!
    assertEquals(ColorPair.INDIGO, bare.colors)
    assertNull(bare.qibla)
    assertNull(bare.prayer)
  }
}
