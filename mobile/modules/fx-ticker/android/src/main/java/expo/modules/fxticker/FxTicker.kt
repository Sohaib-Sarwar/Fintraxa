package expo.modules.fxticker

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.math.BigDecimal
import java.math.RoundingMode
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Calendar
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * The live "Earned today" number of Fintraxa's home-screen widget (owner, 2026-11-28: "I want to see the live number
 * flipping, constantly, offline, without hurting the battery, like a clock").
 *
 * Android never lets an app redraw a widget every second. So the widget layout (plugins/withWidgetTicker.js) holds a
 * ViewFlipper with FRAMES text views that flips once a second; here they are filled with the value for each of the
 * next FRAMES seconds (rate x seconds since local midnight, from the clock, no network) and the launcher plays them
 * by itself. A non-wake-up alarm re-syncs about once a minute: it only runs while the phone is awake, and an overdue
 * one fires as soon as the screen turns on, so a sleeping phone costs nothing.
 */
object FxTicker {
  const val FRAMES = 180
  private const val PREFS = "fx.widget.ticker"
  private const val TICK_MS = 60_000L
  private const val REQUEST = 7301
  const val ACTION = "expo.modules.fxticker.TICK"
  private val main = Handler(Looper.getMainLooper())
  private var frameIds: IntArray? = null

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** After the widget's picture is drawn: remember this widget's ticker settings and show it. */
  fun configure(ctx: Context, widgetId: Int, json: String) {
    prefs(ctx).edit().putString("w$widgetId", json).apply()
    // react-native-android-widget replaces the whole widget when it draws; this partial update must land after it.
    main.postDelayed({
      safeRender(ctx, widgetId)
      schedule(ctx)
    }, 700)
  }

  fun remove(ctx: Context, widgetId: Int) {
    prefs(ctx).edit().remove("w$widgetId").apply()
  }

  /** Re-sync every ticking widget; keeps the alarm only while at least one exists. */
  fun renderAll(ctx: Context) {
    val manager = AppWidgetManager.getInstance(ctx)
    var any = false
    for (key in prefs(ctx).all.keys.toList()) {
      if (!key.startsWith("w")) continue
      val id = key.substring(1).toIntOrNull() ?: continue
      if (manager.getAppWidgetInfo(id) == null) {
        remove(ctx, id)
        continue
      }
      any = true
      safeRender(ctx, id)
    }
    if (any) schedule(ctx)
  }

  private fun safeRender(ctx: Context, widgetId: Int) {
    try {
      render(ctx, widgetId)
    } catch (e: Exception) {
      e.printStackTrace()
    }
  }

  private fun ids(ctx: Context): IntArray {
    frameIds?.let { return it }
    val res = ctx.resources
    val out = IntArray(FRAMES) { i -> res.getIdentifier("fx_t$i", "id", ctx.packageName) }
    frameIds = out
    return out
  }

  private fun render(ctx: Context, widgetId: Int) {
    val json = prefs(ctx).getString("w$widgetId", null) ?: return
    val c = JSONObject(json)
    val pkg = ctx.packageName
    val res = ctx.resources
    val layout = res.getIdentifier("rn_widget", "layout", pkg)
    val wrap = res.getIdentifier("fx_ticker_wrap", "id", pkg)
    val flipper = res.getIdentifier("fx_ticker", "id", pkg)
    if (layout == 0 || wrap == 0 || flipper == 0) return
    val views = RemoteViews(pkg, layout)
    if (!c.optBoolean("on", false)) {
      views.setViewVisibility(wrap, View.GONE)
      AppWidgetManager.getInstance(ctx).partiallyUpdateAppWidget(widgetId, views)
      return
    }
    val density = res.displayMetrics.density
    fun px(key: String): Int = (c.optDouble(key, 0.0) * density).roundToInt()
    views.setViewPadding(wrap, px("left"), px("top"), px("right"), px("bottom"))
    val rate = c.optDouble("perSecond", 0.0)
    val perSecond = if (rate.isNaN() || rate < 0) 0.0 else rate
    val hide = c.optBoolean("hide", false)
    val ink = Color.parseColor(c.optString("ink", "#F5F5F3"))
    val now = System.currentTimeMillis()
    val start = now - now % 1000
    val all = ids(ctx)
    for (i in all.indices) {
      val id = all[i]
      if (id == 0) continue
      views.setTextViewText(id, frame(perSecond, start + i * 1000L, hide))
      views.setTextColor(id, ink)
    }
    views.setDisplayedChild(flipper, 0)
    views.setViewVisibility(wrap, View.VISIBLE)
    AppWidgetManager.getInstance(ctx).partiallyUpdateAppWidget(widgetId, views)
  }

  private val pkrInk = 0xB3F5F5F3L.toInt()

  /** "1,234.56 PKR" for the moment t; PKR small and right after the figure. */
  private fun frame(perSecond: Double, t: Long, hide: Boolean): CharSequence {
    val number = if (hide) "••••••" else format(perSecond * secondsSinceMidnight(t))
    val text = SpannableStringBuilder(number)
    val from = text.length
    text.append(" PKR")
    text.setSpan(RelativeSizeSpan(0.32f), from, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    text.setSpan(ForegroundColorSpan(pkrInk), from, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    return text
  }

  private fun secondsSinceMidnight(t: Long): Double {
    val day = Calendar.getInstance()
    day.timeInMillis = t
    day.set(Calendar.HOUR_OF_DAY, 0)
    day.set(Calendar.MINUTE, 0)
    day.set(Calendar.SECOND, 0)
    day.set(Calendar.MILLISECOND, 0)
    return (t - day.timeInMillis) / 1000.0
  }

  private val formats = HashMap<Int, DecimalFormat>()

  /** Same rule as the app (earnings.ts liveDecimals / rupees): 4 decimals under 10, 2 under 100,000, never rounded up. */
  fun format(v: Double): String {
    val a = abs(v)
    if (a >= 10_000_000) {
      val big = a >= 1e9
      val x = BigDecimal(v / (if (big) 1e9 else 1e6))
      val s = if (x.abs() >= BigDecimal(100)) x.setScale(0, RoundingMode.DOWN).toPlainString()
        else x.setScale(2, RoundingMode.DOWN).stripTrailingZeros().toPlainString()
      return s + (if (big) "B" else "M")
    }
    val decimals = if (a < 10) 4 else if (a < 100_000) 2 else 0
    val f = formats.getOrPut(decimals) {
      val pattern = if (decimals == 0) "#,##0" else "#,##0." + "0".repeat(decimals)
      DecimalFormat(pattern, DecimalFormatSymbols(Locale.US)).apply { roundingMode = RoundingMode.DOWN }
    }
    return f.format(BigDecimal(v))
  }

  private fun pending(ctx: Context): PendingIntent = PendingIntent.getBroadcast(
    ctx,
    REQUEST,
    Intent(ctx, FxTickReceiver::class.java).setAction(ACTION),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
  )

  /** Next re-sync in about a minute. RTC (not RTC_WAKEUP): never wakes a sleeping phone. */
  fun schedule(ctx: Context) {
    val alarms = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    alarms.set(AlarmManager.RTC, System.currentTimeMillis() + TICK_MS, pending(ctx))
  }
}
