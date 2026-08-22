import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// =============================================================
// Confinement rules (league build, phase L2)
// =============================================================
// Three tables are being repointed over the course of the league build:
// `predictions`, `matches` and `pool_round_states`. Each ends up behind one
// module that knows whether the pool is a World Cup pool or a league pool —
// `lib/predictions/`, `lib/fixtures/` and `lib/rounds/` respectively.
//
// Those modules do not all exist yet, and 71 files still reach the tables
// directly. The rules below do NOT try to fix that today. They exist so the
// inventory cannot GROW while the build is in flight: a file not on the
// baseline that reaches one of these tables is an error.
//
// HOW TO USE THE BASELINE: entries are only ever REMOVED. When L5 repoints a
// fixture reader or L6 repoints a rounds reader, delete its line here in the
// same commit. When a list empties, delete the list and the exemption with it.
// Adding a line is never the right fix — put the query in the owning module.
// =============================================================

/** Files that reached predictions/matches/pool_round_states before the rules existed. */
const TABLE_ACCESS_BASELINE = [
  'app/admin/super/MatchesTab.tsx',
  'app/admin/super/page.tsx',
  'app/api/account/delete/route.ts',
  'app/api/admin/advance-teams/route.ts',
  'app/api/admin/match/\\[id\\]/relinquish/route.ts',
  'app/api/admin/notify-round-open/route.ts',
  'app/api/admin/pools/\\[id\\]/actions/route.ts',
  'app/api/admin/pools/\\[id\\]/route.ts',
  'app/api/admin/send-pending-reminders/route.ts',
  'app/api/admin/send-template/route.ts',
  'app/api/admin/stats/route.ts',
  'app/api/admin/users/\\[id\\]/actions/route.ts',
  'app/api/admin/users/\\[id\\]/route.ts',
  'app/api/cron/sync-fixtures/route.ts',
  'app/api/matches/\\[match_id\\]/bracket-stats/route.ts',
  'app/api/matches/\\[match_id\\]/scores/route.ts',
  'app/api/matches/\\[match_id\\]/stats/route.ts',
  'app/api/pools/\\[pool_id\\]/bonus/calculate/route.ts',
  'app/api/pools/\\[pool_id\\]/bracket-picks/calculate/route.ts',
  'app/api/pools/\\[pool_id\\]/bulk/route.ts',
  'app/api/pools/\\[pool_id\\]/entries/\\[entry_id\\]/analytics/route.ts',
  'app/api/pools/\\[pool_id\\]/entries/\\[entry_id\\]/bracket-analytics/route.ts',
  'app/api/pools/\\[pool_id\\]/entries/\\[entry_id\\]/breakdown/route.ts',
  'app/api/pools/\\[pool_id\\]/entries/\\[entry_id\\]/predictions/route.ts',
  'app/api/pools/\\[pool_id\\]/leaderboard/route.ts',
  'app/api/pools/\\[pool_id\\]/live/route.ts',
  'app/api/pools/\\[pool_id\\]/predictions/round/route.ts',
  'app/api/pools/\\[pool_id\\]/predictions/route.ts',
  'app/api/pools/\\[pool_id\\]/predictions/unlock/route.ts',
  'app/api/pools/\\[pool_id\\]/rounds/\\[round_key\\]/state/route.ts',
  'app/api/pools/\\[pool_id\\]/rounds/route.ts',
  'app/api/users/\\[user_id\\]/activity/route.ts',
  'app/dashboard/page.tsx',
  'app/play/\\[slug\\]/getTournamentSummary.ts',
  'app/pools/\\[pool_id\\]/PoolDetail.tsx',
  'app/pools/\\[pool_id\\]/page.tsx',
  'app/pools/page.tsx',
  'app/profile/page.tsx',
  'lib/analytics/entryAnalytics.ts',
  'lib/auto-archive.ts',
  'lib/auto-submit.ts',
  'lib/email/segments.ts',
  'lib/integrations/apiFootball/linkKnockoutFixtures.ts',
  'lib/integrations/apiFootball/reconcile.ts',
  'lib/integrations/apiFootball/seed.ts',
  'lib/poolData.ts',
  'lib/poolRoundStates.ts',
  'lib/push/badges.ts',
  'lib/push/match-results.ts',
  'lib/push/recaps.ts',
  'lib/push/time-based.ts',
  'lib/roundMatches.ts',
  'lib/scoring/recalculate.ts',
  'lib/scoring/shadowBrackets.ts',
  'mobile/app/pool/\\[id\\]/banter.tsx',
  'mobile/components/pool-detail/BanterSheet.tsx',
  'mobile/lib/useActivity.ts',
  'mobile/lib/useBracketPickerPredictions.ts',
  'mobile/lib/useHomeData.ts',
  'mobile/lib/useMatchDetail.ts',
  'mobile/lib/usePredictions.ts',
  'mobile/lib/useTournamentMatches.ts',
  'scripts/audit-bonuses.ts',
  'scripts/audit-podium.ts',
  'scripts/debug-entry.ts',
  'scripts/measure-tiebreak-impact.ts',
  'scripts/project-podium-rescore-impact.ts',
  'scripts/recalc-classic-podium-fix.ts',
  'scripts/verify-bulk-reveal-gate.ts',
  'scripts/verify-predicted-bracket 2.ts',
  'scripts/verify-predicted-bracket.ts',
];

/** Files that spelled a union of prediction-mode strings inline before the rules existed. */
const MODE_UNION_BASELINE = [
  'app/api/admin/branded-pools/route.ts',
  'app/api/pools/\\[pool_id\\]/bonus/calculate/route.ts',
  'app/api/pools/\\[pool_id\\]/entries/\\[entry_id\\]/breakdown/route.ts',
  'app/api/pools/create/route.ts',
  'app/dashboard/DashboardClient.tsx',
  'app/pools/PoolsClient.tsx',
  'app/pools/\\[pool_id\\]/AnalyticsTab.tsx',
  'app/pools/\\[pool_id\\]/HowToPlayModal.tsx',
  'app/pools/\\[pool_id\\]/HowToPlayTab.tsx',
  'app/pools/\\[pool_id\\]/LeaderboardTab.tsx',
  'app/pools/\\[pool_id\\]/PointsBreakdownModal.tsx',
  'app/pools/\\[pool_id\\]/PoolDetail.tsx',
  'app/pools/\\[pool_id\\]/ResultsTab.tsx',
  'app/pools/\\[pool_id\\]/ScoringRulesTab.tsx',
  'app/pools/\\[pool_id\\]/community/types.ts',
  'app/pools/\\[pool_id\\]/results/MatchCard.tsx',
  'app/pools/\\[pool_id\\]/results/ResultsView.tsx',
  'app/pools/\\[pool_id\\]/types.ts',
  'components/pools/CreatePoolModal.tsx',
  'lib/competitionRounds.ts',
  'lib/predictionMode.ts',
  'lib/scoring/recalculate.ts',
  'lib/scoring/shadowBrackets.ts',
  'lib/scoring/types.ts',
  'mobile/components/pools/DiscoverContent.tsx',
  'mobile/components/pools/PoolsFilterBar.tsx',
  'mobile/lib/api.ts',
];

/** The modules that are ALLOWED to talk to each table — the whole point of the rules. */
const TABLE_OWNERS = [
  'lib/predictions/**',
  'lib/fixtures/**',
  'lib/rounds/**',
  'lib/migrations/**',
];

const tableRule = (table, owner) => ({
  selector: `CallExpression[callee.property.name='from'] > Literal[value='${table}']`,
  message:
    `Direct .from('${table}') is confined to ${owner}. That module decides whether the pool ` +
    `is a World Cup pool or a league pool; a query here cannot, and will silently read the ` +
    `wrong competition's rows. Call ${owner} instead.`,
});

const MODE_STRINGS = ['full_tournament', 'progressive', 'bracket_picker', 'league_pickem'];

const modeUnionRules = MODE_STRINGS.map((mode) => ({
  selector: `TSUnionType > TSLiteralType > Literal[value='${mode}']`,
  message:
    'Inline unions of prediction-mode strings drift. Every one of them omitted ' +
    "'league_pickem', so league pools were cast into unions they are not members of. " +
    "Import PredictionMode (or BracketPredictionMode) from '@/lib/predictionMode'.",
}));

const CONFINEMENT_RULES = [
  tableRule('predictions', 'lib/predictions/'),
  tableRule('matches', 'lib/fixtures/'),
  tableRule('pool_round_states', 'lib/rounds/'),
  ...modeUnionRules,
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: { "no-restricted-syntax": ["error", ...CONFINEMENT_RULES] },
  },

  // The owning modules, and the file that declares the mode type, are exempt by design.
  {
    files: [...TABLE_OWNERS, 'lib/predictionMode.ts'],
    rules: { "no-restricted-syntax": "off" },
  },

  // Pre-existing sites. Shrinks as the build repoints them; never grows.
  {
    files: [...TABLE_ACCESS_BASELINE, ...MODE_UNION_BASELINE],
    rules: { "no-restricted-syntax": "off" },
  },
]);

export default eslintConfig;
