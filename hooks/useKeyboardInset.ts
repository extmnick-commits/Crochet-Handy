import { useCallback, useEffect, useState, type RefObject } from 'react';
import { Dimensions, Keyboard, Platform, type View } from 'react-native';

export type KeyboardFrame = {
  /** Keyboard height in px (0 when hidden). */
  height: number;
  /** Top of the keyboard in window/screen coordinates. */
  screenY: number;
  /** iOS animation duration in ms; 0 on Android. */
  duration: number;
};

const HIDDEN: KeyboardFrame = { height: 0, screenY: 0, duration: 250 };

type KeyboardCoordsEvent = {
  duration?: number;
  endCoordinates?: { height?: number; screenY?: number };
};

function readFrame(event?: KeyboardCoordsEvent, fallbackDuration = 250): KeyboardFrame {
  const height = Math.max(0, event?.endCoordinates?.height ?? 0);
  if (height <= 0) return { ...HIDDEN, duration: event?.duration ?? fallbackDuration };
  return {
    height,
    screenY: event?.endCoordinates?.screenY ?? 0,
    duration: event?.duration ?? fallbackDuration,
  };
}

/**
 * Live keyboard frame. iOS uses will-show/will-hide so layout can track the
 * keyboard animation; Android only has did-show/did-hide.
 */
export function useKeyboardFrame(): KeyboardFrame {
  const [frame, setFrame] = useState<KeyboardFrame>(HIDDEN);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const fallbackDuration = Platform.OS === 'ios' ? 250 : 0;
    const applyFrame = (event: KeyboardCoordsEvent) => {
      const next = readFrame(event, fallbackDuration);
      const screenHeight = Dimensions.get('screen').height;
      if (next.height <= 0 || next.screenY >= screenHeight - 1) {
        setFrame({ ...HIDDEN, duration: next.duration });
        return;
      }
      setFrame(next);
    };
    const onHide = (event: KeyboardCoordsEvent) => setFrame({ ...HIDDEN, duration: event?.duration ?? fallbackDuration });

    const showSub = Keyboard.addListener(showEvent, applyFrame);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    const changeSub = Platform.OS === 'ios'
      ? Keyboard.addListener('keyboardWillChangeFrame', applyFrame)
      : Keyboard.addListener('keyboardDidChangeFrame', applyFrame);

    return () => {
      showSub.remove();
      hideSub.remove();
      changeSub.remove();
    };
  }, []);

  return frame;
}

/** Height of the on-screen keyboard (0 when hidden). */
export function useKeyboardInset(): number {
  return useKeyboardFrame().height;
}

/**
 * Extra bottom inset a full-screen overlay still needs so its children sit
 * above the keyboard. Returns 0 when the window already resized (Android
 * `adjustResize`) or a parent KeyboardAvoidingView already lifted the view.
 */
export function useKeyboardOverlap(
  targetRef: RefObject<View | null>,
  enabled: boolean,
  layoutKey = 0,
): {
  overlap: number;
  height: number;
  duration: number;
} {
  const frame = useKeyboardFrame();
  const [overlap, setOverlap] = useState(0);

  const measure = useCallback(() => {
    void layoutKey;
    if (!enabled || frame.height <= 0) {
      setOverlap(0);
      return;
    }
    const node = targetRef.current;
    if (!node || typeof node.measureInWindow !== 'function') {
      setOverlap(frame.height);
      return;
    }
    node.measureInWindow((_x, y, _w, h) => {
      if (!h) return;
      const keyboardTop = frame.screenY > 0 ? frame.screenY : y + h - frame.height;
      setOverlap(Math.max(0, Math.round(y + h - keyboardTop)));
    });
  }, [enabled, frame.height, frame.screenY, layoutKey, targetRef]);

  useEffect(() => {
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, [measure]);

  return { overlap, height: frame.height, duration: frame.duration };
}
