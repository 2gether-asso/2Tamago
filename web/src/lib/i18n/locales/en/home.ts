import type { home as fr } from '../fr/home.ts';

/** The home screen: pet card, care actions, training, walk report. */
export const home: Record<keyof typeof fr, string> = {
  'home.farewell.retired': '{name} is enjoying a well-deserved retirement 🌅',
  'home.farewell.left': '{name} has left…',
  'home.farewell.left_hint':
    'It did not feel looked after enough. It now lives its own life, somewhere out there.',
  'home.farewell.album': 'It will stay in your album.',
  'home.age_days': '{count} d',
  'home.bedtime_hint': '🌙 Bedtime: turn off the light',
  'home.away': '🚶 Out for a walk… back in {time}',
  'home.poops_one': '{count} poop',
  'home.poops_other': '{count} poops',
  'home.egg_hint': 'The egg is wiggling… it will hatch soon!',
  'home.caress_tip': 'Tip: pet {name} by moving your mouse (or finger) over it.',
  'home.status': 'Status',
  'home.care': 'Care',

  'action.feed': '🍙 Feed',
  'action.play': '🎲 Play',
  'action.clean': '🧽 Clean',
  'action.medicine': '💊 Heal',
  'action.wake': '☀️ Wake up',
  'action.sleep': '🌙 Put to bed',
  'action.lights_on': '💡 Turn the light on',
  'action.lights_off': '🕯️ Turn the light off',
  'action.praise': '👏 Praise',
  'action.scold': '☝️ Scold',
  'action.train': '🎓 Train',
  'action.return': '🏠 Bring home',
  'action.walk': '🚶 Walk',
  'action.retire': '🌅 Retire',

  'home.treats': 'Treats',
  'home.training': 'Training and outings',
  'home.trick_to_learn': 'Trick to learn',
  'home.retire_confirm': '{name} will retire. Continue?',
  'home.accessories': 'Accessories',

  'walk.title': 'Back from the walk!',
  'walk.coins_found_one': '🪙 {count} coin found',
  'walk.coins_found_other': '🪙 {count} coins found',
  'walk.encounters': 'Encounters',
  'walk.nobody': 'Nobody else was out walking at that time.',
  'walk.ok': 'Great!',
};
