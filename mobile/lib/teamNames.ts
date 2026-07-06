// Shorter display names for teams whose full name overflows tight row layouts
// (e.g. the Results row's fixed name slot at ~84px). Falls back to the full name
// when there's no override. Extend this map as needed.
const SHORT_TEAM_NAMES: Record<string, string> = {
  'Bosnia and Herzegovina': 'Bosnia',
  'United States': 'USA',
  'Saudi Arabia': 'S. Arabia',
  'South Africa': 'S. Africa',
};

export function displayTeamName(name: string): string {
  return SHORT_TEAM_NAMES[name] ?? name;
}
