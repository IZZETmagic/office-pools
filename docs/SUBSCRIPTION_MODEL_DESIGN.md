# Subscription Model Design: Office Pools

## Overview

This document proposes a three-tier subscription model for Office Pools. The design philosophy is:

1. **Free must be genuinely fun** -- a user who never pays should still love the app
2. **Paid tiers unlock depth, not access** -- more entries, richer analytics, creator tools
3. **Pool admins are the key monetization audience** -- people who organize pools for their office, friend group, or bar are the most invested users and the most likely to pay
4. **Future features (widgets, Live Activities) slot naturally into higher tiers**

---

## Tier Structure

### Free -- "Fan"

The casual participant. Joins a friend's pool, makes predictions, checks the leaderboard. Enough to get hooked.

| Area | What's Included |
|------|-----------------|
| **Pools** | Join up to **3 pools** per tournament |
| **Pool creation** | Create **1 pool** per tournament |
| **Entries** | **1 entry** per pool (regardless of pool's `max_entries_per_user`) |
| **Prediction modes** | All three modes (full tournament, progressive, bracket picker) |
| **Leaderboard** | Full leaderboard with current rank |
| **Banter** | Read & send messages, reactions |
| **Badges & XP** | Earn badges and accumulate XP normally |
| **Notifications** | Standard push + email notifications |
| **Results** | Match results, live scores |
| **Activity feed** | Full activity feed |
| **Scoring** | Default scoring rules (no customization) |

**Rationale:** Three pools covers the typical use case (one for the office, one with friends, one public). One entry keeps it simple. All social features stay free because engagement drives retention.

---

### Plus -- "Contender" (~$3.99/mo or $24.99/yr)

The invested fan. Runs a pool for friends, wants multiple entries, and digs into the analytics.

| Area | What's Included |
|------|-----------------|
| **Pools** | Join up to **10 pools** per tournament |
| **Pool creation** | Create up to **5 pools** per tournament |
| **Entries** | Up to **5 entries** per pool |
| **Analytics** | Full entry analytics: accuracy by stage, hot/cold streaks, crowd predictions |
| **Points breakdown** | Match-by-match and bonus breakdown per entry |
| **Scoring customization** | Configure scoring rules when creating pools |
| **Pool branding** | Custom pool name, emoji, and color |
| **Banter+** | Pin messages (as admin), share predictions as cards |
| **Notifications** | Deadline countdown reminders, rank-change alerts |
| **Widgets** *(future)* | Home screen widget: next match countdown, current leaderboard rank |
| **Export** *(future)* | Export leaderboard as image for social sharing |

**Rationale:** Multiple entries are the clearest upgrade hook -- "I want a safe pick AND a bold pick." Analytics and scoring customization reward engagement. Widgets give a persistent presence on the home screen.

---

### Pro -- "Commissioner" (~$7.99/mo or $49.99/yr)

The pool organizer. Runs the office pool, the bar pool, maybe a public community pool. Wants full control and premium features.

| Area | What's Included |
|------|-----------------|
| **Pools** | **Unlimited** pools |
| **Pool creation** | **Unlimited** pool creation |
| **Entries** | Up to **10 entries** per pool (current max) |
| **Analytics+** | Superlatives, MVP tracking, pool-wide accuracy heatmaps |
| **Admin tools** | Point adjustments with audit trail, entry unlock, member removal |
| **Pool branding+** | Full brand kit: custom name, emoji, color, accent, landing URL |
| **TV Leaderboard** | Cast full-screen leaderboard to TV for watch parties |
| **Scoring** | Full scoring customization including PSO rules and stage multipliers |
| **Round management** | Progressive mode round controls (open/close/extend deadlines) |
| **Banter+** | Moderation tools, system event messages |
| **Priority notifications** | Configurable notification preferences per pool |
| **Live Activities** *(future)* | Dynamic Island: live match score vs your prediction |
| **Widgets+** *(future)* | Large widget with mini-leaderboard, live match card |
| **AI Insights** *(future)* | AI-generated pool recap, prediction analysis, "what-if" scenarios |
| **Data export** *(future)* | Export full pool data (CSV/PDF) for record-keeping |
| **Custom themes** *(future)* | Pool visual themes (dark, classic, team-branded) |
| **Watch parties** *(future)* | Enhanced live match experience with group reactions |

**Rationale:** The Commissioner pays because they're the one organizing, promoting, and managing the pool. They need admin tools, branding, and the TV mode. Future features like Live Activities and AI Insights are high-perceived-value differentiators.

---

## Feature Matrix (Summary)

| Feature | Fan (Free) | Contender (Plus) | Commissioner (Pro) |
|---------|:----------:|:-----------------:|:------------------:|
| Pools joined | 3 | 10 | Unlimited |
| Pools created | 1 | 5 | Unlimited |
| Entries per pool | 1 | 5 | 10 |
| All prediction modes | Yes | Yes | Yes |
| Leaderboard | Yes | Yes | Yes |
| Banter (chat) | Yes | Yes | Yes |
| Badges & XP | Yes | Yes | Yes |
| Push notifications | Basic | Enhanced | Full control |
| Entry analytics | -- | Yes | Yes |
| Points breakdown | -- | Yes | Yes |
| Crowd predictions | -- | Yes | Yes |
| Streak tracking | -- | Yes | Yes |
| Scoring customization | -- | Yes | Full |
| Pool branding | -- | Basic | Full |
| Pin messages | -- | Yes | Yes |
| Share predictions | -- | Yes | Yes |
| Admin tools (adjustments) | -- | -- | Yes |
| Entry unlock | -- | -- | Yes |
| Round management | -- | -- | Yes |
| TV leaderboard | -- | -- | Yes |
| Moderation tools | -- | -- | Yes |
| Widgets *(future)* | -- | Basic | Full |
| Live Activities *(future)* | -- | -- | Yes |
| AI Insights *(future)* | -- | -- | Yes |
| Data export *(future)* | -- | -- | Yes |
| Custom themes *(future)* | -- | -- | Yes |
| Watch parties *(future)* | -- | -- | Yes |

---

## Future Features: Deep Dive

### Widgets (iOS/Android)

Home screen widgets that keep users engaged between sessions.

| Widget | Size | Tier | Description |
|--------|------|------|-------------|
| **Next Match** | Small | Plus | Countdown to next kickoff with team flags |
| **My Rank** | Small | Plus | Current leaderboard position + delta arrow |
| **Live Score** | Medium | Pro | Live match score with your prediction overlay |
| **Mini Leaderboard** | Large | Pro | Top 5 standings + your position highlighted |
| **Predictions Due** | Small | Plus | Badge showing how many pools need submissions |

**Implementation notes:**
- Use WidgetKit (iOS) with TimelineProvider for periodic refresh
- Live Score widget uses ActivityKit for real-time updates
- Data fetched via App Groups shared container from main app
- Widget entitlement checked via cached subscription state

### Live Activities (iOS)

Dynamic Island and Lock Screen presence during live matches.

| Activity | Tier | Description |
|----------|------|-------------|
| **Match Tracker** | Pro | Live score on Dynamic Island, your prediction shown below |
| **Rank Watch** | Pro | Real-time rank changes as matches complete |
| **Deadline Alert** | Plus | Countdown when prediction deadline is approaching |

**Implementation notes:**
- Use ActivityKit with push token updates from backend
- Server sends Live Activity push updates via APNs `liveactivity-push-type`
- Minimal data payload: scores, your prediction, rank delta
- Auto-dismiss when match ends or deadline passes

### AI Insights

Leveraging Claude API for pool-level analysis.

| Feature | Tier | Description |
|---------|------|-------------|
| **Pool Recap** | Pro | Post-matchday narrative summary: who climbed, who fell, standout predictions |
| **Prediction Analysis** | Pro | "Your picks lean toward home teams" -- pattern analysis of user's predictions |
| **What-If Scenarios** | Pro | "If Spain beats Germany, you'd move to 3rd" -- simulation of remaining matches |
| **Matchday Preview** | Pro | AI-generated preview with crowd prediction trends and upset potential |

### Data Export

| Format | Tier | Description |
|--------|------|-------------|
| **Leaderboard image** | Plus | Shareable image of current standings for social media |
| **Pool summary PDF** | Pro | End-of-tournament recap with full stats |
| **CSV export** | Pro | Raw data export of predictions, scores, rankings |

### Watch Parties (Enhanced Social)

| Feature | Tier | Description |
|---------|------|-------------|
| **Live reactions** | Pro | Real-time emoji reactions overlaid during matches |
| **Audio rooms** | Pro | Drop-in voice chat during matches |
| **Match threads** | Pro | Auto-generated match-specific chat threads |
| **Prediction reveal** | Pro | Dramatic reveal of everyone's predictions at kickoff |

---

## Existing Features to Gate (Detailed Mapping)

These are features that **already exist** in the codebase and would move behind tier gates.

### Analytics (currently free, move to Plus+)

Files affected:
- `app/pools/[pool_id]/entries/[entry_id]/analytics/` -- entry analytics page
- `app/api/pools/[pool_id]/entries/[entry_id]/analytics/` -- analytics API
- `app/api/pools/[pool_id]/entries/[entry_id]/breakdown/` -- points breakdown API
- `components/pools/entries/EntryAnalytics.tsx` -- analytics UI
- `ios/OfficePools/Views/Pool/FormTabView.swift` -- form/analytics tab (iOS)

What to gate:
- Accuracy-by-stage breakdown
- Hot/cold streak timelines
- Crowd prediction percentages
- XP breakdown charts (badges and XP remain visible, but detailed breakdown is Plus)

What stays free:
- Total points and current rank
- Basic badge display
- XP level indicator

### Scoring Customization (currently free, move to Plus+)

Files affected:
- `components/pools/ScoringConfig.tsx` -- scoring configuration UI
- `app/api/pools/[pool_id]/settings/` -- pool settings API
- `ios/OfficePools/Views/Pool/PoolSettingsTabView.swift` -- settings (iOS)

What to gate:
- Modifying point values (exact, difference, result)
- Stage multiplier adjustments
- PSO toggle and point values
- Bonus point configuration

What stays free:
- Default scoring rules (they're well-balanced already)
- Viewing the scoring rules tab (always visible)

### Admin Tools (currently free for pool creators, move to Pro)

Files affected:
- `app/pools/[pool_id]/PoolDetail.tsx` -- adjustment modals, unlock buttons
- `app/api/pools/[pool_id]/entries/adjust/` -- point adjustment API
- `app/api/pools/[pool_id]/entries/unlock/` -- entry unlock API
- `app/api/pools/[pool_id]/members/remove/` -- member removal API
- `ios/OfficePools/Views/Pool/MemberDetailView.swift` -- admin actions (iOS)

What to gate:
- Point adjustments with audit trail
- Entry unlock for re-editing
- Member removal
- Audit log viewing

What stays free for pool creators:
- Basic pool settings (name, description, privacy)
- Viewing member list
- Pool code sharing

### Pool Branding (currently free, tiered)

Files affected:
- `components/pools/CreatePoolModal.tsx` -- brand fields in creation
- `app/api/pools/create/` -- pool creation API
- `ios/OfficePools/Views/Pool/CreatePoolView.swift` -- creation flow (iOS)

Gating:
- Free: Pool name only (no brand customization)
- Plus: Name + emoji + primary color
- Pro: Full brand kit (name, emoji, color, accent, landing URL)

### TV Leaderboard (currently accessible, move to Pro)

Files affected:
- `app/tv/` -- TV leaderboard routes
- `preview-tv-leaderboard.html` -- TV preview

Move entirely behind Pro tier. This is a premium watch-party feature.

### Progressive Round Management (currently free for admins, move to Pro)

Files affected:
- `app/api/pools/[pool_id]/rounds/` -- round state management API
- `ios/OfficePools/Views/Pool/RoundsAdminView.swift` -- round admin UI (iOS)

What to gate:
- Open/close rounds manually
- Extend round deadlines
- Complete rounds early

What stays free:
- Viewing round status
- Submitting predictions for open rounds

---

## Technical Implementation Strategy

### Subscription State

Add to the `users` table:

```sql
ALTER TABLE users ADD COLUMN subscription_tier TEXT NOT NULL DEFAULT 'free'
  CHECK (subscription_tier IN ('free', 'plus', 'pro'));
ALTER TABLE users ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'none'
  CHECK (subscription_status IN ('none', 'active', 'past_due', 'canceled', 'expired'));
ALTER TABLE users ADD COLUMN subscription_platform TEXT
  CHECK (subscription_platform IN ('stripe', 'apple', 'google'));
ALTER TABLE users ADD COLUMN subscription_external_id TEXT;
ALTER TABLE users ADD COLUMN subscription_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN subscription_created_at TIMESTAMPTZ;
```

### Feature Gate Middleware (Web)

```typescript
// lib/subscriptions/gates.ts

export type SubscriptionTier = 'free' | 'plus' | 'pro';

export const TIER_LIMITS = {
  free:  { maxPoolsJoined: 3,  maxPoolsCreated: 1,  maxEntriesPerPool: 1  },
  plus:  { maxPoolsJoined: 10, maxPoolsCreated: 5,  maxEntriesPerPool: 5  },
  pro:   { maxPoolsJoined: -1, maxPoolsCreated: -1, maxEntriesPerPool: 10 },
} as const;

export const FEATURE_ACCESS = {
  analytics:              ['plus', 'pro'],
  pointsBreakdown:        ['plus', 'pro'],
  crowdPredictions:       ['plus', 'pro'],
  scoringCustomization:   ['plus', 'pro'],
  poolBrandingBasic:      ['plus', 'pro'],
  poolBrandingFull:       ['pro'],
  adminTools:             ['pro'],
  entryUnlock:            ['pro'],
  roundManagement:        ['pro'],
  tvLeaderboard:          ['pro'],
  pinMessages:            ['plus', 'pro'],
  sharePredictions:       ['plus', 'pro'],
  widgets:                ['plus', 'pro'],
  liveActivities:         ['pro'],
  aiInsights:             ['pro'],
  dataExport:             ['pro'],
} as const;

export function hasFeature(
  tier: SubscriptionTier, feature: keyof typeof FEATURE_ACCESS
): boolean {
  return FEATURE_ACCESS[feature].includes(tier);
}

export function getTierLimits(tier: SubscriptionTier) {
  return TIER_LIMITS[tier];
}
```

### Feature Gate Check (iOS)

```swift
// ios/OfficePools/Services/SubscriptionService.swift

enum SubscriptionTier: String, Codable {
    case free, plus, pro
}

struct TierLimits {
    let maxPoolsJoined: Int      // -1 = unlimited
    let maxPoolsCreated: Int
    let maxEntriesPerPool: Int
}

extension SubscriptionTier {
    var limits: TierLimits {
        switch self {
        case .free:  return TierLimits(maxPoolsJoined: 3,  maxPoolsCreated: 1,  maxEntriesPerPool: 1)
        case .plus:  return TierLimits(maxPoolsJoined: 10, maxPoolsCreated: 5,  maxEntriesPerPool: 5)
        case .pro:   return TierLimits(maxPoolsJoined: -1, maxPoolsCreated: -1, maxEntriesPerPool: 10)
        }
    }

    func hasFeature(_ feature: Feature) -> Bool {
        feature.requiredTiers.contains(self)
    }
}
```

### Payment Integration

**Recommended approach: Dual-platform**

1. **Apple StoreKit 2** for iOS in-app subscriptions (required by App Store policy)
2. **Stripe** for web subscriptions (better margins, more flexibility)

Subscription state syncs to Supabase `users` table regardless of platform. Backend is the source of truth -- both StoreKit and Stripe webhook handlers update the same `subscription_tier` column.

### API-Level Enforcement

Feature gates should be enforced at the API level, not just UI:

```typescript
// Example: entry creation with tier check
export async function POST(req, { params }) {
  const user = await requireAuth();
  const limits = getTierLimits(user.subscription_tier);

  const entryCount = await getEntryCount(user.id, params.pool_id);
  if (limits.maxEntriesPerPool !== -1 && entryCount >= limits.maxEntriesPerPool) {
    return Response.json(
      { error: 'upgrade_required', tier: user.subscription_tier },
      { status: 403 }
    );
  }
  // ... create entry
}
```

### UI Treatment for Gated Features

Rather than hiding features, **show them with an upgrade prompt**:

- Analytics tab visible but shows a preview with a blurred overlay + "Unlock with Plus" CTA
- Entry creation button shows current/max count: "2/5 entries" with upgrade prompt when at limit
- Admin tools show lock icon with "Upgrade to Pro" tooltip
- Scoring customization fields visible but disabled with tier badge

This approach drives conversions by showing users what they're missing.

---

## Pricing Rationale

| | Monthly | Annual | Savings |
|---|---------|--------|---------|
| **Plus** | $3.99 | $24.99 | 48% |
| **Pro** | $7.99 | $49.99 | 48% |

- **Plus at $3.99/mo** is an impulse purchase -- less than a coffee. The annual at $24.99 is compelling enough to commit.
- **Pro at $7.99/mo** targets pool organizers who are already spending time/effort managing pools. They'd likely pay $50/year for a premium experience. The TV leaderboard alone justifies this for bar/watch-party hosts.
- **Aggressive annual discount (48%)** pushes users toward annual plans, improving retention and LTV.
- Consider a **tournament pass** option: one-time purchase ($9.99 Plus / $19.99 Pro) that lasts for a single tournament. This captures users who only engage during World Cup/Euros.

---

## Migration Strategy for Existing Users

Since all features are currently free, transitioning requires care:

1. **Grandfather existing pools** -- any pool created before the subscription launch keeps its current settings (scoring, branding, admin tools) for the duration of that tournament
2. **Announce early** -- communicate the change 2-3 months before the next tournament
3. **Soft launch** -- introduce tiers but keep everything unlocked for the first tournament season with "Try Plus features free during World Cup 2026" messaging
4. **Free trial** -- 14-day free trial of Plus for all users at launch
5. **Pool creator incentive** -- if you created a pool with 10+ members, get 1 month of Plus free

---

## Metrics to Track

| Metric | Purpose |
|--------|---------|
| Conversion rate (free -> plus, free -> pro) | Core business metric |
| Feature usage by tier | Validate gating decisions |
| Pools created per user (by tier) | Confirm pool limits are right |
| Entries created per user (by tier) | Confirm entry limits are right |
| Churn rate by tier | Retention health |
| Upgrade triggers (which CTA converted) | Optimize upgrade prompts |
| Revenue per tournament | Seasonal revenue tracking |
| Analytics page views (gated vs ungated) | Demand signal for Plus |
| TV leaderboard sessions | Demand signal for Pro |
