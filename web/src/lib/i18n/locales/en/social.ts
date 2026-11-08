import type { social as fr } from '../fr/social.ts';

/** Village, visits, album and journal. */
export const social: Record<keyof typeof fr, string> = {
  'village.title': 'The village',
  'village.intro':
    'Other members’ companions. Drop by and say hello: a daily pet makes them happy (and earns you a few coins).',
  'village.empty': 'Nobody in the village yet. Invite other members to adopt a companion!',

  'album.title': 'Album',
  'album.intro': 'The companions who shared your life.',
  'album.empty': 'Your album is empty for now.',
  'album.retired': '🌅 Retired',
  'album.left': '🍃 Left',

  'journal.title': 'Journal',
  'journal.empty': 'Nothing yet.',

  'visit.back': '← Back to the village',
  'visit.owner': '{owner}’s companion · {stage}',
  'visit.caressed': 'Already petted today 💞',
  'visit.caress': 'Pet 🤚',
  'visit.gift': 'Give: {item} ×{count}',
};
