/** The work page: the player's skill game and the companion's job. */
export const work = {
  'work.title': 'Travail',
  'work.intro':
    'Gagne des pièces en plus du bonus du jour : un petit boulot pour toi chaque heure, et un travail pour ton compagnon toutes les deux heures.',
  'work.player.title': 'Ton petit boulot',
  'work.player.text': 'Caisse du marché : {rounds} calculs, {coins} pièces par bonne réponse.',
  'work.player.start': 'Commencer',
  'work.question': 'Calcul {round} / {total} — score : {score}',
  'work.final': 'Score : {score} / {total}',
  'work.submit': 'Encaisser',
  'work.cancel': 'Abandonner',
  'work.player.done_one': 'Bien joué : +{count} pièce.',
  'work.player.done_other': 'Bien joué : +{count} pièces.',
  'work.pet.title': 'Le travail de {name}',
  'work.pet.text':
    'Son salaire dépend de ses talents (tours appris, discipline, lien, humeur) et d’un peu de chance : de {min} à {max} pièces. Le travail le fatigue et lui donne faim.',
  'work.pet.start': 'Envoyer travailler',
  'work.pet.no_pet': 'Il faut un compagnon pour qu’il puisse travailler.',
  'work.pet.done_one': '{name} a rapporté {count} pièce.',
  'work.pet.done_other': '{name} a rapporté {count} pièces.',
  'work.wait': 'Disponible dans {time}',
  'work.ready': 'Disponible',
} as const;
