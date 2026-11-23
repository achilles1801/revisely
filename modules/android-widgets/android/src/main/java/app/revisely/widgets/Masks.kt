package app.revisely.widgets

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextDirectionHeuristics
import android.text.TextPaint
import android.text.TextUtils
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * What RemoteViews can't draw: Amiri (a widget can't take a font) and the Qibla dial. Each is an
 * alpha mask the widget tints (Ink.tint), so one bitmap serves light and dark and stays small.
 */
internal object Masks {
  private val config = Bitmap.Config.ALPHA_8

  @Volatile private var amiri: Typeface? = null

  private fun amiri(context: Context): Typeface =
    amiri ?: Typeface.createFromAsset(context.assets, "widgets/Amiri-Regular.ttf").also { amiri = it }

  /**
   * The verse in Amiri, centred, right to left, `width`×`height` dp at most: `size` dp, made
   * smaller (to 55%, as minimumScaleFactor on iOS) until it fits in `maxLines`.
   */
  fun arabic(context: Context, text: String, width: Float, height: Float, size: Float, maxLines: Int): Bitmap {
    val d = context.resources.displayMetrics.density
    val w = max((width * d).roundToInt(), 1)
    val maxH = max(height * d, 1f)
    val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      typeface = amiri(context)
      color = Color.WHITE
    }
    var px = size
    var layout: StaticLayout
    while (true) {
      paint.textSize = px * d
      layout = StaticLayout.Builder.obtain(text, 0, text.length, paint, w)
        .setAlignment(Layout.Alignment.ALIGN_CENTER)
        .setTextDirection(TextDirectionHeuristics.RTL)
        .setIncludePad(true)
        .setLineSpacing(0f, 0.92f)
        .setMaxLines(maxLines)
        .setEllipsize(TextUtils.TruncateAt.END)
        .build()
      val last = layout.lineCount - 1
      val fits = layout.height <= maxH && layout.getEllipsisCount(last) == 0
      if (fits || px <= size * 0.55f) break
      px -= 0.5f
    }
    val h = max(minOf(layout.height, maxH.toInt()), 1)
    return Bitmap.createBitmap(w, h, config).also { layout.draw(Canvas(it)) }
  }

  /** The dial's four layers, from the bottom: ring, the Kaaba, the accent (needle, band), ink. */
  class Dial(val ring: Bitmap, val body: Bitmap, val accent: Bitmap, val ink: Bitmap)

  /**
   * A hairline dial, north up: N, the cardinal ticks, and the Kaaba at the bearing on a line from
   * the centre (QiblaDial on iOS). `hole` keeps the centre clear for a label. Without a bearing,
   * only the ring has anything on it.
   */
  fun dial(context: Context, sizeDp: Float, bearing: Int?, labelDp: Float, holeDp: Float): Dial {
    val d = context.resources.displayMetrics.density
    val px = max((sizeDp * d).roundToInt(), 1)
    fun layer() = Bitmap.createBitmap(px, px, config)
    val ring = layer()
    val body = layer()
    val accent = layer()
    val ink = layer()
    val size = px.toFloat()
    val r = size / 2
    val line = d * 1f

    fun point(radius: Float, degrees: Float): Pair<Float, Float> {
      val a = Math.toRadians(degrees.toDouble())
      return Pair(r + radius * sin(a).toFloat(), r - radius * cos(a).toFloat())
    }

    val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = line
      color = Color.WHITE
    }
    val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.FILL
      color = Color.WHITE
    }

    Canvas(ring).apply {
      stroke.alpha = (0.55f * 255).roundToInt()
      drawCircle(r, r, r - line / 2, stroke)
      for (a in listOf(90f, 180f, 270f)) {
        val (x1, y1) = point(r - line, a)
        val (x2, y2) = point(r - size * 0.09f, a)
        drawLine(x1, y1, x2, y2, stroke)
      }
      val label = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        textSize = labelDp * d
        textAlign = Paint.Align.CENTER
        color = Color.WHITE
      }
      drawText("N", r, labelDp * d * 1.32f, label)
    }

    if (bearing != null) {
      val deg = bearing.toFloat()
      val m = size * 0.15f
      val (kx, ky) = point(r - m * 0.55f, deg)
      val cube = RectF(-m / 2, -m / 2, m / 2, m / 2)
      val corner = m * 0.12f

      Canvas(body).apply {
        save()
        translate(kx, ky)
        rotate(deg)
        drawRoundRect(cube, corner, corner, fillPaint)
        restore()
      }

      Canvas(accent).apply {
        // The needle stops at the cube, which hides the rest of it anyway.
        stroke.alpha = 255
        val (sx, sy) = point(holeDp * d, deg)
        val (ex, ey) = point(r - m * 1.05f, deg)
        drawLine(sx, sy, ex, ey, stroke)
        save()
        translate(kx, ky)
        rotate(deg)
        val top = -m / 2 + m * 0.24f
        drawRect(-m / 2, top, m / 2, top + max(line, m * 0.16f), fillPaint)
        restore()
      }

      Canvas(ink).apply {
        val edge = Paint(stroke).apply {
          strokeWidth = line * 0.5f
          alpha = (0.35f * 255).roundToInt()
        }
        save()
        translate(kx, ky)
        rotate(deg)
        val inset = line * 0.25f
        drawRoundRect(RectF(cube.left + inset, cube.top + inset, cube.right - inset, cube.bottom - inset), corner, corner, edge)
        restore()
        if (holeDp <= 0f) drawCircle(r, r, d * 1.5f, fillPaint)
      }
    }
    return Dial(ring, body, accent, ink)
  }
}
