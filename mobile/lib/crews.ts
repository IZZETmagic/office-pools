// Crews on the phone — types and the words the screens use.
//
// The server sends DATA (lib/crews/read.ts on the web side: counts, ranks, states); this file turns
// it into the sentences My Crews and the crew page show. PURE — no react-native, no expo-router —
// so vitest can reach it (mobile/lib/__tests__/crews.test.ts). See project_rn_create_pool_flow.
//
// ⚠ Never summed points, anywhere: all-time is seasons · titles · best finish.
// ⚠ Last Man Standing has no rank — a finish of `null` reads "Played", never "—th".

export type CrewRole = 'captain' | 'co_captain' | 'member';

export type Person = {
  userId: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  /** What MemberAvatar composes a face from; null for someone who hasn't built one. */
  avatarBuild: unknown;
  avatarColour: string | null;
};

export type CrewCard = {
  crewId: string;
  name: string;
  people: number;
  seasons: number;
  since: string;
  status:
    | { kind: 'seat'; poolId: string; competition: string; firstLockAt: string }
    | { kind: 'live'; poolId: string; competition: string }
    | { kind: 'quiet'; poolId: string | null; competition: string | null }
    /** Its captain disbanded it (157) — only that captain sees the card, to restore it. */
    | { kind: 'disbanded'; at: string };
  leader: (Person & { titles: number }) | null;
  me: { position: number | null; titles: number; seasons: number };
  /** Up to three faces — captain first. */
  faces: Person[];
};

export type PoolMode = { predictionMode: string; leagueMode: string | null };
export type SeatState = 'open' | 'taken' | 'declined' | 'released' | 'expired';

export type CrewDetail = {
  /** `disbandedAt` is set only on the captain's view of a crew they disbanded — read-only, Restore. */
  crew: { crewId: string; name: string; createdAt: string; disbandedAt: string | null };
  viewer: {
    role: CrewRole | null;
    active: boolean;
    canManage: boolean;
    canSetCoCaptain: boolean;
    canRejoin: boolean;
    /** The captain alone. */
    canDisband: boolean;
    /** The captain, on a crew they disbanded. */
    canRestore: boolean;
  };
  members: (Person & { role: CrewRole; joinedAt: string })[];
  playingNow: {
    poolId: string;
    poolName: string;
    competition: string;
    leagueSeasonId: string | null;
    tournamentId: string;
    mode: PoolMode;
    players: number;
    runBy: Person;
    viewerIn: boolean;
    viewerRank: number | null;
    joinable: boolean;
    firstLockAt: string | null;
    seat: SeatState | null;
  }[];
  pastSeasons: {
    poolId: string;
    poolName: string;
    competition: string;
    mode: PoolMode;
    finishedAt: string;
    players: number;
    winners: Person[];
    viewerRank: number | null;
  }[];
  allTime: (Person & { seasons: number; titles: number; best: number | null })[];
  /** Pools the viewer runs that could join this crew's history — captain/co-captain only, else null. */
  linkable: LinkablePool[] | null;
  invites: { inviteId: string; invitee: Person | null; email: string | null; createdAt: string }[] | null;
};

export type LinkablePool = {
  poolId: string;
  poolName: string;
  competition: string;
  mode: PoolMode;
  /** Players in the pool — every one already in the crew. */
  players: number;
  finished: boolean;
};

export type PoolCrewView = {
  crew: { crewId: string; name: string } | null;
  inPool: number;
  saved: number;
  firstLockAt: string | null;
  /** Names of who's still pending — present for the pool's admin only. */
  pending: Person[] | null;
};

export type RosterView = {
  rows: (Person & { reasons: string[]; ticked: boolean })[];
  spots: number | null;
  over: number;
  memberCap: number | null;
};

// ── Words ───────────────────────────────────────────────────────────────────

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function personName(p: Pick<Person, 'fullName' | 'username'> | null | undefined): string {
  return p?.fullName?.trim() || p?.username?.trim() || 'Someone';
}

/** First name only, for tight places ("Dave leads all-time"). */
export function shortName(p: Pick<Person, 'fullName' | 'username'> | null | undefined): string {
  const full = personName(p);
  return full.split(/\s+/)[0] ?? full;
}

export function roleLabel(role: CrewRole | null | undefined): string | null {
  if (role === 'captain') return 'Captain';
  if (role === 'co_captain') return 'Co-captain';
  return null;
}

/** "Jun 2026". */
export function monthYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The card's second line: "14 people · 3 seasons since Jun 2026". */
export function crewSummary(c: Pick<CrewCard, 'people' | 'seasons' | 'since'>): string {
  const since = monthYear(c.since);
  return [plural(c.people, 'person', 'people'), c.seasons ? plural(c.seasons, 'season') : 'no seasons yet']
    .join(' · ')
    .concat(since ? ` since ${since}` : '');
}

/** The status chip. Something to act on, then something happening, then the last season. */
export function crewStatusText(s: CrewCard['status']): string {
  if (s.kind === 'seat') return `Your spot’s saved · ${s.competition}`;
  if (s.kind === 'live') return `Playing now · ${s.competition}`;
  if (s.kind === 'disbanded') return 'Disbanded · only you can see this';
  return s.competition ? `Last played ${s.competition}` : 'No seasons yet';
}

/** "Dave leads all-time" / "You lead all-time" — null until a season has finished with ranks. */
export function leaderText(c: Pick<CrewCard, 'leader'>, viewerId: string | null): string | null {
  if (!c.leader) return null;
  if (c.leader.userId === viewerId) return 'You lead all-time';
  return `${shortName(c.leader)} leads all-time`;
}

/** "You're 4th all-time" — null until the viewer has a ranked finish. */
export function meText(c: Pick<CrewCard, 'me'>): string | null {
  if (c.me.position === null) return null;
  return c.me.position === 1 ? 'You’re top all-time' : `You’re ${ordinal(c.me.position)} all-time`;
}

/** "3rd of 12", or "Played" when the mode has no rank (Last Man Standing). */
export function finishText(rank: number | null, players: number): string {
  if (rank === null) return 'Played';
  return players > 0 ? `${ordinal(rank)} of ${players}` : ordinal(rank);
}

/** "Won by Dave", "Won by Dave and Priya", "" when nobody has a rank. */
export function winnersText(winners: Pick<Person, 'fullName' | 'username'>[]): string {
  if (winners.length === 0) return '';
  const names = winners.map(shortName);
  return `Won by ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}`;
}

/** The Profile hub tile's teaser. */
export function crewsTeaser(cards: Pick<CrewCard, 'name'>[] | null): string {
  if (!cards || cards.length === 0) return 'The people you keep playing with';
  if (cards.length === 1) return cards[0].name;
  return `${cards[0].name} and ${plural(cards.length - 1, 'more', 'more')}`;
}

/** Who leads after someone leaves — for the Leave confirmation. */
export function leaveConsequence(d: Pick<CrewDetail, 'viewer' | 'members'>): string {
  if (d.viewer.role !== 'captain') return 'Your history stays, and you can rejoin from here any time.';
  const others = d.members.filter((m) => m.role !== 'captain');
  if (others.length === 0) return 'You’re the last one in it, so the crew will close. Its history stays.';
  const co = others.find((m) => m.role === 'co_captain');
  const next = co ?? [...others].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))[0];
  return `${shortName(next)} will become captain${co ? '' : ' — the longest-standing member'}. Your history stays.`;
}

/** Linking a pool you run (2026-10-03) — the confirmation. Mirrored by lib/crews/words.ts. */
export const LINK_CONSEQUENCE =
  'Its seasons count in the crew’s history, and anyone in the crew can join it from here. A pool stays with its crew for good, and crew pools are private.';

/** Under "Also playing together". */
export const LINK_HINT = 'Pools you run where everyone playing is in the crew — all of it, or just some of you. Linking adds the season to its history; nobody new joins.';

/** "Same 3 people as the crew" / "2 of the crew’s 3". */
export function linkablePeopleText(players: number, crewSize: number): string {
  return players >= crewSize ? `Same ${plural(players, 'person', 'people')} as the crew` : `${players} of the crew’s ${crewSize}`;
}

/** Disband's confirmation — said before the tap (157). Mirrored by lib/crews/words.ts on the web. */
export const DISBAND_CONSEQUENCE =
  'It disappears for everyone in it. Saved spots nobody has taken are released, and pools already running carry on as ordinary pools. You can restore it later from My Crews.';

/** What the captain sees on a crew they disbanded (157). */
export const DISBANDED_NOTICE =
  'Nobody else can see it. Restore it and everyone’s back as they were — saved spots that were released stay released.';

/**
 * What the captain sees before pressing Invite on an email — the email's own first line.
 * ⚠ MIRRORS the server's `invitePreview` (lib/crews/notify.ts), which owns the wording; mobile is a
 * separate project and cannot import it. Change both together.
 */
export function invitePreviewText(inviter: string, crewName: string): string {
  return `${inviter} asked us to invite you to ${crewName} on SportPool…`;
}

