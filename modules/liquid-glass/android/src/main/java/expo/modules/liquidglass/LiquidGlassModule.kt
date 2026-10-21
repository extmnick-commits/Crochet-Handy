package expo.modules.liquidglass

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LiquidGlassModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LiquidGlass")

    View(LiquidGlassView::class) {
      Prop("cornerRadius") { _: LiquidGlassView, _: Double -> }
      Prop("blurStyle") { _: LiquidGlassView, _: String -> }
      Prop("isInteractive") { _: LiquidGlassView, _: Boolean -> }
    }
  }
}
