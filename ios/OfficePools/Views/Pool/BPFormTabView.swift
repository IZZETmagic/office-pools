import SwiftUI

struct BPFormTabView: View {
    let poolId: String
    let entries: [Entry]
    let selectedEntry: Entry?
    let teams: [Team]
    let preloadedBPAnalytics: [String: BPAnalyticsResponse]

    @State private var analytics: BPAnalyticsResponse?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var selectedEntryId: String?

    private let apiService = APIService()

    private var activeEntryId: String? {
        selectedEntryId ?? selectedEntry?.entryId ?? entries.first?.entryId
    }

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading analytics...")
            } else if let error = errorMessage {
                ContentUnavailableView("Error", systemImage: "exclamationmark.triangle", description: Text(error))
            } else if let data = currentAnalytics {
                analyticsContent(data)
            } else {
                ContentUnavailableView("Analytics Coming Soon", systemImage: "chart.bar.xaxis", description: Text("Analytics will appear once matches are completed."))
            }
        }
        .task {
            if currentAnalytics == nil {
                await loadAnalytics()
            }
        }
        .onChange(of: selectedEntryId) { _, _ in
            if currentAnalytics == nil {
                Task { await loadAnalytics() }
            }
        }
    }

    private var currentAnalytics: BPAnalyticsResponse? {
        if let entryId = activeEntryId, let preloaded = preloadedBPAnalytics[entryId] {
            return preloaded
        }
        return analytics
    }

    // MARK: - Main Content

    private func analyticsContent(_ data: BPAnalyticsResponse) -> some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                Spacer().frame(height: 4)

                // Entry selector (multi-entry)
                if entries.count > 1 {
                    entrySelector
                }

                // XP Hero Card
                NavigationLink(destination: BPLevelRoadmapView(xp: data.xp)) {
                    xpHeroCard(data.xp)
                }
                .buttonStyle(.plain)

                // Bracket Badges
                if !data.xp.allBadges.isEmpty {
                    badgesSection(earned: data.xp.earnedBadges, all: data.xp.allBadges)
                }

                // You vs The Pool
                if let comparison = data.poolComparison {
                    youVsPoolSection(comparison)
                }

                // Pool-Wide Stats
                if let comparison = data.poolComparison {
                    poolWideStatsSection(comparison)
                }

                // Bonus Events
                if !data.xp.bonusEvents.isEmpty {
                    bonusEventsSection(data.xp.bonusEvents)
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 24)
        }
        .background(Color(.systemGroupedBackground))
    }

    // MARK: - XP Hero Card

    private func xpHeroCard(_ xp: BPXPData) -> some View {
        let lvlColor = levelColor(xp.currentLevel.level)

        return VStack(spacing: 16) {
            HStack(spacing: 20) {
                ZStack {
                    Circle()
                        .stroke(lvlColor.opacity(0.2), lineWidth: 6)
                        .frame(width: 72, height: 72)
                    Circle()
                        .trim(from: 0, to: xp.levelProgress)
                        .stroke(lvlColor, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                        .frame(width: 72, height: 72)
                        .rotationEffect(.degrees(-90))
                    Text("\(xp.currentLevel.level)")
                        .font(.title2.weight(.black).monospacedDigit())
                        .foregroundStyle(lvlColor)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(xp.currentLevel.name)
                        .font(.title3.weight(.bold))
                    Text("\(xp.totalXp) XP")
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                        .foregroundStyle(.secondary)
                    if let next = xp.nextLevel {
                        HStack(spacing: 4) {
                            Text("\(xp.xpToNextLevel) XP to")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(next.name)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(levelColor(next.level))
                        }
                    }
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }

            if xp.nextLevel != nil {
                xpProgressBar(xp: xp)
            }

            HStack(spacing: 0) {
                xpStat("Group", value: xp.totalGroupXp, color: Color.sp.primary)
                xpStat("Knockout", value: xp.totalKnockoutXp, color: Color.sp.green)
                xpStat("Badges", value: xp.totalBadgeXp, color: Color.sp.xpBadge)
            }
        }
        .padding(16)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    private func xpProgressBar(xp: BPXPData) -> some View {
        let lvlColor = levelColor(xp.currentLevel.level)
        return GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color(.systemGray5))
                    .frame(height: 8)
                Capsule()
                    .fill(lvlColor)
                    .frame(width: max(geo.size.width * xp.levelProgress, 8), height: 8)
            }
        }
        .frame(height: 8)
    }

    private func xpStat(_ title: String, value: Int, color: Color) -> some View {
        VStack(spacing: 2) {
            Text("\(value)")
                .font(.subheadline.weight(.bold).monospacedDigit())
                .foregroundStyle(color)
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Entry Selector

    private var entrySelector: some View {
        HStack {
            Text("Entry")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            Picker("Entry", selection: Binding(
                get: { activeEntryId ?? "" },
                set: { selectedEntryId = $0 }
            )) {
                ForEach(entries) { entry in
                    Text(entry.entryName)
                        .tag(entry.entryId)
                }
            }
            .pickerStyle(.menu)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    // MARK: - Badges

    private func badgesSection(earned: [BadgeInfo], all: [BadgeInfo]) -> some View {
        let earnedIds = Set(earned.map { $0.id })
        let sorted = all.sorted { a, b in
            let aEarned = earnedIds.contains(a.id)
            let bEarned = earnedIds.contains(b.id)
            if aEarned != bEarned { return aEarned }
            return false
        }

        return VStack(alignment: .leading, spacing: 0) {
            sectionHeader("Bracket Badges", subtitle: "\(earned.count)/\(all.count) earned")

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(sorted) { badge in
                        let isEarned = earnedIds.contains(badge.id)
                        badgeCell(badge, earned: isEarned)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    private func badgeCell(_ badge: BadgeInfo, earned: Bool) -> some View {
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .fill(earned ? rarityColor(badge.rarity).opacity(0.15) : Color(.systemGray5))
                    .frame(width: 44, height: 44)

                if earned {
                    Image(systemName: bpBadgeIcon(badge.id))
                        .font(.system(size: 18))
                        .foregroundStyle(rarityColor(badge.rarity))
                } else {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(.tertiary)
                }
            }

            Text(badge.name)
                .font(.system(size: 9, weight: .medium))
                .foregroundStyle(earned ? .primary : .tertiary)
                .lineLimit(1)

            Text("+\(badge.xpBonus) XP")
                .font(.system(size: 8))
                .foregroundStyle(earned ? rarityColor(badge.rarity) : Color(.systemGray4))
        }
    }

    private func bpBadgeIcon(_ id: String) -> String {
        switch id {
        case "bp_cartographer": return "map.fill"
        case "bp_world_map": return "globe"
        case "bp_bracket_prophet": return "eye.fill"
        case "bp_architect": return "building.2.fill"
        case "bp_sniper": return "scope"
        case "bp_final_four": return "trophy.fill"
        case "bp_perfect_bracket": return "star.fill"
        case "bp_upset_specialist": return "exclamationmark.triangle.fill"
        case "bp_group_guardian": return "shield.fill"
        case "bp_quick_draw": return "bolt.fill"
        case "bp_full_bracket": return "checklist"
        default: return "star.fill"
        }
    }

    // MARK: - You vs The Pool

    private func youVsPoolSection(_ comparison: BPPoolComparisonData) -> some View {
        let accuracyDiff = comparison.userOverallAccuracy - comparison.poolAvgOverallAccuracy
        let isOutperforming = accuracyDiff > 0

        return VStack(spacing: 0) {
            vsFaceoff(userAccuracy: comparison.userOverallAccuracy, poolAccuracy: comparison.poolAvgOverallAccuracy)
            categoryBattleBars(comparison)
            contrarianBars(comparison)
            performanceCallout(accuracyDiff: accuracyDiff, isOutperforming: isOutperforming, contrarianCount: comparison.contrarianCount)
                .padding(.horizontal, 18)
                .padding(.bottom, 18)
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    private func vsFaceoff(userAccuracy: Int, poolAccuracy: Int) -> some View {
        HStack(spacing: 0) {
            VStack(spacing: 4) {
                Text("YOU")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(0.8)
                    .foregroundStyle(Color.sp.primary)
                Text("\(userAccuracy)%")
                    .font(.system(size: 32, weight: .heavy, design: .rounded))
                    .foregroundStyle(Color.sp.primary)
            }
            .frame(maxWidth: .infinity)

            ZStack {
                Circle()
                    .strokeBorder(Color(.systemGray4), lineWidth: 1)
                    .frame(width: 36, height: 36)
                Text("VS")
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 4) {
                Text("POOL AVG")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(0.8)
                    .foregroundStyle(.purple)
                Text("\(poolAccuracy)%")
                    .font(.system(size: 32, weight: .heavy, design: .rounded))
                    .foregroundStyle(Color(.systemGray))
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 18)
        .padding(.top, 18)
        .padding(.bottom, 20)
    }

    private func categoryBattleBars(_ c: BPPoolComparisonData) -> some View {
        VStack(spacing: 16) {
            if c.userGroupTotal > 0 {
                battleBar(label: "Group Positions", you: c.userGroupCorrect, crowd: Int(round(c.poolAvgGroupCorrect)))
            }
            if c.userKnockoutTotal > 0 {
                battleBar(label: "Knockout Picks", you: c.userKnockoutCorrect, crowd: Int(round(c.poolAvgKnockoutCorrect)))
            }
            if c.userThirdTotal > 0 {
                battleBar(label: "Third Place Table", you: c.userThirdCorrect, crowd: Int(round(c.poolAvgThirdCorrect)))
            }
        }
        .padding(.horizontal, 18)
        .padding(.bottom, 18)
    }

    @ViewBuilder
    private func contrarianBars(_ c: BPPoolComparisonData) -> some View {
        if c.consensusCount + c.contrarianCount > 0 {
            VStack(alignment: .leading, spacing: 12) {
                Text("BRACKET BOLDNESS")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(0.8)
                    .foregroundStyle(.tertiary)

                battleBar(label: "Consensus Picks", you: c.consensusCount, crowd: c.poolAvgConsensus)
                battleBar(label: "Contrarian Picks", you: c.contrarianCount, crowd: c.poolAvgContrarian)
                battleBar(label: "Contrarian Wins", you: c.contrarianWins, crowd: c.poolAvgContrarianWins)
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 18)
        }
    }

    private func battleBar(label: String, you: Int, crowd: Int) -> some View {
        let total = you + crowd
        let youPct = total > 0 ? Double(you) / Double(total) : 0.5

        return VStack(spacing: 5) {
            HStack {
                Text(label)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(you) vs \(crowd)")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(Color(.systemGray3))
            }

            GeometryReader { geo in
                HStack(spacing: 2) {
                    Capsule()
                        .fill(LinearGradient(colors: [Color.sp.primary, Color.sp.primary.opacity(0.7)], startPoint: .leading, endPoint: .trailing))
                        .frame(width: max(geo.size.width * youPct - 1, 2))
                    Spacer(minLength: 0)
                    Capsule()
                        .fill(LinearGradient(colors: [.purple.opacity(0.5), .purple], startPoint: .leading, endPoint: .trailing))
                        .frame(width: max(geo.size.width * (1 - youPct) - 1, 2))
                }
            }
            .frame(height: 6)
        }
    }

    private func performanceCallout(accuracyDiff: Int, isOutperforming: Bool, contrarianCount: Int) -> some View {
        let accentColor = isOutperforming ? Color.sp.green : Color.sp.primary
        let iconName = isOutperforming ? "chart.line.uptrend.xyaxis" : "target"
        let title: String = {
            if isOutperforming { return "Outperforming the pool by \(accuracyDiff)%" }
            return accuracyDiff == 0 ? "Neck and neck with the pool" : "The pool has a slight edge"
        }()
        let subtitle: String? = {
            if isOutperforming { return nil }
            return accuracyDiff == 0 ? "You're matching the pool average perfectly" : "Only \(abs(accuracyDiff))% behind \u{2014} one bold call could flip it"
        }()

        return HStack(alignment: .top, spacing: 8) {
            Image(systemName: iconName)
                .font(.system(size: 16))
                .foregroundStyle(accentColor)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(accentColor)
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
        }
        .padding(12)
        .background(
            LinearGradient(
                colors: [accentColor.opacity(0.08), .clear],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .strokeBorder(accentColor.opacity(0.13), lineWidth: 1)
        )
    }

    // MARK: - Pool-Wide Stats

    private func poolWideStatsSection(_ comparison: BPPoolComparisonData) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Pool-Wide Stats")
                .font(.system(size: 15, weight: .bold))
                .padding(.horizontal, 18)
                .padding(.top, 18)
                .padding(.bottom, 14)

            poolStatsSummaryRow(comparison)
            poolChampionRow(comparison)
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    private func poolStatsSummaryRow(_ comparison: BPPoolComparisonData) -> some View {
        HStack(spacing: 0) {
            poolStatCell("\(comparison.poolAvgOverallAccuracy)%", label: "Avg Accuracy")
            poolStatCell("\(comparison.totalEntries)", label: "Competitors")
            poolStatCell("\(comparison.totalScoredPicks)", label: "Picks Scored")
        }
        .padding(.horizontal, 18)
        .padding(.bottom, 16)
    }

    private func poolStatCell(_ value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.title2.weight(.heavy).monospacedDigit())
            Text(label)
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func poolChampionRow(_ comparison: BPPoolComparisonData) -> some View {
        let teamMap = Dictionary(uniqueKeysWithValues: teams.map { ($0.teamId, $0) })
        if let champ = comparison.mostPopularChampion, let team = teamMap[champ.teamId] {
            championCard(team: team, pct: champ.pct)
                .padding(.horizontal, 18)
                .padding(.bottom, 18)
        }
    }

    private func championCard(team: Team, pct: Double) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("POOL'S FAVORITE CHAMPION")
                .font(.system(size: 10, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(.tertiary)

            HStack(spacing: 12) {
                if let flagUrl = team.flagUrl, let url = URL(string: flagUrl) {
                    AsyncImage(url: url) { image in
                        image.resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 32, height: 24)
                            .clipShape(RoundedRectangle(cornerRadius: 2))
                    } placeholder: {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color(.systemGray5))
                            .frame(width: 32, height: 24)
                    }
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(team.countryName)
                        .font(.subheadline.weight(.semibold))
                    Text("\(Int(round(pct * 100)))% of brackets")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Text("👑")
                    .font(.title2)
            }
        }
    }

    // MARK: - Bonus Events

    private func bonusEventsSection(_ events: [BPBonusEvent]) -> some View {
        let totalBonusXP = events.reduce(0) { $0 + $1.xp }

        return VStack(alignment: .leading, spacing: 0) {
            sectionHeader("Bonus Events", subtitle: "\(totalBonusXP) XP")

            VStack(spacing: 6) {
                ForEach(events) { event in
                    HStack(spacing: 12) {
                        Text(event.emoji)
                            .font(.title3)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(event.label)
                                .font(.caption.weight(.semibold))
                            if let detail = event.detail {
                                Text(detail)
                                    .font(.system(size: 10))
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                        }

                        Spacer()

                        Text("+\(event.xp) XP")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Color.sp.accent)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(
                        LinearGradient(
                            colors: [Color.sp.accent.opacity(0.06), .clear],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 14)
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    // MARK: - Shared Helpers

    private func sectionHeader(_ title: String, subtitle: String? = nil) -> some View {
        HStack {
            Text(title)
                .font(.subheadline.weight(.semibold))
            Spacer()
            if let subtitle {
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func levelColor(_ level: Int) -> Color {
        Color.sp.levelColor(level)
    }

    private func rarityColor(_ rarity: String) -> Color {
        Color.sp.rarityColor(rarity)
    }

    // MARK: - Data Loading

    private func loadAnalytics() async {
        guard let entryId = activeEntryId else { return }
        isLoading = true
        errorMessage = nil
        do {
            analytics = try await apiService.fetchBracketAnalytics(poolId: poolId, entryId: entryId)
            isLoading = false
        } catch let apiError as APIError {
            isLoading = false
            // 404 means no completed matches yet — show "coming soon" state (analytics stays nil)
            if case .serverError(let code, _) = apiError, code == 404 {
                analytics = nil
            } else {
                errorMessage = apiError.localizedDescription
                print("[BPFormTab] Error loading bracket analytics: \(apiError)")
            }
        } catch {
            // Decoding errors also mean no valid data yet
            analytics = nil
            isLoading = false
            print("[BPFormTab] Error loading bracket analytics: \(error)")
        }
    }
}

// MARK: - Level Roadmap Page (Bracket Picker)

struct BPLevelRoadmapView: View {
    let xp: BPXPData
    @State private var headerHeight: CGFloat = 100

    var body: some View {
        ZStack(alignment: .top) {
            ScrollView {
                VStack(spacing: 12) {
                    Color.clear.frame(height: headerHeight + 8)
                    ForEach(xp.levels) { level in
                        levelRow(level)
                    }
                    xpBreakdownFooter
                }
                .padding(.horizontal)
                .padding(.bottom, 24)
            }
            .background(Color(.systemGroupedBackground))

            stickyHeader
        }
        .navigationTitle("Level Roadmap")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func levelRow(_ level: LevelInfo) -> some View {
        let isReached = xp.totalXp >= level.xpRequired
        let isCurrent = level.level == xp.currentLevel.level
        let nameColor: Color = isCurrent ? Color.sp.accent : isReached ? Color(.label) : Color(.secondaryLabel)
        let xpColor: Color = isCurrent ? Color.sp.accent : isReached ? Color.sp.green : Color(.tertiaryLabel)
        let bgColor: Color = isCurrent ? Color.sp.accent.opacity(0.08) : Color(.systemBackground)
        let borderColor: Color = isCurrent ? Color.sp.accent.opacity(0.3) : .clear

        return HStack(spacing: 12) {
            levelCheckmark(isReached: isReached, level: level.level)

            VStack(alignment: .leading, spacing: 2) {
                Text(level.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(nameColor)
                if let badge = level.badge {
                    Text("Unlocks: \(badge)")
                        .font(.system(size: 10))
                        .foregroundStyle(.tertiary)
                }
            }

            Spacer()

            Text("\(level.xpRequired) XP")
                .font(.caption.weight(.medium).monospacedDigit())
                .foregroundStyle(xpColor)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 10).fill(bgColor))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(borderColor, lineWidth: 1))
    }

    private func levelCheckmark(isReached: Bool, level: Int) -> some View {
        ZStack {
            Circle()
                .fill(isReached ? Color.sp.green : Color(.systemGray5))
                .frame(width: 32, height: 32)
            if isReached {
                Image(systemName: "checkmark")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
            } else {
                Text("\(level)")
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var xpBreakdownFooter: some View {
        VStack(spacing: 8) {
            Text("\(xp.totalXp) XP")
                .font(.title2.weight(.black).monospacedDigit())
                .foregroundStyle(Color.sp.accent)

            if let next = xp.nextLevel {
                Text("\(xp.xpToNextLevel) XP to \(next.name)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Text("Maximum level reached")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 8) {
                xpPill("Group XP", value: xp.totalGroupXp, color: Color.sp.primary)
                xpPill("Knockout XP", value: xp.totalKnockoutXp, color: Color.sp.green)
                xpPill("Badge XP", value: xp.totalBadgeXp, color: Color.sp.xpBadge)
            }
            .padding(.top, 4)
        }
        .padding(.vertical, 16)
    }

    private var stickyHeader: some View {
        let lvlColor = Color.sp.levelColor(xp.currentLevel.level)
        return VStack(spacing: 8) {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(lvlColor.opacity(0.15))
                        .frame(width: 48, height: 48)
                    Text("\(xp.currentLevel.level)")
                        .font(.title3.weight(.black).monospacedDigit())
                        .foregroundStyle(lvlColor)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(xp.currentLevel.name)
                        .font(.headline)
                    Text("\(xp.totalXp) XP total")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }
            .padding(.horizontal)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color(.systemGray5))
                        .frame(height: 6)
                    Capsule()
                        .fill(lvlColor)
                        .frame(width: max(geo.size.width * xp.levelProgress, 6), height: 6)
                }
            }
            .frame(height: 6)
            .padding(.horizontal)
        }
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
        .background(GeometryReader { geo in
            Color.clear.onAppear { headerHeight = geo.size.height }
        })
    }

    private func xpPill(_ label: String, value: Int, color: Color) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.system(size: 10))
                .foregroundStyle(color)
            Text("\(value)")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(color)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(color.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(color.opacity(0.2), lineWidth: 1))
    }
}
