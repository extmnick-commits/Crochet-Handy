import ExpoModulesCore
import SwiftUI
import UIKit

/// Props pushed from React Native. Observable so the hosted SwiftUI tree refreshes in place.
final class LiquidGlassProps: ObservableObject {
  @Published var cornerRadius: Double = 16
  @Published var blurStyle: String = "regular"
  @Published var isInteractive: Bool = false
}

/// iOS 26 Liquid Glass. Older systems get a system material of the same blur style.
struct LiquidGlassSurface: View {
  @ObservedObject var props: LiquidGlassProps

  var body: some View {
    Group {
      if #available(iOS 26.0, *) {
        IOS26LiquidGlass(
          cornerRadius: props.cornerRadius,
          blurStyle: props.blurStyle,
          isInteractive: props.isInteractive
        )
      } else {
        RoundedRectangle(cornerRadius: props.cornerRadius, style: .continuous)
          .fill(fallbackMaterial)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .ignoresSafeArea()
  }

  private var fallbackMaterial: Material {
    switch props.blurStyle {
    case "ultraThin":
      return .ultraThinMaterial
    case "thin":
      return .thinMaterial
    case "prominent":
      return .thickMaterial
    default:
      return .regularMaterial
    }
  }
}

/// SwiftUI Liquid Glass. `thin` and `ultraThin` map to `.clear`; `regular` and `prominent` map to `.regular`.
@available(iOS 26.0, *)
private struct IOS26LiquidGlass: View {
  let cornerRadius: Double
  let blurStyle: String
  let isInteractive: Bool

  var body: some View {
    let radius = CGFloat(cornerRadius)
    glassFill(radius: radius)
  }

  @ViewBuilder
  private func glassFill(radius: CGFloat) -> some View {
    if isInteractive && blurStyle == "regular" {
      Color.clear
        .glassEffect(.regular.interactive(), in: .rect(cornerRadius: radius))
    } else if isInteractive && usesClearGlass {
      Color.clear
        .glassEffect(.clear.interactive(), in: .rect(cornerRadius: radius))
    } else if usesClearGlass {
      Color.clear
        .glassEffect(.clear, in: .rect(cornerRadius: radius))
    } else if isInteractive {
      Color.clear
        .glassEffect(.regular.interactive(), in: .rect(cornerRadius: radius))
    } else {
      Color.clear
        .glassEffect(.regular, in: .rect(cornerRadius: radius))
    }
  }

  /// Clear glass reads lighter, which matches thin and ultra-thin materials.
  private var usesClearGlass: Bool {
    blurStyle == "thin" || blurStyle == "ultraThin"
  }
}

/// Hosts the SwiftUI glass surface inside an Expo view so React Native children draw above it.
public final class LiquidGlassView: ExpoView {
  private let props: LiquidGlassProps
  private let hostingController: UIHostingController<LiquidGlassSurface>

  public required init(appContext: AppContext? = nil) {
    let props = LiquidGlassProps()
    self.props = props
    let controller = UIHostingController(rootView: LiquidGlassSurface(props: props))
    controller.view.backgroundColor = .clear
    controller.view.isOpaque = false
    controller.safeAreaRegions = []
    hostingController = controller

    super.init(appContext: appContext)

    clipsToBounds = true
    backgroundColor = .clear
    isOpaque = false
    controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(controller.view)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    hostingController.view.frame = bounds
    sendSubviewToBack(hostingController.view)
  }

  func setCornerRadius(_ radius: Double) {
    props.cornerRadius = radius
    layer.cornerRadius = CGFloat(radius)
  }

  func setBlurStyle(_ style: String) {
    props.blurStyle = style
  }

  func setInteractive(_ interactive: Bool) {
    props.isInteractive = interactive
  }
}
