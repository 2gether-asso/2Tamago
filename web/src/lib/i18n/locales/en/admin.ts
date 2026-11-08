import type { admin as fr } from '../fr/admin.ts';

/** The admin screen. */
export const admin: Record<keyof typeof fr, string> = {
  'admin.title': 'Administration',
  'admin.forbidden': 'This page is reserved for administrators.',
  'admin.intro_before':
    'Game settings, editable without redeploying. Only the values listed below replace the defaults;',
  'admin.intro_after':
    'goes back to the defaults. The speed of time and the simulation step cannot be changed.',
  'admin.edit': 'Changes (JSON)',
  'admin.save': 'Save',
  'admin.defaults': 'Default values',
  'admin.invalid_json': 'This is not valid JSON.',
  'admin.saved': 'Settings saved. Players receive them on their next page load.',
};
