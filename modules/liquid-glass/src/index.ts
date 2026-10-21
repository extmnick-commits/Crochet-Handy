import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { createElement, type ComponentType } from 'react';
import { Platform, View, type ViewProps } from 'react-native';

export type LiquidGlassBlurStyle = 'regular' | 'thin' | 'ultraThin' | 'prominent';

export type LiquidGlassViewProps = ViewProps & {
  cornerRadius?: number;
  blurStyle?: LiquidGlassBlurStyle;
  isInteractive?: boolean;
};

const NATIVE_MODULE_NAME = 'LiquidGlass';

function iosMajorVersion(): number {
  if (Platform.OS !== 'ios') return 0;
  const version = Platform.Version;
  const major = typeof version === 'string' ? Number.parseInt(version, 10) : Math.floor(Number(version));
  return Number.isFinite(major) ? major : 0;
}

/**
 * True when this binary includes the native module and the device is iOS 26 or newer.
 * Reduced transparency is a separate accessibility choice; callers should check that themselves.
 */
export function isLiquidGlassSupported(): boolean {
  if (iosMajorVersion() < 26) return false;
  try {
    return requireOptionalNativeModule(NATIVE_MODULE_NAME) != null;
  } catch {
    return false;
  }
}

let nativeView: ComponentType<LiquidGlassViewProps> | null | undefined;

function getNativeView(): ComponentType<LiquidGlassViewProps> | null {
  if (nativeView !== undefined) return nativeView;
  if (!isLiquidGlassSupported()) {
    nativeView = null;
    return null;
  }
  nativeView = requireNativeView<LiquidGlassViewProps>(NATIVE_MODULE_NAME);
  return nativeView;
}

export function LiquidGlassView({
  cornerRadius = 16,
  blurStyle = 'regular',
  isInteractive = false,
  style,
  ...rest
}: LiquidGlassViewProps) {
  const Native = getNativeView();
  if (!Native) {
    return createElement(View, { ...rest, style });
  }
  return createElement(Native, {
    ...rest,
    blurStyle,
    cornerRadius,
    isInteractive,
    style,
  });
}
