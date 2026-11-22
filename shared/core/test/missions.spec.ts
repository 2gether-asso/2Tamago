import { describe, expect, it } from 'vitest';
import {
  allMissionsDone,
  countMission,
  MISSION_REWARD,
  MISSIONS,
  MISSIONS_PER_DAY,
  missionPresent,
  pickMissions,
} from '../src/index.js';

describe('daily missions', () => {
  it('picks three missions about different things, the same for the same seed', () => {
    for (let day = 0; day < 50; day++) {
      const picked = pickMissions(`player:${day}`, 'adult');
      expect(picked).toHaveLength(MISSIONS_PER_DAY);
      expect(new Set(picked.map((id) => MISSIONS[id].signal)).size).toBe(MISSIONS_PER_DAY);
      expect(pickMissions(`player:${day}`, 'adult')).toEqual(picked);
    }
  });

  it('only asks a baby what a baby can do', () => {
    for (let day = 0; day < 100; day++) {
      for (const id of pickMissions(`p:${day}`, 'baby')) {
        expect(['train_tricks', 'go_walk', 'two_walks', 'pet_job']).not.toContain(id);
      }
    }
  });

  it('counts signals up to the target and reports a mission once, when it is done', () => {
    let missions = [
      { id: 'play_games' as const, progress: 0 },
      { id: 'grant_wish' as const, progress: 0 },
    ];
    let step = countMission(missions, 'play');
    expect(step.completed).toEqual([]);
    step = countMission(step.missions, 'play');
    expect(step.completed).toEqual(['play_games']);
    missions = step.missions as typeof missions;
    step = countMission(missions, 'play');
    expect(step.completed).toEqual([]);
    expect(step.missions[0]!.progress).toBe(2);
    expect(allMissionsDone(step.missions)).toBe(false);
    expect(allMissionsDone(countMission(step.missions, 'wish').missions)).toBe(true);
  });

  it('opens a present from the list', () => {
    expect(missionPresent(0)).toBe(MISSION_REWARD.presents[0]);
    expect(missionPresent(0.9999)).toBe(MISSION_REWARD.presents.at(-1));
  });
});
