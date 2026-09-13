import { Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { Icon, Text } from '@/components/ui';
import type { DossierResponse, ScoutDuelRecord } from '@/lib/api';
import type { ScoutTone } from '@/lib/scoutTone';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

import { ScoutCard, useScoutPalette } from './kit';

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
//
// ## ⚠⚠ EVERY ABSENCE TEST IS `== null`, NEVER `=== null`
//
// This card shipped with `!== null` throughout and rendered **"of undefined in
// the pool"** and **"NaN since last week"** the first time it met an API that
// did not yet carry the fields. `undefined !== null` is TRUE, so a missing key
// sailed through a check written to stop a missing value.
//
// The route always sends these now, so in a matched build the strict form would
// have been correct — which is exactly why it is the wrong thing to rely on. A
// phone outlives the deploy it was built against: an OTA bundle can be newer
// than the API it calls, `EXPO_PUBLIC_API_BASE_URL` can point at a stale
// server, and a member on an old build calls a new one. `== null` costs nothing
// and covers all three.
//
// ⚠ AND THE ARITHMETIC IS GUARDED SEPARATELY. `Math.abs(undefined - 1)` is NaN,
// which React renders happily as the string "NaN" — no crash, no warning, just
// a wrong word on the screen. `Number.isFinite` is what stops that reaching the
// render, not the null check upstream of it.
// =============================================================

export function StandingCard({ data }: { data: DossierResponse }) {
  const theme = useTheme();
  const s = data.standing;
  if (!s) return null;

  const duels = s.duels;
  // ⚠ A pool with no rank and no duels has nothing to stand on — in practice a
  // World Cup pool or an entry the engine has not reached. Say nothing rather
  // than draw a frame around a dash.
  if (s.rank == null && !duels) return null;

  return (
    <ScoutCard
      title={data.is_self ? 'Where you stand' : 'Where they stand'}
      scope="This pool"
    >

      {/* ---- position -------------------------------------------------- */}
      {s.rank != null ? (
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
              {s.pool_size != null ? `of ${s.pool_size} in the pool` : 'in the pool'}
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
      {duels ? <DuelBlock duels={duels} hasRank={s.rank != null} /> : null}
    </ScoutCard>
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
  const palette = useScoutPalette();
  // ⚠⚠ `== null`, WHICH CATCHES `undefined` TOO — see the file header. This
  // read `=== null` and rendered "NaN since last week" against an API that had
  // not yet been redeployed with the field.
  if (from == null || !Number.isFinite(from) || from === to) return null;

  // A LOWER rank number is a better position, so a fall in the number is a climb.
  const climbed = to < from;
  const places = Math.abs(from - to);
  // ⚠ A CLIMB IS A `win` AND A FALL IS A `loss` — the grammar's outcome tones.
  // They are the right ones: this is a result that happened to them, not a
  // judgement the screen is making.
  const tone = palette[climbed ? 'win' : 'loss'];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon name={climbed ? 'arrow.up' : 'arrow.down'} size={11} tint={tone.fg} />
      <RNText
        style={{
          fontFamily: MONO_BOLD,
          fontSize: 11,
          color: tone.fg,
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
  const palette = useScoutPalette();
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
            <DuelTally value={duels.won} label="won" tone="win" />
            <DuelTally value={duels.tied} label="tied" tone="draw" />
            <DuelTally value={duels.lost} label="lost" tone="loss" />
            {/* ⚠ ONLY WHEN THERE ARE ANY. An odd-sized pool gives everybody a
                bye eventually; an even one never does, and a permanent "0 byes"
                column would be dead space in half of all pools. */}
            {duels.byes > 0 ? (
              <DuelTally value={duels.byes} label={duels.byes === 1 ? 'bye' : 'byes'} tone="draw" />
            ) : null}

            <View style={{ flex: 1 }} />

            <View style={{ alignItems: 'flex-end' }}>
              <RNText
                style={{
                  fontFamily: MONO_BOLD,
                  fontSize: 16,
                  // ⚠ THE FINDING OF THIS BLOCK. Duel points are what the
                  // Showdown ladder is decided on; the W/T/L tallies beside them
                  // are how they were earned.
                  color: palette.finding.fg,
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

          <DuelForm form={duels.form} />
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
function DuelForm({ form }: { form: ScoutDuelRecord['form'] }) {
  const theme = useTheme();
  const palette = useScoutPalette();
  if (form.length === 0) return null;

  const last = form.slice(-5);
  // ⚠ A DUEL'S VOCABULARY IS NOT A FIXTURE'S. won/tied/lost map onto the outcome
  // tones cleanly, but a BYE has its own letter: drawn as a tie it would claim a
  // contest that never happened, and the two are worth the same points (250
  // each, which is exactly why a bye counted by value looks like a draw).
  const tone = {
    won: { ...palette.win, letter: 'W' },
    tied: { ...palette.draw, letter: 'T' },
    lost: { ...palette.loss, letter: 'L' },
    bye: { fg: palette.draw.fg, tint: withOpacity(palette.draw.fg, 0.08), letter: '–' },
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
              backgroundColor: tone[r].tint,
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

function DuelTally({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: ScoutTone;
}) {
  const theme = useTheme();
  const palette = useScoutPalette();
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <RNText
        style={{
          fontFamily: MONO_BOLD,
          fontSize: 18,
          // ⚠ A ZERO EARNS NO COLOUR. "0 won" in green reads as a result.
          color: value > 0 ? palette[tone].fg : theme.colors.slate,
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
