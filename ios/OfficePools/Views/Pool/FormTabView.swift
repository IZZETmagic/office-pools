import SwiftUI

struct FormTabView: View {
    let poolId: String
    let entries: [Entry]
    let selectedEntry: Entry?

    @State private var analytics: AnalyticsResponse?
    @State private var isLoading = true
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
            } else if let analytics = analytics {
                analyticsContent(analytics)
            } else {
                ContentUnavailableView("Analytics Coming Soon", systemImage: "chart.bar.xaxis", description: Text("Analytics will appear once matches are completed."))
            }
        }
        .task {
            await loadAnalytics()
        }
        .onChange(of: selectedEntryId) { _, _ in
            Task { await loadAnalytics() }
        }
    }

    // MARK: - Main Content

    private func analyticsContent(_ data: AnalyticsResponse) -> some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                // Entry selector (multi-entry)
                if entries.count > 1 {
                    entrySelector
                }

                // XP Hero Card
                xpHeroCard(data.xp)

                // Badges
                if !data.xp.allBadges.isEmpty {
                    badgesSection(earned: data.xp.earnedBadges, all: data.xp.allBadges)
                }

                // Accuracy Overview
                if data.accuracy.overall.totalMatches > 0 {
                    accuracySection(data.accuracy)
                }

                // Streaks
                if !data.streaks.timeline.isEmpty {
                    streaksSection(data.streaks)
                }

                // You vs Crowd
                if data.crowd.totalMatches > 0 {
                    crowdSection(data.crowd, poolAvg: data.poolStats.avgAccuracy, userHitRate: data.accuracy.overall.hitRate)
                }

                // Pool Stats
                if data.poolStats.completedMatches > 0 {
                    poolStatsSection(data.poolStats)
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 24)
        }
        .background(Color(.systemGroupedBackground))
    }

    // MARK: - Entry Selector

    private var entrySelector: some View {
        HStack {
            Text("Entry")
                .font(.subheadline.weight(.semibold))
            Spacer()
            Picker("Entry", selection: Binding(
                get: { activeEntryId ?? "" },
                set: { selectedEntryId = $0 }
            )) {
                ForEach(entries) { entry in
                    Text(entry.entryName.isEmpty ? "Entry \(entry.entryNumber)" : entry.entryName)
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

    // MARK: - XP Hero Card

    private func xpHeroCard(_ xp: XPData) -> some View {
        VStack(spacing: 16) {
            HStack(spacing: 20) {
                // Level circle
                ZStack {
                    Circle()
                        .stroke(levelColor(xp.currentLevel.level).opacity(0.2), lineWidth: 6)
                        .frame(width: 72, height: 72)

                    Circle()
                        .trim(from: 0, to: xp.levelProgress)
                        .stroke(levelColor(xp.currentLevel.level), style: StrokeStyle(lineWidth: 6, lineCap: .round))
                        .frame(width: 72, height: 72)
                        .rotationEffect(.degrees(-90))

                    VStack(spacing: 0) {
                        Text("\(xp.currentLevel.level)")
                            .font(.title2.weight(.black).monospacedDigit())
                            .foregroundStyle(levelColor(xp.currentLevel.level))
                    }
                }

                // Level info
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
            }

            // Progress bar
            if xp.nextLevel != nil {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(Color(.systemGray5))
                            .frame(height: 8)

                        Capsule()
                            .fill(levelColor(xp.currentLevel.level))
                            .frame(width: max(geo.size.width * xp.levelProgress, 8), height: 8)
                    }
                }
                .frame(height: 8)
            }

            // XP breakdown row
            HStack(spacing: 0) {
                xpStat("Match", value: xp.totalBaseXp, color: .blue)
                xpStat("Bonus", value: xp.totalBonusXp, color: .orange)
                xpStat("Badges", value: xp.totalBadgeXp, color: .purple)
            }
        }
        .padding(16)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
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

    private func levelColor(_ level: Int) -> Color {
        switch level {
        case 10: return .yellow
        case 8...9: return .orange
        case 6...7: return .purple
        case 4...5: return .blue
        default: return .green
        }
    }

    // MARK: - Badges

    private func badgesSection(earned: [BadgeInfo], all: [BadgeInfo]) -> some View {
        let earnedIds = Set(earned.map { $0.id })

        return VStack(spacing: 0) {
            sectionHeader("Badges", subtitle: "\(earned.count)/\(all.count) earned")

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(all) { badge in
                    let isEarned = earnedIds.contains(badge.id)
                    badgeCell(badge, earned: isEarned)
                }
            }
            .padding(16)
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
                    Image(systemName: badgeIcon(badge.id))
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
                .foregroundStyle(earned ? rarityColor(badge.rarity) : .quaternary)
        }
    }

    private func badgeIcon(_ id: String) -> String {
        switch id {
        case "sharpshooter": return "scope"
        case "oracle": return "eye.fill"
        case "dark_horse": return "hare.fill"
        case "ice_breaker": return "snowflake"
        case "on_fire": return "flame.fill"
        case "top_dog": return "crown.fill"
        case "globe_trotter": return "globe"
        case "lightning_rod": return "bolt.fill"
        case "stadium_regular": return "building.columns.fill"
        case "showtime": return "sparkles"
        case "grand_finale": return "trophy.fill"
        case "legend": return "star.fill"
        default: return "star.fill"
        }
    }

    private func rarityColor(_ rarity: String) -> Color {
        switch rarity {
        case "Common": return .gray
        case "Uncommon": return .green
        case "Rare": return .blue
        case "Very Rare": return .purple
        case "Legendary": return .yellow
        default: return .gray
        }
    }

    // MARK: - Accuracy

    private func accuracySection(_ accuracy: AccuracyData) -> some View {
        VStack(spacing: 0) {
            sectionHeader("Accuracy")

            // Stat cards
            HStack(spacing: 0) {
                statCell("Hit Rate", value: "\(Int(accuracy.overall.hitRate))%", color: .green)
                statCell("Exact", value: "\(accuracy.overall.exact)", color: .yellow)
                statCell("Scored", value: "\(accuracy.overall.totalMatches)", color: .blue)
                statCell("Points", value: "\(accuracy.overall.totalPoints)", color: .primary)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)

            // Per-stage bars
            ForEach(accuracy.byStage) { stage in
                stageAccuracyRow(stage)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
            }

            Spacer().frame(height: 10)
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    private func statCell(_ title: String, value: String, color: Color) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.headline.weight(.bold).monospacedDigit())
                .foregroundStyle(color)
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private func stageAccuracyRow(_ stage: StageAccuracy) -> some View {
        VStack(spacing: 4) {
            HStack {
                Text(stage.stageLabel)
                    .font(.caption.weight(.medium))
                Spacer()
                Text("\(Int(stage.hitRate))% · \(stage.total) matches")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            // Stacked bar
            GeometryReader { geo in
                let total = max(stage.total, 1)
                HStack(spacing: 1) {
                    if stage.exact > 0 {
                        Rectangle().fill(Color.green)
                            .frame(width: geo.size.width * Double(stage.exact) / Double(total))
                    }
                    if stage.winnerGd > 0 {
                        Rectangle().fill(Color.blue)
                            .frame(width: geo.size.width * Double(stage.winnerGd) / Double(total))
                    }
                    if stage.winner > 0 {
                        Rectangle().fill(Color.orange)
                            .frame(width: geo.size.width * Double(stage.winner) / Double(total))
                    }
                    if stage.miss > 0 {
                        Rectangle().fill(Color(.systemGray4))
                            .frame(width: geo.size.width * Double(stage.miss) / Double(total))
                    }
                }
                .clipShape(Capsule())
            }
            .frame(height: 6)
        }
    }

    // MARK: - Streaks

    private func streaksSection(_ streaks: AnalyticsStreakData) -> some View {
        VStack(spacing: 0) {
            sectionHeader("Streaks")

            // Stat cards
            HStack(spacing: 10) {
                streakCard(
                    title: "Current",
                    value: streaks.currentStreak.length,
                    type: streaks.currentStreak.type,
                    icon: streaks.currentStreak.type == "hot" ? "flame.fill" : (streaks.currentStreak.type == "cold" ? "snowflake" : "minus")
                )
                streakCard(title: "Best Hot", value: streaks.longestHotStreak, type: "hot", icon: "flame.fill")
                streakCard(title: "Worst Cold", value: streaks.longestColdStreak, type: "cold", icon: "snowflake")
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)

            // Timeline dots
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 3) {
                    ForEach(streaks.timeline) { entry in
                        Circle()
                            .fill(timelineColor(entry.type))
                            .frame(width: 10, height: 10)
                    }
                }
                .padding(.horizontal, 16)
            }
            .padding(.bottom, 12)

            // Legend
            HStack(spacing: 12) {
                legendDot(color: .yellow, label: "Exact")
                legendDot(color: .green, label: "W+GD")
                legendDot(color: .blue, label: "Winner")
                legendDot(color: Color(.systemGray4), label: "Miss")
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 16)
            .padding(.bottom, 10)
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    private func streakCard(title: String, value: Int, type: String, icon: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(type == "hot" ? .red : (type == "cold" ? .blue : .secondary))

            Text("\(value)")
                .font(.title3.weight(.bold).monospacedDigit())

            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func timelineColor(_ type: String) -> Color {
        switch type {
        case "exact": return .yellow
        case "winner_gd": return .green
        case "winner": return .blue
        case "miss": return Color(.systemGray4)
        default: return Color(.systemGray5)
        }
    }

    private func legendDot(color: Color, label: String) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(label)
        }
    }

    // MARK: - You vs Crowd

    private func crowdSection(_ crowd: CrowdData, poolAvg: Double, userHitRate: Double) -> some View {
        VStack(spacing: 0) {
            sectionHeader("You vs Crowd")

            // Stat cards
            HStack(spacing: 10) {
                crowdStat("Consensus", value: crowd.consensusCount, total: crowd.totalMatches, color: .blue)
                crowdStat("Contrarian", value: crowd.contrarianCount, total: crowd.totalMatches, color: .purple)
                crowdStat("Contrarian Wins", value: crowd.contrarianWins, total: max(crowd.contrarianCount, 1), color: .green)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)

            // Accuracy comparison
            VStack(spacing: 8) {
                comparisonBar(label: "You", value: userHitRate, color: .blue)
                comparisonBar(label: "Pool Avg", value: poolAvg, color: .secondary)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    private func crowdStat(_ title: String, value: Int, total: Int, color: Color) -> some View {
        let pct = total > 0 ? Int(Double(value) / Double(total) * 100) : 0
        return VStack(spacing: 2) {
            Text("\(value)")
                .font(.headline.weight(.bold).monospacedDigit())
                .foregroundStyle(color)
            Text("\(pct)%")
                .font(.caption2.monospacedDigit())
                .foregroundStyle(.secondary)
            Text(title)
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func comparisonBar(label: String, value: Double, color: Color) -> some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.caption.weight(.medium))
                .frame(width: 55, alignment: .leading)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color(.systemGray5))
                        .frame(height: 10)

                    Capsule()
                        .fill(color)
                        .frame(width: max(geo.size.width * value / 100, 4), height: 10)
                }
            }
            .frame(height: 10)

            Text("\(Int(value))%")
                .font(.caption.weight(.bold).monospacedDigit())
                .frame(width: 34, alignment: .trailing)
        }
    }

    // MARK: - Pool Stats

    private func poolStatsSection(_ stats: PoolStatsData) -> some View {
        VStack(spacing: 0) {
            sectionHeader("Pool Stats")

            // Summary
            HStack(spacing: 0) {
                statCell("Avg Accuracy", value: "\(Int(stats.avgAccuracy))%", color: .green)
                statCell("Completed", value: "\(stats.completedMatches)", color: .blue)
                statCell("Entries", value: "\(stats.totalEntries)", color: .secondary)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)

            // Most predictable
            if !stats.mostPredictable.isEmpty {
                predictabilityList(title: "Most Predictable", matches: stats.mostPredictable, color: .green)
            }

            // Least predictable
            if !stats.leastPredictable.isEmpty {
                predictabilityList(title: "Biggest Upsets", matches: stats.leastPredictable, color: .red)
            }

            Spacer().frame(height: 6)
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    private func predictabilityList(title: String, matches: [PredictableMatch], color: Color) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(color)
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 4)

            ForEach(matches) { match in
                HStack {
                    Text("\(match.homeTeam) v \(match.awayTeam)")
                        .font(.caption)
                        .lineLimit(1)

                    Text(match.actualScore)
                        .font(.caption.weight(.semibold).monospacedDigit())

                    Spacer()

                    Text("\(Int(match.hitRate))%")
                        .font(.caption.weight(.bold).monospacedDigit())
                        .foregroundStyle(color)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 4)
            }
        }
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

    // MARK: - Data Loading

    private func loadAnalytics() async {
        guard let entryId = activeEntryId else {
            errorMessage = "No entry available"
            isLoading = false
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            analytics = try await apiService.fetchAnalytics(poolId: poolId, entryId: entryId)
            isLoading = false
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
            print("[FormTab] Error loading analytics: \(error)")
        }
    }
}
