// Pre-auth onboarding pager content. Screens 1 and 2 (Problem, Solution)
// are stable — they sell what the app does at the highest level and aren't
// expected to change often. Screen 3 (Three ways to play) is the volatile
// slot: as the product expands beyond a single tournament to multi-sport,
// the cards and copy will swap entirely. Keep this file the single source
// of truth so updating screen 3 is one edit.
//
// Schema is intentionally minimal so a future remote-config / Supabase-
// backed version can hydrate the same shape without touching the renderer.
// Icons are imported directly from hugeicons so changing visuals lives in
// the same file as changing copy — no string-to-icon map to keep in sync.

import {
  AnalyticsUpIcon,
  BubbleChatIcon,
  ChampionIcon,
  ChartBarLineIcon,
  ClipboardIcon,
  GitBranchIcon,
  HandHelpingIcon,
  Medal01Icon,
  Note01Icon,
  StarCircleIcon,
} from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react-native';

import type { ColorToken } from '@/theme';

export type OnboardingCard = {
  icon: IconSvgElement;
  title: string;
  body: string;
};

// Titles support a lightweight emphasis marker — wrap the punchline phrase
// in *asterisks* and the renderer paints it in the slide's accent color at
// the same weight. Keeps the data file readable; no JSX in here.
export type OnboardingSlide = {
  key: string;
  heroIcon: IconSvgElement;
  accentColor: ColorToken;
  eyebrow?: string;
  title: string;
  body: string;
  cards?: OnboardingCard[];
};

export const SLIDES: OnboardingSlide[] = [
  {
    key: 'problem',
    heroIcon: Note01Icon,
    accentColor: 'red',
    eyebrow: 'The old way',
    title: 'Office pools shouldn’t be *a second job*.',
    body: 'Sound familiar?',
    cards: [
      {
        icon: Note01Icon,
        title: 'Stale spreadsheets',
        body: 'Last updated by Mark three weeks ago. Standings? Anyone’s guess.',
      },
      {
        icon: BubbleChatIcon,
        title: 'Lost in the group chat',
        body: 'Did Sarah pick Brazil? Nobody’s scrolling that far back.',
      },
      {
        icon: HandHelpingIcon,
        title: 'You, the unpaid commissioner',
        body: 'Tallying every score, chasing every pick, every Sunday morning.',
      },
    ],
  },
  {
    key: 'solution',
    heroIcon: ChampionIcon,
    accentColor: 'primary',
    eyebrow: 'A better way',
    title: 'One place for *picks, scores, and banter*.',
    body: 'Live leaderboards, built-in banter, and bragging rights you can frame.',
    cards: [
      {
        icon: ChartBarLineIcon,
        title: 'Live leaderboard',
        body: 'Standings update the moment a match ends — no manual scoring.',
      },
      {
        icon: BubbleChatIcon,
        title: 'Built-in banter',
        body: 'Banter lives in the pool, not in a separate group chat.',
      },
      {
        icon: Medal01Icon,
        title: 'Earn badges, climb the ranks',
        body: 'Hot streaks, perfect groups, comeback wins — earn them and flex them.',
      },
    ],
  },
  {
    // SWAP TARGET — this slide is expected to be rewritten over the next
    // 12 months as the product expands to multiple competitions. Today
    // it pitches the three WC modes; once a second competition ships
    // (likely EPL Showdown per ROADMAP §3a), this slot pivots to
    // "All your tournaments in one place" with competition cards instead
    // of mode cards. Keep the schema; rewrite the content.
    key: 'modes',
    heroIcon: ClipboardIcon,
    accentColor: 'accent',
    eyebrow: 'Three ways to play',
    title: 'Pick *the mode* that fits your crew.',
    body: 'World Cup 2026 ships with three tournament styles. More to come.',
    cards: [
      {
        icon: GitBranchIcon,
        title: 'Bracket',
        body: 'Predict the entire knockout path from Round of 32 to the final.',
      },
      {
        icon: AnalyticsUpIcon,
        title: 'Progressive',
        body: 'Picks evolve match by match as the tournament unfolds.',
      },
      {
        icon: StarCircleIcon,
        title: 'Full',
        body: 'Predict every match, every group, every knockout — the full deal.',
      },
    ],
  },
];
