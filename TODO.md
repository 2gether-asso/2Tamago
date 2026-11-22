# TODO: gameplay, fun and balance

Working notes (English, like the code). The design is a mix of Tamagotchi (care loop), Sims
(needs, moods, wants) and Nintendogs (affection, tricks, walks, presents). The target player
checks in 3 or 4 times a day for a few minutes: care should feel like play, not chores, and
missing a notification should never ruin a pet.

## Findings (casual-player simulation, 4 check-ins a day: 8:00, 12:30, 19:00, 21:30)

- Needs are gentle: zero care mistakes over 14 days with ~10 taps per check-in. Keep it.
- Every tantrum was missed (27/27): the 30 min window is shorter than any real check-in gap.
  Discipline stays at 0, so a perfectly cared-for pet evolves into a Rascal. **Fix first.**
- Bond is maxed by day 3: caresses (+1 every 15 s) make it trivial, and nothing uses it past 30.
- The free ration (+20) needs 2-3 taps to fill a hungry pet: a small chore, acceptable.

## Plan

### Balance (engine)
- [ ] Tantrums wait longer for an answer (3 h instead of 30 min); ignoring costs less (-5).
- [ ] Training also builds discipline (+3): a trained pet is a disciplined pet (Nintendogs).
- [ ] Caresses give bond only for the first few of a game day (hearts and happiness always).
- [ ] Re-run the casual simulation: radiant reachable, rascal only when neglected.

### Wishes (Sims wants, engine)
- [ ] The pet sometimes wishes for something (play, a treat, a walk, a caress, a trick, a bath,
      a nap, a meal). Biased by temperament. Deterministic, from the pet and the time.
- [ ] Granting it in time: happiness and bond bonus, a few coins (API), a journal line.
- [ ] Missing it costs nothing: it just goes away. Never a chore.

### Daily missions (meta)
- [ ] 3 small missions a day per player (pure picker in the engine, progress kept by the API).
- [ ] Each one done gives coins; all three done gives a bonus present (random item).
- [ ] Doable in ~5 minutes spread over the day.

### Day events and surprises
- [ ] A themed day now and then (deterministic like the weather): picnic day (meals give
      happiness), festival (games give more), cozy rain (better sleep), lucky day (walk finds)...
- [ ] The pet's own birthday (every 7 game days of life?) with a small party.
- [ ] A present waiting when you come back (Nintendogs): once a day if the pet is happy and the
      bond is high enough, it has found something for you.

### PWA and notifications (branch `pwa-install`)
- [ ] Web manifest + icons, installable on Android / iOS (home screen).
- [ ] Install invitation (beforeinstallprompt, iOS hint).
- [ ] App shell cache in the service worker, so the app opens instantly / offline page.
- [ ] App badge with the number of alerts.

### Longer sessions (branch `longer-sessions`)
- [ ] Phones change networks all day: the 6 h roaming limit signs them out. Remember the
      networks a session came back from (known networks), longer defaults.

## Ideas parked
- Room decor with passive effects (cushion: better naps, fishbowl: slower boredom).
- Fetch mini-game (throw a ball by swiping).
- Name recognition / voice commands (Nintendogs).
- Shared custody, playdates between two pets.
