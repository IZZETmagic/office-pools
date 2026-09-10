import { Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { Icon, Text } from '@/components/ui';
import type { DossierResponse, ScoutDuelRecord } from '@/lib/api';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// Where they stand — the report's first card
// =============================================================
// Before any of the tendency cards, the two things you actually want to know
// about somebody you are about to face: where they sit, and how the last few
// have gone.
//
// ## ⚠⚠ NOTHING HERE IS RECOMPUTED. EVERY FIGURE IS THE SERVER'S ANSWER.
//
// A duel has been worth 500/250/0 since migration 121, and reading that scale
// as a literal is this codebase's most repeated bug: `headToHead` scored every
// meeting as a loss for four days, `poolCards` showed a winner as a defeat with
// a red form dot, and `DuelsTab` still carries a fallback that recomputes it.
// Three sites, one constant. This is not a fourth — `buildDuelRecords` runs on
// the server and these are its results, drawn and not checked.
//
// ⚠ A BYE IS ITS OWN OUTCOME AND GETS ITS OWN DOT. `DUEL_BYE` and `DUEL_TIE`
// are both 250, so a bye classified by value reads as a draw against an
// opponent who never existed. The server distinguishes them; so does the strip.
//
// ⚠ THE CARD IS MODE-AWARE, and the absence of duels is not a record of zeroes.
// Outside Showdown `standing.duels` is null and the duel half is simply not
// there — a "0–0–0" in a Pick'em pool would be a claim about matches that were
// never played.
// =============================================================

export function StandingCard({ data }: { data: DossierResponse }) {
  const theme = useTheme();
  const s = data.standing;
  if (!s) return null;

  const duels = s.duels;
  // ⚠ A pool with no rank and no duels has nothing to stand on — in practice a
  // World Cup pool or an entry the engine has not reached. Say nothing rather
  // than draw a frame around a dash.
  if (s.rank === null && !duels) return null;

  return (
    <View
      style={{
        marginHorizontal: 20,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        ...theme.shadows.card,
        overflow: 'hidden',
      }}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 }}>
        <Text variant="cardTitle">{data.is_self ? 'Where you stand' : 'Where they stand'}</Text>
      </View>

      {/* ---- position -------------------------------------------------- */}
      {s.rank !== null ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            paddingHorizontal: 16,
            paddingBottom: 14,
            gap: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
            <RNText
              style={{
                fontFamily: MONO_BOLD,
                fontSize: 34,
                lineHeight: 38,
                color: theme.colors.ink,
                fontVariant: ['tabular-nums'],
              }}
            >
              {s.rank}
            </RNText>
            <RNText
              style={{ fontFamily: fontFamilies.black, fontSize: 15, color: theme.colors.slate }}
            >
              {ordinalSuffix(s.rank)}
            </RNText>
          </View>

          <View style={{ flex: 1, paddingBottom: 4, gap: 3 }}>
            <Text variant="detail" color="slate">
              {s.pool_size !== null ? `of ${s.pool_size} in the pool` : 'in the pool'}
            </Text>
            <Movement from={s.previous_rank} to={s.rank} />
          </View>

          <View style={{ alignItems: 'flex-end', paddingBottom: 2 }}>
            <RNText
              style={{
                fontFamily: MONO_BOLD,
                fontSize: 18,
                color: theme.colors.ink,
                fontVariant: ['tabular-nums'],
              }}
            >
              {s.total_points}
            </RNText>
            <Text variant="detail" color="slate">
              points
            </Text>
          </View>
        </View>
      ) : null}

      {/* ---- duels ----------------------------------------------------- */}
      {duels ? <DuelBlock duels={duels} hasRank={s.rank !== null} /> : null}
    </View>
  );
}

/**
 * The arrow, or nothing.
 *
 * ⚠ NO ARROW FOR A MEMBER WITH NO PRIOR RANK. Somebody new to the board has not
 * climbed; drawing them a green arrow invents a story, which is the call
 * `duelMovement` already makes for the same reason.
 *
 * ⚠ AND NO ARROW FOR NO MOVEMENT. A grey dash beside every unmoved member is
 * noise on the majority of rows in a settled pool.
 */
function Movement({ from, to }: { from: number | null; to: number }) {
  const theme = useTheme();
  if (from === null || from === to) return null;

  // A LOWER rank number is a better position, so a fall in the number is a climb.
  const climbed = to < from;
  const places = Math.abs(from - to);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon
        name={climbed ? 'arrow.up' : 'arrow.down'}
        size={11}
        tint={climbed ? theme.colors.green : theme.colors.red}
      />
      <RNText
        style={{
          fontFamily: MONO_BOLD,
          fontSize: 11,
          color: climbed ? theme.colors.green : theme.colors.red,
          fontVariant: ['tabular-nums'],
        }}
      >
        {places}
      </RNText>
      <Text variant="detail" color="slate">
        since last week
      </Text>
    </View>
  );
}

function DuelBlock({ duels, hasRank }: { duels: ScoutDuelRecord; hasRank: boolean }) {
  const theme = useTheme();
  const played = duels.won + duels.tied + duels.lost;

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: hasRank ? 12 : 0,
        paddingBottom: 16,
        borderTopWidth: hasRank ? 0.5 : 0,
        borderTopColor: withOpacity(theme.colors.mist, 0.6),
      }}
    >
      <Text variant="caption" color="slate">
        Duels
      </Text>

      {played === 0 && duels.byes === 0 ? (
        // ⚠ A SENTENCE, NOT "0–0–0". No duel has settled yet — that is news in
        // week one, and three zeroes look like a result.
        <Text variant="body" color="slate" style={{ marginTop: 8 }}>
          No duel has settled yet.
        </Text>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 18, marginTop: 10 }}>
            <Tally value={duels.won} label="won" color={theme.colors.green} />
            <Tally value={duels.tied} label="tied" color={theme.colors.slate} />
            <Tally value={duels.lost} label="lost" color={theme.colors.red} />
            {/* ⚠ ONLY WHEN THERE ARE ANY. An odd-sized pool gives everybody a
                bye eventually; an even one never does, and a permanent "0 byes"
                column would be dead space in half of all pools. */}
            {duels.byes > 0 ? (
              <Tally value={duels.byes} label={duels.byes === 1 ? 'bye' : 'byes'} color={theme.colors.slate} />
            ) : null}

            <View style={{ flex: 1 }} />

            <View style={{ alignItems: 'flex-end' }}>
              <RNText
                style={{
                  fontFamily: MONO_BOLD,
                  fontSize: 16,
                  color: theme.colors.accent,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {duels.duel_points}
              </RNText>
              <Text variant="detail" color="slate">
                duel pts
              </Text>
            </View>
          </View>

          <FormStrip form={duels.form} />
        </>
      )}
    </View>
  );
}

/**
 * The last five, as they were played.
 *
 * ⚠ THE SERVER SENDS THEM OLDEST FIRST AND ORDERED BY WHEN EACH SETTLED, never
 * by matchweek number — rounds are played out of numerical order, by up to 121
 * days on real seasons. `slice(-5)` therefore takes the five most RECENT, and
 * they still read left to right in the order they happened. Do not re-sort.
 */
function FormStrip({ form }: { form: ScoutDuelRecord['form'] }) {
  const theme = useTheme();
  if (form.length === 0) return null;

  const last = form.slice(-5);
  const tone = {
    won: { bg: withOpacity(theme.colors.green, 0.18), fg: theme.colors.green, letter: 'W' },
    tied: { bg: withOpacity(theme.colors.slate, 0.18), fg: theme.colors.slate, letter: 'T' },
    lost: { bg: withOpacity(theme.colors.red, 0.18), fg: theme.colors.red, letter: 'L' },
    // ⚠ A BYE IS ITS OWN LETTER. Drawn as a tie it would claim a contest that
    // never happened, and the two are the same number of points.
    bye: { bg: withOpacity(theme.colors.slate, 0.1), fg: theme.colors.slate, letter: '–' },
  } as const;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {last.map((r, i) => (
          <View
            key={`${r}-${i}`}
            style={{
              width: 24,
              height: 24,
              borderRadius: theme.radii.xs,
              backgroundColor: tone[r].bg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RNText style={{ fontFamily: MONO_BOLD, fontSize: 11, color: tone[r].fg }}>
              {tone[r].letter}
            </RNText>
          </View>
        ))}
      </View>
      <Text variant="detail" color="slate">
        {last.length === form.length
          ? 'every duel so far'
          : `last ${last.length}, most recent right`}
      </Text>
    </View>
  );
}

function Tally({ value, label, color }: { value: number; label: string; color: string }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <RNText
        style={{
          fontFamily: MONO_BOLD,
          fontSize: 18,
          color: value > 0 ? color : theme.colors.slate,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </RNText>
      <Text variant="detail" color="slate">
        {label}
      </Text>
    </View>
  );
}

/** "st" for 1, "nd" for 2 … ⚠ 11th/12th/13th are not 11st/12nd/13rd. */
function ordinalSuffix(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return 'th';
  const ones = n % 10;
  return ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th';
}
