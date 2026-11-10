import { getItem, isDecor, type DecorId, type DecorSlot } from './catalog.js';

/** The player's room: where the companion lives, shown at home and to visitors. */
export interface Room {
  wall: DecorId | null;
  floor: DecorId | null;
  /** Things standing in the room, in display order. */
  props: DecorId[];
}

export const ROOM_LIMITS = {
  /** Props in the room at once. */
  maxProps: 3,
} as const;

export const EMPTY_ROOM: Room = { wall: null, floor: null, props: [] };

export type RoomProblem =
  /** Not a piece of decoration. */
  | 'unknown_item'
  /** A wallpaper on the floor, a lamp on the wall… */
  | 'wrong_slot'
  | 'too_many_props'
  /** The same prop twice. */
  | 'duplicate'
  /** The player does not own it. */
  | 'not_owned';

const slotOf = (id: string): DecorSlot | undefined => {
  const item = getItem(id);
  return item?.kind === 'decor' ? item.slot : undefined;
};

/**
 * Why `room` cannot be set, or `null` when it can. `owns` tells what the player has: a room only
 * holds what its owner owns.
 */
export function roomProblem(room: Room, owns: (id: DecorId) => boolean): RoomProblem | null {
  const placed: [DecorId, DecorSlot][] = [];
  if (room.wall) placed.push([room.wall, 'wall']);
  if (room.floor) placed.push([room.floor, 'floor']);
  for (const prop of room.props) placed.push([prop, 'prop']);
  for (const [id, expected] of placed) {
    const slot = slotOf(id);
    if (slot === undefined) return 'unknown_item';
    if (slot !== expected) return 'wrong_slot';
  }
  if (room.props.length > ROOM_LIMITS.maxProps) return 'too_many_props';
  if (new Set(room.props).size !== room.props.length) return 'duplicate';
  if (placed.some(([id]) => !owns(id))) return 'not_owned';
  return null;
}

/**
 * What a stored room shows: whatever is no longer valid is left out (the item was traded away, the
 * catalog changed). Never fails: a room is decoration, not a rule.
 */
export function visibleRoom(
  stored: Partial<Room> | null | undefined,
  owns: (id: DecorId) => boolean,
): Room {
  const keep = (id: unknown, slot: DecorSlot): id is DecorId =>
    typeof id === 'string' && isDecor(id) && slotOf(id) === slot && owns(id);
  const props = (Array.isArray(stored?.props) ? stored.props : []).filter((id) => keep(id, 'prop'));
  return {
    wall: keep(stored?.wall, 'wall') ? stored.wall! : null,
    floor: keep(stored?.floor, 'floor') ? stored.floor! : null,
    props: [...new Set(props)].slice(0, ROOM_LIMITS.maxProps),
  };
}
