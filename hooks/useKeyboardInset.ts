import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/** Height of the on-screen keyboard (0 when hidden). */
export function useKeyboardInset(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    const onShow = (event: { endCoordinates?: { height?: number } }) => {
      setHeight(event.endCoordinates?.height ?? 0);
    };
    const onHide = () => setHeight(0);

    const showSub = Keyboard.addListener('keyboardDidShow', onShow);
    const hideSub = Keyboard.addListener('keyboardDidHide', onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}
