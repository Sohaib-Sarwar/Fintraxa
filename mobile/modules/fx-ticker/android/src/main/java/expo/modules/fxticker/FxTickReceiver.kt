package expo.modules.fxticker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** The minute re-sync (FxTicker.schedule): refill every widget's flipping number from the clock. Pure Kotlin, no JS. */
class FxTickReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    FxTicker.renderAll(context.applicationContext)
  }
}
