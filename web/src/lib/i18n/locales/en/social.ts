import type { social as fr } from '../fr/social.ts';

/** Village, visits, album and journal. */
export const social: Record<keyof typeof fr, string> = {
  'village.title': 'The village',
  'village.intro':
    'Other members’ companions. Drop by and say hello: a daily pet makes them happy (and earns you a few coins). Your favorites and the members you meet most often come first.',
  'village.favorite': 'Favorite',
  'village.empty': 'Nobody in the village yet. Invite other members to adopt a companion!',

  'goal.title': 'This week’s goal',
  'goal.intro':
    'The village walks its companions together: at {target} walks, every member who took part earns a reward.',
  'goal.progress': '{progress} / {target} walks',
  'goal.mine_one': 'You did {count}.',
  'goal.mine_other': 'You did {count}.',
  'goal.none': 'You have not walked your companion yet this week.',
  'goal.ends': 'New goal {date}',
  'goal.reached': '🎉 Goal reached!',
  'goal.claim_one': 'Collect {count} coin',
  'goal.claim_other': 'Collect {count} coins',
  'goal.claimed': 'Reward collected ✔',
  'goal.claimed_toast_one': 'Village reward: +{count} coin!',
  'goal.claimed_toast_other': 'Village reward: +{count} coins!',

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
  'visit.on_vacation': '{name} is on vacation: no pets or gifts for now.',
  'visit.gift': 'Give: {item} ×{count}',
};
