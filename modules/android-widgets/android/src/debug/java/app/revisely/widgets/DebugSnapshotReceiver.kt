package app.revisely.widgets

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Base64

/**
 * Debug builds only: hands the widgets a snapshot from adb, to check them without signing in.
 *
 *   adb shell am broadcast -n com.revisionbuddy.app/app.revisely.widgets.DebugSnapshotReceiver \
 *     -a app.revisely.widgets.DEBUG_SNAPSHOT --es b64 "$(base64 < snapshot.json)"
 *
 * Without `b64` it only redraws.
 */
class DebugSnapshotReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    intent.getStringExtra("b64")?.let {
      SnapshotStore.set(context, SnapshotStore.KEY, String(Base64.decode(it, Base64.DEFAULT), Charsets.UTF_8))
    }
    Widgets.refresh(this, context)
  }
}
