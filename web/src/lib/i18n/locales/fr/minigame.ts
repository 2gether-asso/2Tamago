/** The mini-games (one is drawn at random): look left or right, higher or lower, rock-paper-scissors, catch. */
export const minigame = {
  'minigame.title_look': 'Jeu : où va regarder {name} ?',
  'minigame.title_number': 'Jeu : plus ou moins pour {name}',
  'minigame.title_hand': 'Jeu : pierre-feuille-ciseaux avec {name}',
  'minigame.title_catch': 'Jeu : attrape les friandises de {name}',
  'minigame.catch_hint':
    'Déplace le panier (souris, doigt ou flèches) : attrape 🍪🍓🍰, évite 💩🌶️🧦.',
  'minigame.catch_status': 'Temps : {seconds} s — attrapées : {caught}',
  'minigame.catch_field': 'Terrain de jeu : déplace le panier avec les flèches gauche et droite',
  'minigame.higher': '⬆️ Plus grand',
  'minigame.lower': '⬇️ Plus petit',
  'minigame.rock': '✊ Pierre',
  'minigame.paper': '✋ Feuille',
  'minigame.scissors': '✌️ Ciseaux',
  'minigame.round': 'Manche {round} / {total} — score : {score}',
  'minigame.won': 'Gagné !',
  'minigame.lost': 'Raté…',
  'minigame.left': '⬅️ Gauche',
  'minigame.right': 'Droite ➡️',
  'minigame.stop': 'Arrêter',
  'minigame.final': 'Score final : {score} / {total}',
  'minigame.finish': 'Terminer',
} as const;
