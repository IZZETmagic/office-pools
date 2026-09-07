// =============================================================
// 1st, 2nd, 3rd, 21st — one copy
// =============================================================
// ⚠ THERE ARE SIX OTHER COPIES OF THIS IN THE APP — `ShowdownDuelHeader`,
// `ShowdownWalkout`, `DuelTab`, `LeagueTableLeaderboard`, `app/match/[matchId]`
// and `app/pool/[id]/duel/[matchweek]` — and this is deliberately not a seventh
// inline one. They are left alone rather than swept up in unrelated work; a new
// caller should import this.
//
// ⚠ AND THE COPIES ARE SUBTLY WRONG ABOVE TWENTY. They read
//
//     n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'
//
// which yields "21th", "22th", "23th". None of them can currently reach those
// numbers — a World Cup group is four, a Premier League table is twenty — so
// the bug has never shown. It would the moment a 24-club league is imported,
// and `league_clubs` permits up to 30, so this copy does it properly.
// =============================================================

export function ordinal(n: number): string {
  // 11th, 12th and 13th are the exceptions that a units-digit rule alone gets
  // wrong — they take 'th' despite ending in 1, 2 and 3.
  const mod100 = Math.abs(n) % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (Math.abs(n) % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}
