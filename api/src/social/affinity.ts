/** What each kind of contact between two players is worth when sorting the village. */
export const AFFINITY_WEIGHTS = { interaction: 1, encounter: 3 } as const;

export interface Contacts {
  /** Caresses and gifts, in either direction. */
  interactions: number;
  /** Walks where their pets met. */
  encounters: number;
}

export function affinityScore(contacts: Contacts): number {
  return (
    contacts.interactions * AFFINITY_WEIGHTS.interaction +
    contacts.encounters * AFFINITY_WEIGHTS.encounter
  );
}

export interface Rankable {
  favorite: boolean;
  affinity: number;
  /** Most recent activity first (epoch ms). */
  updatedAt: number;
}

/** Favorites first, then the closest players, then the most recently active. */
export function compareVillage(a: Rankable, b: Rankable): number {
  return (
    Number(b.favorite) - Number(a.favorite) || b.affinity - a.affinity || b.updatedAt - a.updatedAt
  );
}
