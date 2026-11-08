import type { minigame as fr } from '../fr/minigame.ts';

/** The “look left or right” mini-game. */
export const minigame: Record<keyof typeof fr, string> = {
  'minigame.title': 'Game: where will {name} look?',
  'minigame.round': 'Round {round} / {total} — score: {score}',
  'minigame.won': 'Won!',
  'minigame.lost': 'Missed…',
  'minigame.left': '⬅️ Left',
  'minigame.right': 'Right ➡️',
  'minigame.stop': 'Stop',
  'minigame.final': 'Final score: {score} / {total}',
  'minigame.finish': 'Finish',
};
