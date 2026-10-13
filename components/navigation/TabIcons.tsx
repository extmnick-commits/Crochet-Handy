/**
 * Bambu Handy–style tab icons, re-imagined for crochet.
 *
 * Inactive → 1.6pt outline in the tint color.
 * Active   → solid fill in the tint color with details punched out via SVG
 *            masks, so the cut-outs are truly transparent and look right on any
 *            surface (bottom bar, rail pill, sidebar row).
 */
import { useId } from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Defs, G, Mask, Path, Rect } from 'react-native-svg';

export type TabIconProps = {
  focused: boolean;
  color: ColorValue;
  size?: number;
};

const STROKE = 1.6;

/** SVG `url(#id)` references can't contain React's `:r0:` style characters. */
function useMaskId(prefix: string) {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

/* -------------------------------------------------------------------------- */
/*                     Patterns  (Bambu "Models" 2×2 grid)                    */
/* -------------------------------------------------------------------------- */

const TILES: readonly [number, number][] = [
  [3, 3],
  [13, 3],
  [3, 13],
  [13, 13],
];

/** A single crochet "V" stitch centred in an 8×8 tile. */
const stitchPath = (x: number, y: number) =>
  `M${x + 2.5} ${y + 3.1} L${x + 4} ${y + 5.1} L${x + 5.5} ${y + 3.1}`;

export function PatternsIcon({ focused, color, size = 26 }: TabIconProps) {
  const maskId = useMaskId('patterns');

  if (focused) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Defs>
          <Mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
            {TILES.map(([x, y]) => (
              <Rect key={`t${x}${y}`} x={x} y={y} width={8} height={8} rx={2.2} fill="#fff" />
            ))}
            {TILES.map(([x, y]) => (
              <Path
                key={`s${x}${y}`}
                d={stitchPath(x, y)}
                stroke="#000"
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}
          </Mask>
        </Defs>
        <Rect width={24} height={24} fill={color} mask={`url(#${maskId})`} />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {TILES.map(([x, y]) => (
        <G key={`${x}${y}`} stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
          <Rect x={x + 0.8} y={y + 0.8} width={6.4} height={6.4} rx={1.6} />
          <Path d={stitchPath(x, y)} />
        </G>
      ))}
    </Svg>
  );
}

/* -------------------------------------------------------------------------- */
/*            Active Project  (Bambu "Devices" printer frame + hook)          */
/* -------------------------------------------------------------------------- */

/** Gantry → carriage → crochet hook hanging where the nozzle would be. */
const GANTRY = 'M3.8 8.6 H20.2';
const HOOK = 'M12 10.6 V14.4 A1.9 1.9 0 0 1 8.2 14.4 V13.6';

export function ProjectIcon({ focused, color, size = 26 }: TabIconProps) {
  const maskId = useMaskId('project');

  if (focused) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Defs>
          <Mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
            <Rect x={3} y={3} width={18} height={18} rx={3.6} fill="#fff" />
            <G stroke="#000" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none">
              <Path d={GANTRY} />
              <Path d={HOOK} />
            </G>
            <Rect x={9.6} y={7.4} width={4.8} height={3.2} rx={0.9} fill="#000" />
          </Mask>
        </Defs>
        <Rect width={24} height={24} fill={color} mask={`url(#${maskId})`} />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
        <Rect x={3.8} y={3.8} width={16.4} height={16.4} rx={3.2} />
        <Path d={GANTRY} />
        <Path d={HOOK} />
      </G>
      <Rect x={9.6} y={7.4} width={4.8} height={3.2} rx={0.9} fill={color} />
    </Svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                    Me  (profile silhouette + yarn-stash ball)              */
/* -------------------------------------------------------------------------- */

const BALL = { cx: 18.4, cy: 18.2, r: 3.6 };
/** Clearance ring between the shoulders and the yarn ball. */
const BALL_GAP_R = BALL.r + 1.7;
/** Wraps of yarn across the ball. */
const YARN_WRAPS = ['M15.4 16.9 C16.9 16.1 19.5 16.2 21.6 17.6', 'M15.2 19.2 C17 18.4 19.6 18.7 21.3 20.1'];

export function MeIcon({ focused, color, size = 26 }: TabIconProps) {
  const maskId = useMaskId('me');

  if (focused) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Defs>
          <Mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
            <Circle cx={10.5} cy={7.4} r={4.1} fill="#fff" />
            <Path d="M2.8 20.6 C2.8 16.1 6.3 13 10.5 13 C14.7 13 18.2 16.1 18.2 20.6 Z" fill="#fff" />
            <Circle cx={BALL.cx} cy={BALL.cy} r={BALL_GAP_R} fill="#000" />
            <Circle cx={BALL.cx} cy={BALL.cy} r={BALL.r} fill="#fff" />
            {YARN_WRAPS.map((d) => (
              <Path key={d} d={d} stroke="#000" strokeWidth={1.2} strokeLinecap="round" fill="none" />
            ))}
          </Mask>
        </Defs>
        <Rect width={24} height={24} fill={color} mask={`url(#${maskId})`} />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Defs>
        <Mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <Rect width={24} height={24} fill="#fff" />
          <Circle cx={BALL.cx} cy={BALL.cy} r={BALL_GAP_R} fill="#000" />
        </Mask>
      </Defs>
      <G stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" mask={`url(#${maskId})`}>
        <Circle cx={10.5} cy={7.4} r={3.6} />
        <Path d="M3.6 20.2 C3.6 16.4 6.6 13.7 10.5 13.7 C14.4 13.7 17.4 16.4 17.4 20.2" />
      </G>
      <G stroke={color} strokeLinecap="round">
        <Circle cx={BALL.cx} cy={BALL.cy} r={BALL.r - 0.8} strokeWidth={STROKE} />
        {YARN_WRAPS.map((d) => (
          <Path key={d} d={d} strokeWidth={1.2} />
        ))}
      </G>
    </Svg>
  );
}
