import { SPECIES_LABELS, type Form, type Species, type Stage } from '@2tamago/core';

/**
 * The announcements are written for the community channel, in French (the language of the
 * association), whatever the language each player picked in the web app.
 */

const STAGE_NAMES: Record<Stage, string> = {
  egg: 'œuf',
  baby: 'bébé',
  child: 'enfant',
  teen: 'ado',
  adult: 'adulte',
  elder: 'ancien',
};

const FORM_NAMES: Record<Form, string> = {
  radiant: 'rayonnant',
  gentle: 'doux',
  rascal: 'chenapan',
};

/** A player-chosen name made safe for a Discord message: no markdown, no mention, not too long. */
export function plain(name: string): string {
  const short = name.length > 40 ? `${name.slice(0, 39)}…` : name;
  return short.replace(/[\\*_~`|>@<:[\]()#]/g, (char) => `\\${char}`);
}

const bold = (name: string) => `**${plain(name)}**`;

export const texts = {
  newPlayer: (name: string) => `👋 ${bold(name)} vient de rejoindre 2Tamago ! Bienvenue !`,

  hatched: (pet: string, owner: string, species: Species) =>
    `🥚 ${bold(pet)}, le compagnon de ${bold(owner)}, vient d’éclore ! (${SPECIES_LABELS[species]})`,

  evolved: (pet: string, owner: string, stage: Stage, form: Form | null) =>
    `✨ ${bold(pet)}, le compagnon de ${bold(owner)}, a grandi : ${STAGE_NAMES[stage]}${
      form ? `, ${FORM_NAMES[form]}` : ''
    }.`,

  firstMeeting: (petA: string, ownerA: string, petB: string, ownerB: string) =>
    `🤝 ${bold(petA)} (${plain(ownerA)}) et ${bold(petB)} (${plain(ownerB)}) se sont croisés en promenade pour la première fois !`,
};
