import type { minigame as fr } from '../fr/minigame.ts';

/** The mini-games (one is drawn at random). */
export const minigame: Record<keyof typeof fr, string> = {
  'minigame.title_look': 'Game: where will {name} look?',
  'minigame.title_number': 'Game: higher or lower for {name}',
  'minigame.title_hand': 'Game: rock-paper-scissors with {name}',
  'minigame.higher': '⬆️ Higher',
  'minigame.lower': '⬇️ Lower',
  'minigame.rock': '✊ Rock',
  'minigame.paper': '✋ Paper',
  'minigame.scissors': '✌️ Scissors',
  'minigame.round': 'Round {round} / {total} — score: {score}',
  'minigame.won': 'Won!',
  'minigame.lost': 'Missed…',
  'minigame.left': '⬅️ Left',
  'minigame.right': 'Right ➡️',
  'minigame.stop': 'Stop',
  'minigame.final': 'Final score: {score} / {total}',
  'minigame.finish': 'Finish',
};
