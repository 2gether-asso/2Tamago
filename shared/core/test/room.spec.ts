import { describe, expect, it } from 'vitest';
import {
  EMPTY_ROOM,
  isForSale,
  isUnique,
  ITEMS,
  ROOM_LIMITS,
  roomProblem,
  tradeProblem,
  visibleRoom,
  type DecorId,
  type Room,
} from '../src/index.js';

const all = () => true;
const room = (patch: Partial<Room>): Room => ({ ...EMPTY_ROOM, ...patch });

describe('room', () => {
  it('accepts an empty room and a furnished one', () => {
    expect(roomProblem(EMPTY_ROOM, () => false)).toBeNull();
    expect(
      roomProblem(
        room({ wall: 'wall_stars', floor: 'floor_wood', props: ['plant', 'lamp', 'cushion'] }),
        all,
      ),
    ).toBeNull();
  });

  it('refuses what is not decoration, or in the wrong place', () => {
    expect(roomProblem(room({ props: ['cookie' as DecorId] }), all)).toBe('unknown_item');
    expect(roomProblem(room({ wall: 'nothing' as DecorId }), all)).toBe('unknown_item');
    expect(roomProblem(room({ wall: 'floor_wood' }), all)).toBe('wrong_slot');
    expect(roomProblem(room({ floor: 'plant' }), all)).toBe('wrong_slot');
    expect(roomProblem(room({ props: ['wall_sea'] }), all)).toBe('wrong_slot');
  });

  it('limits the props, with no duplicate', () => {
    const four: DecorId[] = ['plant', 'lamp', 'cushion', 'fishbowl'];
    expect(four.length).toBeGreaterThan(ROOM_LIMITS.maxProps);
    expect(roomProblem(room({ props: four }), all)).toBe('too_many_props');
    expect(roomProblem(room({ props: ['plant', 'plant'] }), all)).toBe('duplicate');
  });

  it('only holds what the player owns', () => {
    const owns = (id: DecorId) => id === 'plant';
    expect(roomProblem(room({ props: ['plant'] }), owns)).toBeNull();
    expect(roomProblem(room({ props: ['plant', 'lamp'] }), owns)).toBe('not_owned');
    expect(roomProblem(room({ wall: 'wall_sea' }), owns)).toBe('not_owned');
  });

  it('shows only what is still valid and owned', () => {
    const stored = {
      wall: 'wall_sea',
      floor: 'plant', // wrong slot
      props: ['lamp', 'lamp', 'cookie', 'plant', 'fishbowl', 'cushion'],
    } as unknown as Room;
    const owns = (id: DecorId) => id !== 'plant';
    expect(visibleRoom(stored, owns)).toEqual({
      wall: 'wall_sea',
      floor: null,
      props: ['lamp', 'fishbowl', 'cushion'],
    });
    expect(visibleRoom(null, all)).toEqual(EMPTY_ROOM);
    expect(visibleRoom({ props: 'oops' } as unknown as Room, all)).toEqual(EMPTY_ROOM);
  });

  it('keeps decoration once, like accessories, and sells it', () => {
    expect(isUnique('plant')).toBe(true);
    expect(isUnique('ribbon')).toBe(true);
    expect(isUnique('cookie')).toBe(false);
    expect(tradeProblem({ plant: 2 }, {}, 0, 0)).toBe('bad_quantity');
    expect(tradeProblem({ plant: 1 }, {}, 0, 0)).toBeNull();
    for (const item of Object.values(ITEMS)) {
      if (item.kind === 'decor') expect(isForSale(item.id), item.id).toBe(true);
    }
  });
});
