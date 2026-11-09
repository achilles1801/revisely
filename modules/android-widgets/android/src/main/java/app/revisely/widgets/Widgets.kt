package app.revisely.widgets

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.util.SizeF
import android.widget.RemoteViews
import java.util.TimeZone
import java.util.concurrent.Executors

/** Where the app's snapshot is kept (WIDGET_SNAPSHOT_KEY in src/lib/widgets/snapshot.ts). */
internal object SnapshotStore {
  const val KEY = "widget.snapshot"
  private const val PREFS = "revisely.widgets"

  private fun prefs(context: Context) = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun set(context: Context, key: String, value: String) = prefs(context).edit().putString(key, value).apply()

  fun load(context: Context): Snapshot? = Snapshot.parse(prefs(context).getString(KEY, null))
}

/**
 * Draws every Revisely widget from the snapshot and sets the alarm for the next time one of them
 * changes (a revision day's end, a prayer, midnight). Everything runs on one background thread.
 */
internal object Widgets {
  private const val TAG = "ReviselyWidgets"
  const val ACTION_TICK = "app.revisely.widgets.TICK"

  /** Before the launcher has said how big a widget is: the 2×2 layouts. */
  private val DEFAULT_SIZE = SizeF(170f, 180f)

  private val executor = Executors.newSingleThreadExecutor()

  private val providers = mapOf(
    Kind.TODAY to TodayWidget::class.java,
    Kind.VERSE to VerseWidget::class.java,
    Kind.QIBLA to QiblaWidget::class.java,
    Kind.PRAYER to PrayerWidget::class.java,
  )

  /** From the app: redraw everything off the JS thread. */
  fun reloadAsync(context: Context) {
    val app = context.applicationContext
    executor.execute { safely { updateAll(app) } }
  }

  /** From a broadcast: redraw everything, keeping the receiver alive until it's done. */
  fun refresh(receiver: BroadcastReceiver, context: Context) {
    val app = context.applicationContext
    val pending = receiver.goAsync()
    executor.execute {
      try {
        safely { updateAll(app) }
      } finally {
        pending.finish()
      }
    }
  }

  fun updateAll(context: Context) {
    val mgr = AppWidgetManager.getInstance(context) ?: return
    val snapshot = SnapshotStore.load(context)
    val now = System.currentTimeMillis()
    val render = Render(context, snapshot, now)
    val placed = mutableSetOf<Kind>()
    for ((kind, provider) in providers) {
      val ids = mgr.getAppWidgetIds(ComponentName(context, provider))
      if (ids.isNotEmpty()) placed += kind
      for (id in ids) {
        safely { mgr.updateAppWidget(id, views(render, kind, sizes(mgr.getAppWidgetOptions(id)))) }
      }
    }
    schedule(context, snapshot, now, placed)
  }

  /**
   * One layout per size the launcher shows the widget at (portrait, landscape): from Android 12
   * it switches between them itself.
   */
  private fun views(render: Render, kind: Kind, sizes: List<SizeF>): RemoteViews {
    val distinct = sizes.distinct()
    if (Build.VERSION.SDK_INT >= 31 && distinct.size > 1) {
      return RemoteViews(distinct.take(16).associateWith { render.views(kind, it) })
    }
    return render.views(kind, distinct.firstOrNull() ?: DEFAULT_SIZE)
  }

  @Suppress("DEPRECATION")
  private fun sizes(options: Bundle?): List<SizeF> {
    if (options == null) return listOf(DEFAULT_SIZE)
    if (Build.VERSION.SDK_INT >= 31) {
      val list = options.getParcelableArrayList<SizeF>(AppWidgetManager.OPTION_APPWIDGET_SIZES)
      if (!list.isNullOrEmpty()) return list
    }
    val minW = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)
    val maxH = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)
    // Portrait: the narrower width and the taller height.
    return if (minW > 0 && maxH > 0) listOf(SizeF(minW.toFloat(), maxH.toFloat())) else listOf(DEFAULT_SIZE)
  }

  /**
   * The alarm for the next change of a placed widget. Exact where Android allows it (always
   * before 12; from 12 with "Alarms & reminders"), else within 10 minutes. Not a wake-up alarm: a
   * phone asleep shows nothing, and the alarm fires as soon as it wakes.
   */
  private fun schedule(context: Context, snapshot: Snapshot?, now: Long, placed: Set<Kind>) {
    val zone = TimeZone.getDefault()
    val next = listOfNotNull(
      if (Kind.TODAY in placed) Timeline.todayBoundary(snapshot, now) else null,
      if (Kind.PRAYER in placed) Timeline.prayerBoundary(snapshot?.prayer, now, zone) else null,
      if (Kind.VERSE in placed) Timeline.nextMidnight(now, zone) else null,
    ).filter { it > now }.minOrNull()
    val alarms = context.getSystemService(AlarmManager::class.java) ?: return
    val tick = PendingIntent.getBroadcast(
      context,
      0,
      Intent(context, WidgetTicker::class.java).setAction(ACTION_TICK),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    if (next == null) {
      alarms.cancel(tick)
      return
    }
    val exact = Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()
    try {
      if (exact) alarms.setExact(AlarmManager.RTC, next, tick) else alarms.setWindow(AlarmManager.RTC, next, 10 * 60_000L, tick)
    } catch (e: SecurityException) {
      alarms.setWindow(AlarmManager.RTC, next, 10 * 60_000L, tick)
    }
  }

  private inline fun safely(block: () -> Unit) {
    try {
      block()
    } catch (e: Exception) {
      Log.w(TAG, "Widget update failed", e)
    }
  }
}

/** The four widgets: each event redraws them all and sets the next alarm. */
abstract class ReviselyWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = Widgets.refresh(this, context)

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) =
    Widgets.refresh(this, context)

  override fun onDeleted(context: Context, ids: IntArray) = Widgets.refresh(this, context)
}

class TodayWidget : ReviselyWidget()

class VerseWidget : ReviselyWidget()

class QiblaWidget : ReviselyWidget()

class PrayerWidget : ReviselyWidget()

/** The next boundary's alarm, and what moves the clock (boot, time, time zone, 12/24-hour, locale). */
class WidgetTicker : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action in ACTIONS) Widgets.refresh(this, context)
  }

  private companion object {
    val ACTIONS = setOf(
      Widgets.ACTION_TICK,
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED,
      Intent.ACTION_LOCALE_CHANGED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED",
    )
  }
}
