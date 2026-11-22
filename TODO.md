# TODO: gameplay, fun and balance

Working notes (English, like the code). The design is a mix of Tamagotchi (care loop), Sims
(needs, moods, wants) and Nintendogs (affection, tricks, walks, presents). The target player
checks in 3 or 4 times a day for a few minutes: care should feel like play, not chores, and
missing a notification should never ruin a pet.

## Now: watch the balance with real players (feature pause)

No new gameplay until players have played the changes below for a few days. The admin
overview (`/admin`) answers these questions; tune `GameRules` from the admin screen if needed.

- [ ] Do cared-for pets avoid the Rascal form? (target: under 15% of well-cared adults)
- [ ] Do players get sick less? (target: about 1 illness per pet every 10 game days)
- [ ] Are wishes granted, or ignored as noise? (target: over 40% granted)
- [ ] Do players finish their daily missions? Is one mission always skipped?
- [ ] Which need causes most care mistakes?

## Not verified yet

- [ ] Install the app on Android and on iPhone: install prompt, notifications from the installed
      app, and a new deployment replacing the cached shell.
- [ ] Browser test `web/e2e/daily-life.spec.ts` has only run in CI (Chromium system libraries are
      missing in the dev container).

## Done

- Balance (PR #53): tantrums wait 3 h, training builds discipline, caress bond capped per day,
  full bath, metabolism, early tuck-in, softer boredom. Pinned by
  `shared/core/test/balance.spec.ts`. Simulated illnesses for 2-visit players: ~7 → ~1 per 10
  days; a perfectly cared-for pet no longer becomes a Rascal.
- Fun (PR #53): food bowl, wishes, daily missions and their present, themed days, birthdays,
  pet presents, good-news push notifications.
- Installable app (PR #54): manifest, icons, app shell cache, install invitation, app badge.
- Longer sessions (PR #55): sessions learn the networks they keep using; 30 days idle, 90 max.

## Ideas parked (after the pause)

- [ ] Room decor with passive effects (cushion: better naps, fishbowl: slower boredom). Builds on
      the room and the shop; gives coins a use. Best next candidate.
- [ ] Shared custody and playdates between two pets (social; needs pet-to-pet interactions).
- [ ] Fetch mini-game: throw a ball by swiping (self-contained, mostly web).
- [ ] Name recognition / voice commands (Nintendogs). Risky: speech recognition is uneven across
      browsers, especially on iPhone.
