package expo.modules.liquidglass

import android.content.Context
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * Android has no Liquid Glass API. This view stays transparent so the JS
 * fallback can paint a Bambu card behind the same children.
 */
class LiquidGlassView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  init {
    setBackgroundColor(android.graphics.Color.TRANSPARENT)
  }
}
