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

  'daycare.title': 'Daycare',
  'daycare.owner_intro':
    'Need to be away without pausing {name}? Entrust it to another member from their profile: they will look after it while you are gone (time keeps passing, unlike on vacation).',
  'daycare.entrust': '🏡 Entrust my companion to them',
  'daycare.entrust_confirm':
    'Entrust {pet} to {caretaker}? {caretaker} will have to accept, then can feed, clean and care for it for up to {days} days.',
  'daycare.invited_toast': 'Invitation sent to {caretaker}.',
  'daycare.pending': 'Invitation sent to {caretaker}, unanswered until {date}.',
  'daycare.active': '{pet} is looked after by {caretaker}, until {date} at the latest.',
  'daycare.cancel': 'Cancel the invitation',
  'daycare.retrieve': 'Take my companion back',
  'daycare.invitations': 'Invitations',
  'daycare.invitation':
    '{owner} would like to entrust you with {pet} for up to {days} days. Answer before {date}.',
  'daycare.accept': 'Accept',
  'daycare.decline': 'Decline',
  'daycare.accepted_toast': 'You are looking after {pet}!',
  'daycare.caring': 'Companions you look after',
  'daycare.caring_item': '{pet} ({owner}), until {date}',
  'daycare.look_after': 'Look after it',
  'daycare.give_back': 'Give back',
  'daycare.care_title': 'You are looking after {name}',
  'daycare.care_intro':
    'During your watch you can feed it, clean it, care for it… Each real care earns a few coins (within the daily limit).',
  'daycare.care_caress': '🤚 Pet it',

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
