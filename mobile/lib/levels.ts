type Level = { number: number; name: string };

const LEVELS: ReadonlyArray<{ minPoints: number; level: Level }> = [
  { minPoints: 5000, level: { number: 10, name: 'Legend' } },
  { minPoints: 4000, level: { number: 9, name: 'Master' } },
  { minPoints: 3000, level: { number: 8, name: 'Expert' } },
  { minPoints: 2500, level: { number: 7, name: 'Strategist' } },
  { minPoints: 2000, level: { number: 6, name: 'Tactician' } },
  { minPoints: 1500, level: { number: 5, name: 'Competitor' } },
  { minPoints: 1000, level: { number: 4, name: 'Contender' } },
  { minPoints: 500, level: { number: 3, name: 'Amateur' } },
  { minPoints: 100, level: { number: 2, name: 'Beginner' } },
];

const ROOKIE: Level = { number: 1, name: 'Rookie' };

export function getLevel(points: number): Level {
  for (const tier of LEVELS) {
    if (points >= tier.minPoints) return tier.level;
  }
  return ROOKIE;
}
