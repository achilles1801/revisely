package app.revisely.widgets

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The app's side of the widgets (src/lib/widgets/storage.ts): it keeps the snapshot, as the iOS
 * app does in the App Group, and asks for a redraw. The widgets read it themselves.
 */
class AndroidWidgetsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AndroidWidgets")

    Function("set") { key: String, value: String ->
      SnapshotStore.set(context, key, value)
    }

    Function("reload") {
      Widgets.reloadAsync(context)
    }
  }

  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
}
