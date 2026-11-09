/** Notifications: the settings card and the messages the service worker shows. */
export const push = {
  'push.title': 'Notifications',
  'push.intro':
    'Reçois une alerte sur cet appareil quand ton compagnon a faim, est malade, fait un caprice ou a fini sa promenade (jamais pendant qu’il dort), ou quand un membre te propose de garder le sien.',
  'push.enable': '🔔 Activer les notifications',
  'push.disable': '🔕 Désactiver les notifications',
  'push.test': 'Envoyer une notification de test',
  'push.enabled_toast': 'Notifications activées sur cet appareil.',
  'push.disabled_toast': 'Notifications désactivées sur cet appareil.',
  'push.test_sent': 'Notification de test envoyée.',
  'push.test_none': 'Aucun appareil n’a reçu la notification.',
  'push.unsupported':
    'Ce navigateur ne gère pas les notifications. Sur iPhone, ajoute d’abord 2Tamago à l’écran d’accueil.',
  'push.unavailable': 'Les notifications ne sont pas activées sur ce serveur.',
  'push.denied':
    'Les notifications sont bloquées pour ce site : autorise-les dans les réglages du navigateur.',

  'push.msg.hungry': '{petName} a faim !',
  'push.msg.sick': '{petName} est malade.',
  'push.msg.calling': '{petName} fait un caprice !',
  'push.msg.walk_done': '{petName} a fini sa promenade.',
  'push.msg.daycare_invite': '{playerName} aimerait te confier {petName}.',
  'push.msg.trade_offer': '{playerName} te propose un échange.',
  'push.msg.test': 'Ça marche : tu recevras les alertes de ton compagnon ici.',
} as const;
