import type { work as fr } from '../fr/work.ts';

/** The work page: the player's skill game and the companion's job. */
export const work: Record<keyof typeof fr, string> = {
  'work.title': 'Work',
  'work.intro':
    'Earn coins on top of the daily bonus: a small job for you every hour, and a job for your companion every two hours.',
  'work.player.title': 'Your odd job',
  'work.player.text': 'Market till: {rounds} sums, {coins} coins for each right answer.',
  'work.player.start': 'Start',
  'work.question': 'Sum {round} / {total} — score: {score}',
  'work.final': 'Score: {score} / {total}',
  'work.submit': 'Cash in',
  'work.cancel': 'Give up',
  'work.player.done_one': 'Well done: +{count} coin.',
  'work.player.done_other': 'Well done: +{count} coins.',
  'work.pet.title': '{name}’s job',
  'work.pet.text':
    'Its wage depends on its skills (tricks learned, discipline, bond, mood) and a bit of luck: from {min} to {max} coins. Working tires it out and makes it hungry.',
  'work.pet.start': 'Send to work',
  'work.pet.no_pet': 'You need a companion for it to work.',
  'work.pet.done_one': '{name} brought back {count} coin.',
  'work.pet.done_other': '{name} brought back {count} coins.',
  'work.wait': 'Available in {time}',
  'work.ready': 'Available',
};
