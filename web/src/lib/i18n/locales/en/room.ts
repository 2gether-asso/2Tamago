import type { room as fr } from '../fr/room.ts';

/** The room: its decoration and the page to arrange it. */
export const room: Record<keyof typeof fr, string> = {
  'room.title': 'My room',
  'room.link': '🛋️ Decorate the room',
  'room.hint':
    'Decoration is bought in the shop. What you place here shows at home, to visitors and on your profile.',
  'room.wall': 'Wall',
  'room.floor': 'Floor',
  'room.props': 'Objects ({count}/{max})',
  'room.none': 'None',
  'room.save': 'Save',
  'room.saved': 'Room saved.',
  'room.reset': 'Discard changes',
  'room.nothing_owned': 'You do not own any decoration yet.',
  'room.to_shop': 'Go to the shop',
} as const;
