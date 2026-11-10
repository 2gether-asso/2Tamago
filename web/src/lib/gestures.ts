import type { TrickId } from '@2tamago/core';

export interface Point {
  x: number;
  y: number;
}

/** What to draw for each trick, as the arrow shown in the legend. */
export const GESTURES: Record<TrickId, string> = {
  sit: '↓',
  spin: '○',
  jump: '↑',
  highfive: '→',
};

/** A stroke shorter than this (in pixels) is a tap or a slip, not a command. */
const MIN_LENGTH = 60;
/** Straight enough: the way from start to end over the way travelled. */
const MIN_STRAIGHTNESS = 0.7;
/** A line is vertical (or horizontal) when it goes at least this much further that way. */
const AXIS_RATIO = 2;
/** A circle comes back near where it started: the way from start to end over the way travelled. */
const MAX_CLOSED = 0.4;
/** How much of a turn makes a circle, in radians (a bit less than a full one). */
const MIN_TURN = 1.6 * Math.PI;
/** A circle is about as wide as it is tall. */
const MIN_ROUNDNESS = 0.5;

/**
 * The trick a drawn stroke stands for: down to sit, up to jump, right for a high-five, a circle to
 * spin. Anything else (a tap, a zigzag, a diagonal, a swipe left) is `null`. Screen coordinates:
 * `y` grows downwards.
 */
export function recognizeGesture(points: Point[]): TrickId | null {
  if (points.length < 5) return null;
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  if (length < MIN_LENGTH) return null;

  const start = points[0]!;
  const end = points.at(-1)!;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const straightness = Math.hypot(dx, dy) / length;

  if (straightness >= MIN_STRAIGHTNESS) {
    if (Math.abs(dy) >= AXIS_RATIO * Math.abs(dx)) return dy > 0 ? 'sit' : 'jump';
    if (Math.abs(dx) >= AXIS_RATIO * Math.abs(dy) && dx > 0) return 'highfive';
    return null;
  }
  return straightness <= MAX_CLOSED && isCircle(points) ? 'spin' : null;
}

/** Round, and turning all the way round its own centre, in either direction. */
function isCircle(points: Point[]): boolean {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  if (Math.min(width, height) / Math.max(width, height) < MIN_ROUNDNESS) return false;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  let turn = 0;
  let previous = Math.atan2(points[0]!.y - cy, points[0]!.x - cx);
  for (const point of points.slice(1)) {
    const angle = Math.atan2(point.y - cy, point.x - cx);
    let delta = angle - previous;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    turn += delta;
    previous = angle;
  }
  return Math.abs(turn) >= MIN_TURN;
}
