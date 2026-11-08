import type { feedback as fr } from '../fr/feedback.ts';

/** The feedback form (header button and modal). */
export const feedback: Record<keyof typeof fr, string> = {
  'feedback.title': 'Give feedback',
  'feedback.intro': 'Your message goes straight to the 2Tamago team.',
  'feedback.type_label': 'Type of feedback',
  'feedback.type.bug': 'Bug',
  'feedback.type.bug_hint': 'Something does not work as expected.',
  'feedback.type.idea': 'Idea',
  'feedback.type.idea_hint': 'A wish, an improvement, a creature…',
  'feedback.type.other': 'Other',
  'feedback.type.other_hint': 'A question, a kind word, anything else.',
  'feedback.message_label': 'Your message',
  'feedback.placeholder': 'Describe your idea or what happened…',
  'feedback.min_remaining_one': '{count} more character needed',
  'feedback.min_remaining_other': '{count} more characters needed',
  'feedback.cancel': 'Cancel',
  'feedback.send': 'Send',
  'feedback.sending': 'Sending…',
  'feedback.thanks': 'Thanks for your feedback! 💜',
  'feedback.failed': 'Your feedback could not be sent right now.',
};
