import type { push as fr } from '../fr/push.ts';

/** Notifications: the settings card and the messages the service worker shows. */
export const push: Record<keyof typeof fr, string> = {
  'push.title': 'Notifications',
  'push.intro':
    'Get an alert on this device when your companion is hungry, sick, throwing a tantrum or back from its walk (never while it sleeps), or when a member asks you to look after theirs.',
  'push.enable': '🔔 Turn on notifications',
  'push.disable': '🔕 Turn off notifications',
  'push.test': 'Send a test notification',
  'push.enabled_toast': 'Notifications turned on for this device.',
  'push.disabled_toast': 'Notifications turned off for this device.',
  'push.test_sent': 'Test notification sent.',
  'push.test_none': 'No device received the notification.',
  'push.unsupported':
    'This browser does not support notifications. On iPhone, add 2Tamago to your home screen first.',
  'push.unavailable': 'Notifications are not enabled on this server.',
  'push.denied': 'Notifications are blocked for this site: allow them in your browser’s settings.',

  'push.msg.hungry': '{petName} is hungry!',
  'push.msg.sick': '{petName} is sick.',
  'push.msg.calling': '{petName} is throwing a tantrum!',
  'push.msg.walk_done': '{petName} is back from its walk.',
  'push.msg.daycare_invite': '{playerName} would like to entrust you with {petName}.',
  'push.msg.trade_offer': '{playerName} offers you a trade.',
  'push.msg.test': 'It works: you will get your companion’s alerts here.',
};
