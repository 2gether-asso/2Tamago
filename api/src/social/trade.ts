/** The rules of trading that are about people, not about the game: in real time. */
export const TRADE = {
  /** How long an offer waits for an answer, before the proposer gets their items back. */
  expireHours: 72,
  /** Offers one player can have waiting at once (their items are set aside meanwhile). */
  maxOpen: 3,
} as const;
