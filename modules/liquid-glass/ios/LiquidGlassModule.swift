import ExpoModulesCore

public class LiquidGlassModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiquidGlass")

    View(LiquidGlassView.self) {
      Prop("cornerRadius") { (view: LiquidGlassView, radius: Double) in
        view.setCornerRadius(radius)
      }

      Prop("blurStyle") { (view: LiquidGlassView, style: String) in
        view.setBlurStyle(style)
      }

      Prop("isInteractive") { (view: LiquidGlassView, interactive: Bool) in
        view.setInteractive(interactive)
      }
    }
  }
}
