import { describe, expect, it } from 'vitest';
import { GESTURES, recognizeGesture, type Point } from './gestures.ts';

/** `count` points on the way from one point to another, with a slow drift of the hand. */
function line(from: Point, to: Point, count = 20, wobble = 0): Point[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const shake = Math.sin(i * 0.5) * wobble;
    return { x: from.x + (to.x - from.x) * t + shake, y: from.y + (to.y - from.y) * t - shake };
  });
}

/** Part of a circle, from `from` for `turn` radians (negative: the other way round). */
function arc(radius: number, turn: number, from = 0, count = 40): Point[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = from + (turn * i) / (count - 1);
    return { x: 100 + radius * Math.cos(angle), y: 100 + radius * Math.sin(angle) };
  });
}

describe('recognizeGesture', () => {
  it('reads a swipe down as sit, up as jump, right as a high-five', () => {
    expect(recognizeGesture(line({ x: 100, y: 20 }, { x: 105, y: 160 }))).toBe('sit');
    expect(recognizeGesture(line({ x: 100, y: 160 }, { x: 95, y: 20 }))).toBe('jump');
    expect(recognizeGesture(line({ x: 20, y: 100 }, { x: 170, y: 105 }))).toBe('highfive');
  });

  it('forgives a trembling hand', () => {
    expect(recognizeGesture(line({ x: 100, y: 20 }, { x: 100, y: 170 }, 60, 6))).toBe('sit');
    expect(recognizeGesture(line({ x: 20, y: 100 }, { x: 180, y: 100 }, 60, 6))).toBe('highfive');
  });

  it('reads a circle as a spin, either way round, closed or overshot', () => {
    expect(recognizeGesture(arc(50, 2 * Math.PI))).toBe('spin');
    expect(recognizeGesture(arc(50, -2 * Math.PI, Math.PI / 3))).toBe('spin');
    expect(recognizeGesture(arc(50, 2.4 * Math.PI, 1))).toBe('spin');
    // Not quite closed, as drawn by hand.
    expect(recognizeGesture(arc(50, 1.85 * Math.PI))).toBe('spin');
  });

  it('reads an oval circle, not a flat loop', () => {
    const oval = arc(50, 2 * Math.PI).map((p) => ({ x: 100 + (p.x - 100) * 1.4, y: p.y }));
    expect(recognizeGesture(oval)).toBe('spin');
    const flat = arc(50, 2 * Math.PI).map((p) => ({ x: p.x, y: 100 + (p.y - 100) * 0.2 }));
    expect(recognizeGesture(flat)).toBeNull();
  });

  it('does not guess', () => {
    // A tap, a slip, a swipe left, a diagonal.
    expect(recognizeGesture([])).toBeNull();
    expect(recognizeGesture([{ x: 5, y: 5 }])).toBeNull();
    expect(recognizeGesture(line({ x: 100, y: 100 }, { x: 110, y: 130 }))).toBeNull();
    expect(recognizeGesture(line({ x: 170, y: 100 }, { x: 20, y: 100 }))).toBeNull();
    expect(recognizeGesture(line({ x: 20, y: 20 }, { x: 160, y: 160 }))).toBeNull();
    // Half a circle, and a zigzag.
    expect(recognizeGesture(arc(50, Math.PI))).toBeNull();
    const zigzag = [
      ...line({ x: 20, y: 100 }, { x: 160, y: 100 }),
      ...line({ x: 160, y: 100 }, { x: 20, y: 105 }),
      ...line({ x: 20, y: 105 }, { x: 160, y: 100 }),
    ];
    expect(recognizeGesture(zigzag)).toBeNull();
  });

  it('has a drawing for every trick', () => {
    expect(Object.keys(GESTURES).sort()).toEqual(['highfive', 'jump', 'sit', 'spin']);
  });
});
