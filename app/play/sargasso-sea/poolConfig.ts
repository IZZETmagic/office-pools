// ── Sargasso Sea branded pool configuration ──

export const POOL_CONFIG = {
  name: "Sargasso Sea World Cup Pool",
  brandName: 'Sargasso Sea',
  poolCode: '2QFVKQAL',
  poolId: 'b4402163-12cb-4de5-af24-073c52406ffb',
  status: 'open' as const,
  memberCount: 1,
  mode: 'Progressive',
  // Branding
  logoUrl: 'https://ujthamlehjyubbzxbnes.supabase.co/storage/v1/object/public/pool-logos/sargasso-sea-logo.png',
  tagline: 'Predict. Compete. Dominate.',
  primaryColor: '#1E3A8A',
  primaryGradient: 'linear-gradient(135deg, #1E3A8A 0%, #1e40af 40%, #172554 100%)',
  accentColor: '#FFC300',
  accentColorLight: '#FDE68A',
  prizes: [
    { place: '1st Place', prize: 'TBD', icon: '\u{1F3C6}', color: 'from-amber-500 to-amber-600', border: 'border-amber-200' },
    { place: '2nd Place', prize: 'TBD', icon: '\u{1F948}', color: 'from-neutral-400 to-neutral-500', border: 'border-neutral-200' },
    { place: '3rd Place', prize: 'TBD', icon: '\u{1F949}', color: 'from-amber-700 to-amber-800', border: 'border-amber-200/50' },
  ],
}
