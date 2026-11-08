/** Village, visits, album and journal. */
export const social = {
  'village.title': 'Le village',
  'village.intro':
    'Les compagnons des autres membres. Passe leur dire bonjour : une caresse par jour fait plaisir (et rapporte quelques pièces). Tes favoris et les membres que tu croises le plus souvent viennent en premier.',
  'village.favorite': 'Favori',
  'village.empty':
    'Personne au village pour l’instant. Invite d’autres membres à adopter un compagnon !',

  'goal.title': 'Objectif de la semaine',
  'goal.intro':
    'Le village promène ses compagnons ensemble : à {target} promenades, chaque membre qui y a pris part gagne une récompense.',
  'goal.progress': '{progress} / {target} promenades',
  'goal.mine_one': 'Tu en as fait {count}.',
  'goal.mine_other': 'Tu en as fait {count}.',
  'goal.none': 'Tu n’as pas encore promené ton compagnon cette semaine.',
  'goal.ends': 'Nouvel objectif {date}',
  'goal.reached': '🎉 Objectif atteint !',
  'goal.claim_one': 'Récupérer {count} pièce',
  'goal.claim_other': 'Récupérer {count} pièces',
  'goal.claimed': 'Récompense récupérée ✔',
  'goal.claimed_toast_one': 'Récompense du village : +{count} pièce !',
  'goal.claimed_toast_other': 'Récompense du village : +{count} pièces !',

  'daycare.title': 'Garderie',
  'daycare.owner_intro':
    'Besoin de t’absenter sans mettre {name} en pause ? Confie-le à un autre membre depuis son profil : il s’en occupera pendant ton absence (le temps continue de passer, contrairement aux vacances).',
  'daycare.entrust': '🏡 Lui confier mon compagnon',
  'daycare.entrust_confirm':
    'Confier {pet} à {caretaker} ? {caretaker} devra accepter, puis pourra le nourrir, le nettoyer et le soigner pendant {days} jours au plus.',
  'daycare.invited_toast': 'Invitation envoyée à {caretaker}.',
  'daycare.pending': 'Invitation envoyée à {caretaker}, sans réponse jusqu’au {date}.',
  'daycare.active': '{pet} est gardé par {caretaker}, au plus tard jusqu’au {date}.',
  'daycare.cancel': 'Annuler l’invitation',
  'daycare.retrieve': 'Reprendre mon compagnon',
  'daycare.invitations': 'Invitations',
  'daycare.invitation':
    '{owner} voudrait te confier {pet} pendant {days} jours au plus. Réponds avant le {date}.',
  'daycare.accept': 'Accepter',
  'daycare.decline': 'Refuser',
  'daycare.accepted_toast': 'Tu t’occupes de {pet} !',
  'daycare.caring': 'Compagnons que tu gardes',
  'daycare.caring_item': '{pet} ({owner}), jusqu’au {date}',
  'daycare.look_after': 'S’en occuper',
  'daycare.give_back': 'Rendre',
  'daycare.care_title': 'Tu gardes {name}',
  'daycare.care_intro':
    'Pendant ton tour de garde, tu peux le nourrir, le nettoyer, le soigner… Chaque vrai soin rapporte quelques pièces (dans la limite du jour).',
  'daycare.care_caress': '🤚 Caresser',

  'album.title': 'Album',
  'album.intro': 'Les compagnons qui ont partagé ta vie.',
  'album.empty': 'Ton album est vide pour l’instant.',
  'album.retired': '🌅 Retraité',
  'album.left': '🍃 Parti',

  'journal.title': 'Journal',
  'journal.empty': 'Rien pour l’instant.',

  'visit.back': '← Retour au village',
  'visit.owner': 'Compagnon de {owner} · {stage}',
  'visit.caressed': 'Déjà caressé aujourd’hui 💞',
  'visit.caress': 'Caresser 🤚',
  'visit.on_vacation': '{name} est en vacances : pas de caresse ni de cadeau pour l’instant.',
  'visit.gift': 'Offrir : {item} ×{count}',
} as const;
