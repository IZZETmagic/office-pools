import { describe, it, expect } from 'vitest';

import {
  crewFooter,
  crewsTeaser,
  crewStatusText,
  crewSummary,
  finishText,
  homeCrews,
  leaderText,
  leaveConsequence,
  meText,
  ordinal,
  personName,
  roleLabel,
  winnersText,
  type CrewCard,
  type CrewDetail,
} from '../crews';

describe('ordinal', () => {
  it('handles the teens and the twenties', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th',
    ]);
  });
});

describe('names and roles', () => {
  it('full name, then username, then "Someone"', () => {
    expect(personName({ fullName: 'Dave Okafor', username: 'dave' })).toBe('Dave Okafor');
    expect(personName({ fullName: null, username: 'dave' })).toBe('dave');
    expect(personName({ fullName: '  ', username: null })).toBe('Someone');
  });
  it('labels only the two roles that carry one', () => {
    expect([roleLabel('captain'), roleLabel('co_captain'), roleLabel('member'), roleLabel(null)]).toEqual([
      'Captain', 'Co-captain', null, null,
    ]);
  });
});

describe('the My Crews card', () => {
  it('summary line', () => {
    // Mid-month on purpose: the month is the DEVICE's, and midnight UTC on the 1st is still the
    // previous month west of Greenwich (the parseDate lesson from createPool.ts).
    expect(crewSummary({ people: 14, seasons: 3, since: '2026-06-15T12:00:00Z' })).toBe('14 people · 3 seasons since Jun 2026');
    expect(crewSummary({ people: 1, seasons: 0, since: '2026-10-15T12:00:00Z' })).toBe('1 person · no seasons yet since Oct 2026');
  });
  it('status chip, in priority order', () => {
    expect(crewStatusText({ kind: 'seat', poolId: 'p', competition: 'Champions League 2026/27', firstLockAt: 'x' })).toBe('Your spot’s saved · Champions League 2026/27');
    expect(crewStatusText({ kind: 'live', poolId: 'p', competition: 'Premier League 2026/27' })).toBe('Playing now · Premier League 2026/27');
    expect(crewStatusText({ kind: 'quiet', poolId: 'p', competition: 'FIFA World Cup 2026' })).toBe('Last played FIFA World Cup 2026');
    expect(crewStatusText({ kind: 'quiet', poolId: null, competition: null })).toBe('No seasons yet');
  });
  it('leader and my place', () => {
    const leader = { userId: 'd', username: 'dave', fullName: 'Dave Okafor', avatarUrl: null, avatarBuild: null, avatarColour: null, titles: 1 };
    expect(leaderText({ leader }, 'me')).toBe('Dave leads all-time');
    expect(leaderText({ leader }, 'd')).toBe('You lead all-time');
    expect(leaderText({ leader: null }, 'me')).toBeNull();
    expect(meText({ me: { position: 4, titles: 0, seasons: 3 } })).toBe('You’re 4th all-time');
    expect(meText({ me: { position: 1, titles: 2, seasons: 3 } })).toBe('You’re top all-time');
    expect(meText({ me: { position: null, titles: 0, seasons: 0 } })).toBeNull();
  });
  it('the hub tile teaser', () => {
    expect(crewsTeaser(null)).toBe('The people you keep playing with');
    expect(crewsTeaser([{ name: 'Bermuda Office' }])).toBe('Bermuda Office');
    expect(crewsTeaser([{ name: 'Bermuda Office' }, { name: 'A' }, { name: 'B' }])).toBe('Bermuda Office and 2 more');
  });
});

describe('the Home card', () => {
  const person = { username: null, avatarUrl: null, avatarBuild: null, avatarColour: null };
  const card = (kind: 'seat' | 'live' | 'quiet' | 'disbanded', crewId: string) =>
    ({
      crewId,
      name: crewId,
      people: 3,
      seasons: 1,
      since: '2026-10-03T12:00:00Z',
      status:
        kind === 'disbanded'
          ? { kind, at: 'x' }
          : kind === 'quiet'
            ? { kind, poolId: null, competition: null }
            : kind === 'seat'
              ? { kind, poolId: 'p', competition: 'c', firstLockAt: 'x' }
              : { kind, poolId: 'p', competition: 'c' },
      leader: null,
      me: { position: null, titles: 0, seasons: 0 },
      faces: [],
    }) as CrewCard;

  it('leaves out a disbanded crew, and keeps the server’s order', () => {
    expect(homeCrews([card('seat', 'a'), card('disbanded', 'b'), card('quiet', 'c')]).map((c) => c.crewId)).toEqual(['a', 'c']);
    expect(homeCrews(null)).toEqual([]);
    expect(homeCrews([card('disbanded', 'b')])).toEqual([]);
  });

  it('footer: nobody leads until a season has finished with ranks', () => {
    expect(crewFooter({ leader: null, me: { position: null, titles: 0, seasons: 0 } }, 'me')).toEqual({ kind: 'none' });
  });

  it('footer: someone else leads — their titles, and my place', () => {
    const dave = { ...person, userId: 'd', fullName: 'Dave Okafor', titles: 2 };
    expect(crewFooter({ leader: dave, me: { position: 3, titles: 0, seasons: 2 } }, 'me')).toEqual({
      kind: 'leader', leader: dave, titles: '2 titles', you: '3rd',
    });
    // No ranked finish of my own yet (Last Man Standing only, say): no place, never "—th".
    expect(crewFooter({ leader: { ...dave, titles: 1 }, me: { position: null, titles: 0, seasons: 1 } }, 'me')).toMatchObject({
      titles: '1 title', you: null,
    });
    // A leader on zero titles says nothing about titles rather than "0 titles".
    expect(crewFooter({ leader: { ...dave, titles: 0 }, me: { position: 2, titles: 0, seasons: 1 } }, 'me')).toMatchObject({ titles: null });
  });

  it('footer: I lead', () => {
    const me = { ...person, userId: 'me', fullName: 'Ryan Sousa', titles: 1 };
    expect(crewFooter({ leader: me, me: { position: 1, titles: 1, seasons: 1 } }, 'me')).toEqual({ kind: 'you-lead', leader: me, titles: '1 title' });
  });
});

describe('seasons', () => {
  it('a finish, or "Played" for Last Man Standing', () => {
    expect(finishText(3, 12)).toBe('3rd of 12');
    expect(finishText(null, 9)).toBe('Played');
  });
  it('winners', () => {
    expect(winnersText([{ fullName: 'Dave Okafor', username: 'd' }])).toBe('Won by Dave');
    expect(winnersText([{ fullName: 'Dave', username: 'd' }, { fullName: 'Priya', username: 'p' }])).toBe('Won by Dave and Priya');
    expect(winnersText([])).toBe('');
  });
});

describe('what leaving does — said before the tap', () => {
  const member = (userId: string, role: 'captain' | 'co_captain' | 'member', joinedAt: string, fullName: string) => ({
    userId, role, joinedAt, fullName, username: null, avatarUrl: null, avatarBuild: null, avatarColour: null,
  });
  const detail = (role: 'captain' | 'member', members: ReturnType<typeof member>[]): Pick<CrewDetail, 'viewer' | 'members'> => ({
    viewer: { role, active: true, canManage: role === 'captain', canSetCoCaptain: role === 'captain', canRejoin: false, canDisband: role === 'captain', canRestore: false },
    members,
  });
  it('a member: history stays, rejoin any time', () => {
    expect(leaveConsequence(detail('member', []))).toMatch(/rejoin from here/);
  });
  it('the captain: the co-captain takes over', () => {
    expect(leaveConsequence(detail('captain', [member('me', 'captain', '2026-06-01', 'Me'), member('p', 'co_captain', '2026-07-01', 'Priya Shah')]))).toBe(
      'Priya will become captain. Your history stays.',
    );
  });
  it('the captain with no co-captain: the longest-standing member', () => {
    expect(
      leaveConsequence(detail('captain', [member('me', 'captain', '2026-06-01', 'Me'), member('t', 'member', '2026-08-01', 'Tom'), member('m', 'member', '2026-06-05', 'Marcus')])),
    ).toBe('Marcus will become captain — the longest-standing member. Your history stays.');
  });
  it('the last one in closes the crew', () => {
    expect(leaveConsequence(detail('captain', [member('me', 'captain', '2026-06-01', 'Me')]))).toMatch(/crew will close/);
  });
});
