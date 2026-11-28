package expo.modules.fxticker

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** JS side: src/features/widget/ticker.ts. */
class FxTickerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FxTicker")

    Function("frames") {
      FxTicker.FRAMES
    }

    Function("configure") { widgetId: Int, json: String ->
      val ctx = appContext.reactContext?.applicationContext
      if (ctx != null) FxTicker.configure(ctx, widgetId, json)
      ctx != null
    }

    Function("remove") { widgetId: Int ->
      val ctx = appContext.reactContext?.applicationContext
      if (ctx != null) FxTicker.remove(ctx, widgetId)
      ctx != null
    }

    Function("format") { value: Double ->
      FxTicker.format(value)
    }
  }
}
