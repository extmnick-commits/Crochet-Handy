import Svg, { Path } from 'react-native-svg';

/** Heart used on feed cards and the pattern detail action bar. */
export function HeartIcon({
  color,
  size = 14,
  filled = false,
}: {
  color: string;
  size?: number;
  filled?: boolean;
}) {
  const path =
    'M12 19.4 C7.2 16.2 4 13.4 4 9.8 C4 7.2 6 5.2 8.5 5.2 C10 5.2 11.2 5.9 12 7 C12.8 5.9 14 5.2 15.5 5.2 C18 5.2 20 7.2 20 9.8 C20 13.4 16.8 16.2 12 19.4 Z';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={path} fill={filled ? color : 'none'} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  );
}
