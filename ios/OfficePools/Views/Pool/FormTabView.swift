import SwiftUI

struct FormTabView: View {
    let poolId: String
    let entries: [Entry]
    let selectedEntry: Entry?

    @State private var analytics: AnalyticsResponse?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var selectedEntryId: String?
    @State private var tappedMatchNumber: Int?

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
                Spacer().frame(height: 4)

                // Entry selector (multi-entry)
                if entries.count > 1 {
                    entrySelector
                }

                // XP Hero Card
                NavigationLink(destination: LevelRoadmapView(xp: data.xp)) {
                    xpHeroCard(data.xp)
                }
                .buttonStyle(.plain)

                // Badges
                if !data.xp.allBadges.isEmpty {
                    badgesSection(earned: data.xp.earnedBadges, all: data.xp.allBadges)
                }

                // Hot & Cold Streaks KPIs
                if data.streaks.longestHotStreak > 0 || data.streaks.longestColdStreak > 0 {
                    hotColdStreakCards(data.streaks)
                }

                // Your Tournament Run
                if !data.xp.matchXp.isEmpty {
                    tournamentRunSection(data.xp.matchXp, crowd: data.crowd.matches)
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

    // MARK: - XP Hero Card

    private func xpHeroCard(_ xp: XPData) -> some View {
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
                        xpToNextLabel(xp: xp, next: next)
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

    private func xpToNextLabel(xp: XPData, next: LevelInfo) -> some View {
        HStack(spacing: 4) {
            Text("\(xp.xpToNextLevel) XP to")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(next.name)
                .font(.caption.weight(.semibold))
                .foregroundStyle(levelColor(next.level))
        }
    }

    private func xpProgressBar(xp: XPData) -> some View {
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
        let sorted = all.sorted { a, b in
            let aEarned = earnedIds.contains(a.id)
            let bEarned = earnedIds.contains(b.id)
            if aEarned != bEarned { return aEarned }
            return false
        }

        return VStack(alignment: .leading, spacing: 0) {
            sectionHeader("Badges", subtitle: "\(earned.count)/\(all.count) earned")

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
                .foregroundStyle(earned ? rarityColor(badge.rarity) : Color(.systemGray4))
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

    // MARK: - Hot & Cold Streak KPIs

    private func hotColdStreakCards(_ streaks: AnalyticsStreakData) -> some View {
        let currentHot = streaks.currentStreak.type == "hot" ? streaks.currentStreak.length : 0
        let coldStreak = streaks.longestColdStreak

        return HStack(spacing: 12) {
            // Hot Streak Card
            VStack(spacing: 6) {
                Image(systemName: "flame.fill")
                    .font(.title2)
                    .foregroundStyle(.orange)

                Text("Current Hot Streak")
                    .font(.system(size: 9, weight: .semibold))
                    .textCase(.uppercase)
                    .tracking(0.5)
                    .foregroundStyle(.secondary)

                Text("\(currentHot)")
                    .font(.system(size: 36, weight: .heavy).monospacedDigit())
                    .foregroundStyle(.orange)

                // Progress pips
                HStack(spacing: 3) {
                    ForEach(0..<5, id: \.self) { i in
                        Capsule()
                            .fill(i < min(currentHot, 5)
                                ? Color.orange
                                : Color(.systemGray5))
                            .frame(width: 20, height: 5)
                    }
                }
                .padding(.bottom, 2)

                Text("Personal best: **\(streaks.longestHotStreak)**")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .padding(.horizontal, 10)
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(Color.orange.opacity(0.2), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.04), radius: 4, y: 2)

            // Cold Streak Card
            VStack(spacing: 6) {
                Image(systemName: "snowflake")
                    .font(.title2)
                    .foregroundStyle(.cyan)

                Text("Worst Cold Streak")
                    .font(.system(size: 9, weight: .semibold))
                    .textCase(.uppercase)
                    .tracking(0.5)
                    .foregroundStyle(.secondary)

                Text("\(coldStreak)")
                    .font(.system(size: 36, weight: .heavy).monospacedDigit())
                    .foregroundStyle(.cyan)

                // Progress pips (cold intensifying)
                HStack(spacing: 3) {
                    ForEach(0..<5, id: \.self) { i in
                        let filled = i < min(coldStreak, 5)
                        let opacity: Double = 0.15 + 0.17 * Double(i + 1)
                        Capsule()
                            .fill(filled ? Color.cyan.opacity(opacity) : Color(.systemGray5))
                            .frame(width: 20, height: 5)
                    }
                }
                .padding(.bottom, 2)

                Text("Keep this one low!")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .padding(.horizontal, 10)
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
        }
    }

    // MARK: - Tournament Run

    private func tournamentRunSection(_ matchXP: [MatchXPItem], crowd: [CrowdMatchItem]) -> some View {
        let sorted = matchXP.sorted { $0.matchNumber > $1.matchNumber }
        let crowdMap = Dictionary(uniqueKeysWithValues: crowd.map { ($0.matchNumber, $0) })

        return VStack(spacing: 0) {
            sectionHeader("Your Tournament Run", subtitle: "\(sorted.count) matches")

            // Scrollable journey path
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    ForEach(Array(sorted.enumerated()), id: \.element.id) { idx, match in
                        HStack(spacing: 0) {
                            // Connector line (not before first node)
                            if idx > 0 {
                                let prevTier = sorted[idx - 1].tier
                                let lineColor: Color = prevTier == "submitted"
                                    ? Color(.systemGray4).opacity(0.3)
                                    : tierColor(prevTier).opacity(0.35)
                                Rectangle()
                                    .fill(lineColor)
                                    .frame(width: 14, height: 2)
                            }

                            // Node
                            tournamentNode(match, crowdMatch: crowdMap[match.matchNumber])
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 4)
            }
            .padding(.bottom, 8)

            // Legend
            HStack(spacing: 14) {
                runLegendItem(color: .yellow, label: "Exact Score")
                runLegendItem(color: .green, label: "Winner + GD")
                runLegendItem(color: .blue, label: "Correct Result")
                runLegendItem(color: Color(.systemGray4), label: "Miss")
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    private func tournamentNode(_ match: MatchXPItem, crowdMatch: CrowdMatchItem?) -> some View {
        let isMiss = match.tier == "submitted"
        let color: Color = tierColor(match.tier)
        let fillColor: Color = isMiss ? Color(.systemGray6) : color.opacity(0.2)
        let borderColor: Color = isMiss ? Color(.systemGray3) : color
        let shadowColor: Color = isMiss ? .clear : color.opacity(0.25)

        return VStack(spacing: 4) {
            ZStack {
                Circle()
                    .fill(fillColor)
                    .frame(width: 32, height: 32)

                Circle()
                    .strokeBorder(borderColor, lineWidth: 2)
                    .frame(width: 32, height: 32)

                tierIcon(match.tier)
                    .foregroundStyle(borderColor)
            }
            .shadow(color: shadowColor, radius: 4, y: 0)
            .onTapGesture {
                withAnimation(.easeInOut(duration: 0.2)) {
                    tappedMatchNumber = tappedMatchNumber == match.matchNumber ? nil : match.matchNumber
                }
            }

            // Match number label
            Text("#\(match.matchNumber)")
                .font(.system(size: 8, weight: .medium).monospacedDigit())
                .foregroundStyle(.tertiary)
        }
        .overlay(alignment: .top) {
            if tappedMatchNumber == match.matchNumber, let cm = crowdMatch {
                tooltipBubble("\(cm.homeTeam) \(cm.actualScore) \(cm.awayTeam)")
                    .offset(y: -42)
            }
        }
    }

    private func tooltipBubble(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color(.darkGray), in: RoundedRectangle(cornerRadius: 6))
            .fixedSize()
            .zIndex(10)
            .transition(.scale.combined(with: .opacity))
    }

    @ViewBuilder
    private func tierIcon(_ tier: String) -> some View {
        switch tier {
        case "exact":
            Image(systemName: "star.fill")
                .font(.system(size: 12))
        case "winner_gd":
            Image(systemName: "checkmark")
                .font(.system(size: 11, weight: .bold))
        case "winner":
            Text("~")
                .font(.system(size: 14, weight: .black))
        default: // submitted / miss
            Image(systemName: "xmark")
                .font(.system(size: 10, weight: .bold))
        }
    }

    private func tierColor(_ tier: String) -> Color {
        switch tier {
        case "exact": return .yellow
        case "winner_gd": return .green
        case "winner": return .blue
        default: return Color(.systemGray4)
        }
    }

    private func runLegendItem(color: Color, label: String) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(color)
                .frame(width: 7, height: 7)
            Text(label)
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - You vs Crowd

    private func crowdSection(_ crowd: CrowdData, poolAvg: Double, userHitRate: Double) -> some View {
        let stats = computeCrowdStats(crowd: crowd, poolAvg: poolAvg)

        return VStack(spacing: 0) {
            vsFaceoff(userAccuracy: stats.userAccuracy, crowdAccuracy: stats.crowdAccuracy)

            // Battle Bars
            VStack(spacing: 16) {
                battleBar(label: "Consensus Picks", you: crowd.consensusCount, crowd: stats.crowdAvgConsensus)
                battleBar(label: "Contrarian Picks", you: crowd.contrarianCount, crowd: stats.crowdAvgContrarian)
                battleBar(label: "Contrarian Wins", you: crowd.contrarianWins, crowd: stats.crowdAvgContrarianWins)
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 18)

            // Performance callout
            if stats.accuracyDiff != 0 {
                performanceCallout(
                    isOutperforming: stats.isOutperforming,
                    accuracyDiff: stats.accuracyDiff,
                    contrarianAdv: stats.contrarianAdv,
                    showContrarian: crowd.contrarianCount > 0 && stats.contrarianAdv > 0
                )
                .padding(.horizontal, 18)
                .padding(.bottom, 16)
            }
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    private struct CrowdStats {
        let userAccuracy: Int
        let crowdAccuracy: Int
        let accuracyDiff: Int
        let isOutperforming: Bool
        let crowdAvgConsensus: Int
        let crowdAvgContrarian: Int
        let crowdAvgContrarianWins: Int
        let contrarianAdv: Int
    }

    private func computeCrowdStats(crowd: CrowdData, poolAvg: Double) -> CrowdStats {
        let userCorrect = crowd.matches.filter { $0.isCorrect }.count
        let total = Double(max(crowd.totalMatches, 1))
        let userAcc = Int(round(Double(userCorrect) / total * 100))
        let crowdAcc = Int(round(poolAvg * 100))

        let consensusSum = crowd.matches.reduce(0.0) { sum, m in
            sum + max(m.homeWinPct, m.drawPct, m.awayWinPct)
        }
        let avgConsensus = Int(round(consensusSum))
        let avgContrarian = max(0, crowd.totalMatches - avgConsensus)
        let crowdAccRate = Double(crowdAcc) / 100.0
        let avgContrarianWins = Int(round(Double(avgContrarian) * crowdAccRate))

        let userContPct = crowd.contrarianCount > 0
            ? Int(round(Double(crowd.contrarianWins) / Double(crowd.contrarianCount) * 100)) : 0
        let crowdContPct = avgContrarian > 0
            ? Int(round(Double(avgContrarianWins) / Double(avgContrarian) * 100)) : 0

        return CrowdStats(
            userAccuracy: userAcc,
            crowdAccuracy: crowdAcc,
            accuracyDiff: userAcc - crowdAcc,
            isOutperforming: userAcc > crowdAcc,
            crowdAvgConsensus: avgConsensus,
            crowdAvgContrarian: avgContrarian,
            crowdAvgContrarianWins: avgContrarianWins,
            contrarianAdv: userContPct - crowdContPct
        )
    }

    private func vsFaceoff(userAccuracy: Int, crowdAccuracy: Int) -> some View {
        VStack(spacing: 16) {
            Text("You vs The Crowd")
                .font(.system(size: 15, weight: .bold))
                .frame(maxWidth: .infinity, alignment: .leading)

            HStack {
                Spacer()
                VStack(spacing: 4) {
                    Text("YOU")
                        .font(.system(size: 10, weight: .bold))
                        .tracking(0.8)
                        .foregroundStyle(.blue)
                    Text("\(userAccuracy)%")
                        .font(.system(size: 32, weight: .heavy).monospacedDigit())
                        .foregroundStyle(.blue)
                }

                Spacer()

                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color.blue.opacity(0.12), Color.purple.opacity(0.2)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 36, height: 36)
                        .overlay(
                            Circle()
                                .strokeBorder(Color(.systemGray4), lineWidth: 1)
                        )
                    Text("VS")
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(.secondary)
                }

                Spacer()

                VStack(spacing: 4) {
                    Text("POOL AVG")
                        .font(.system(size: 10, weight: .bold))
                        .tracking(0.8)
                        .foregroundStyle(.purple)
                    Text("\(crowdAccuracy)%")
                        .font(.system(size: 32, weight: .heavy).monospacedDigit())
                        .foregroundStyle(Color(.systemGray3))
                }

                Spacer()
            }
            .padding(.bottom, 8)
        }
        .padding(.horizontal, 18)
        .padding(.top, 18)
    }

    private func battleBar(label: String, you: Int, crowd: Int) -> some View {
        let total = you + crowd
        let youPct = total > 0 ? Double(you) / Double(total) * 100 : 50
        let crowdPct = total > 0 ? Double(crowd) / Double(total) * 100 : 50

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
                    // You fill (blue, left)
                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: [Color.blue, Color.blue.opacity(0.8)],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: max(geo.size.width * youPct / 100 - 1, 2))

                    // Crowd fill (purple, right)
                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: [Color.purple.opacity(0.67), Color.purple],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: max(geo.size.width * crowdPct / 100 - 1, 2))
                }
            }
            .frame(height: 8)
        }
    }

    private func performanceCallout(isOutperforming: Bool, accuracyDiff: Int, contrarianAdv: Int, showContrarian: Bool) -> some View {
        let accentColor: Color = isOutperforming ? .green : .blue
        let iconName = isOutperforming ? "chart.line.uptrend.xyaxis" : "target"
        let message = isOutperforming
            ? "Outperforming the crowd by \(accuracyDiff)%"
            : "The crowd leads by \(abs(accuracyDiff))%"

        return HStack(alignment: .top, spacing: 8) {
            Image(systemName: iconName)
                .font(.system(size: 18))
                .foregroundStyle(accentColor)

            VStack(alignment: .leading, spacing: 2) {
                Text(message)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(accentColor)

                if showContrarian {
                    Text("Your contrarian win rate is \(contrarianAdv)% higher than average")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            LinearGradient(
                colors: [accentColor.opacity(0.1), .clear],
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

    // MARK: - Pool Stats

    private func poolStatsSection(_ stats: PoolStatsData) -> some View {
        let topPredictable = Array(stats.mostPredictable.prefix(3))
        let topUpsets = Array(stats.leastPredictable.prefix(3))

        return VStack(alignment: .leading, spacing: 0) {
            // Header
            Text("Pool-Wide Stats")
                .font(.system(size: 15, weight: .bold))
                .padding(.horizontal, 18)
                .padding(.top, 18)
                .padding(.bottom, 14)

            // Summary stats row
            HStack(spacing: 0) {
                VStack(spacing: 2) {
                    Text("\(Int(round(stats.avgAccuracy * 100)))%")
                        .font(.system(size: 24, weight: .heavy).monospacedDigit())
                    Text("Avg Pool Accuracy")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)

                VStack(spacing: 2) {
                    Text("\(stats.totalEntries)")
                        .font(.system(size: 24, weight: .heavy).monospacedDigit())
                    Text("Competitors")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)

                VStack(spacing: 2) {
                    Text("\(stats.completedMatches)")
                        .font(.system(size: 24, weight: .heavy).monospacedDigit())
                    Text("Matches Scored")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 18)

            // Most Predictable
            if !topPredictable.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(.green)
                    Text("Most Predictable")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.green)
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 8)

                VStack(spacing: 0) {
                    ForEach(Array(topPredictable.enumerated()), id: \.element.id) { idx, match in
                        predictableMatchRow(index: idx, match: match, color: .green, isLast: idx == topPredictable.count - 1)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 14)
            }

            // Biggest Upsets
            if !topUpsets.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(.red)
                    Text("Biggest Upsets")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.red)
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 8)

                VStack(spacing: 0) {
                    ForEach(Array(topUpsets.enumerated()), id: \.element.id) { idx, match in
                        predictableMatchRow(index: idx, match: match, color: .red, isLast: idx == topUpsets.count - 1)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 16)
            }
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    private func predictableMatchRow(index: Int, match: PredictableMatch, color: Color, isLast: Bool) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text("\(index + 1). \(match.homeTeam) vs \(match.awayTeam)")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                Spacer()

                // Mini progress bar
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color(.systemGray5))
                        .frame(width: 40, height: 4)
                    Capsule()
                        .fill(color)
                        .frame(width: max(40 * match.hitRate, 2), height: 4)
                }

                Text("\(Int(round(match.hitRate * 100)))%")
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundStyle(color)
                    .frame(width: 34, alignment: .trailing)
            }
            .padding(.vertical, 8)

            if !isLast {
                Divider()
                    .foregroundStyle(Color(.systemGray5))
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

// MARK: - Level Roadmap Page

struct LevelRoadmapView: View {
    let xp: XPData
    @State private var headerHeight: CGFloat = 100

    var body: some View {
        ZStack(alignment: .top) {
            ScrollView {
                VStack(spacing: 12) {
                    // Spacer for header
                    Color.clear.frame(height: headerHeight + 8)

                    VStack(spacing: 8) {
                        ForEach(xp.levels) { level in
                            levelRow(level)
                        }
                    }
                    .padding(.horizontal, 16)

                    xpSummary
                }
                .padding(.bottom, 24)
            }
            .background(Color(.systemGroupedBackground))

            // Fixed glass header
            roadmapHeader
        }
        .navigationBarTitleDisplayMode(.inline)
    }

    private var roadmapHeader: some View {
        let lvlColor = levelColor(xp.currentLevel.level)
        let progressText: String = xp.nextLevel != nil
            ? "\(xp.xpToNextLevel.formatted()) XP to \(xp.nextLevel!.name)"
            : "Maximum level reached"

        return VStack(spacing: 4) {
            HStack(spacing: 14) {
                // Level circle
                ZStack {
                    Circle()
                        .stroke(lvlColor.opacity(0.2), lineWidth: 5)
                        .frame(width: 52, height: 52)
                    Circle()
                        .trim(from: 0, to: xp.levelProgress)
                        .stroke(lvlColor, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                        .frame(width: 52, height: 52)
                        .rotationEffect(.degrees(-90))
                    Text("\(xp.currentLevel.level)")
                        .font(.system(size: 18, weight: .black).monospacedDigit())
                        .foregroundStyle(lvlColor)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(xp.currentLevel.name)
                        .font(.headline.weight(.bold))
                    Text("\(xp.totalXp.formatted()) XP")
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                        .foregroundStyle(.secondary)
                    Text(progressText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }
            .padding(.horizontal, 20)
        }
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
        .shadow(color: .black.opacity(0.06), radius: 4, y: 2)
        .overlay(
            GeometryReader { geo in
                Color.clear
                    .onAppear { headerHeight = geo.size.height }
                    .onChange(of: geo.size.height) { _, newHeight in
                        headerHeight = newHeight
                    }
            }
        )
    }

    private func levelRow(_ level: LevelInfo) -> some View {
        let isReached = xp.totalXp >= level.xpRequired
        let isCurrent = level.level == xp.currentLevel.level
        let lvlColor = levelColor(level.level)
        let circleFill: Color = isReached ? .green : Color(.systemGray4)
        let nameColor: Color = isCurrent ? lvlColor : (isReached ? .primary : .secondary)
        let xpColor: Color = isCurrent ? lvlColor : (isReached ? .green : Color(.systemGray3))
        let bgColor: Color = isCurrent ? lvlColor.opacity(0.08) : (isReached ? Color.green.opacity(0.04) : Color(.systemGray6))

        return HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(circleFill)
                    .frame(width: 32, height: 32)

                if isReached {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                } else {
                    Text("\(level.level)")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.secondary)
                }
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(level.name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(nameColor)

                if let badge = level.badge {
                    Text("Unlocks: \(badge)")
                        .font(.system(size: 10))
                        .foregroundStyle(.tertiary)
                }
            }

            Spacer()

            Text("\(level.xpRequired.formatted()) XP")
                .font(.system(size: 12, weight: .medium, design: .monospaced))
                .foregroundStyle(xpColor)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(bgColor)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(isCurrent ? lvlColor.opacity(0.3) : .clear, lineWidth: 1)
        )
    }

    private var xpSummary: some View {
        VStack(spacing: 8) {
            Text("\(xp.totalXp.formatted()) XP")
                .font(.system(size: 28, weight: .black).monospacedDigit())
                .foregroundStyle(levelColor(xp.currentLevel.level))

            if let next = xp.nextLevel {
                Text("\(xp.xpToNextLevel.formatted()) XP to \(next.name)")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            } else {
                Text("Maximum level reached")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 8) {
                xpPill("Match XP", value: xp.totalBaseXp, color: .blue)
                xpPill("Bonus XP", value: xp.totalBonusXp, color: .green)
                xpPill("Badge XP", value: xp.totalBadgeXp, color: .orange)
            }
            .padding(.top, 4)
        }
        .padding(.vertical, 16)
    }

    private func xpPill(_ label: String, value: Int, color: Color) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(color)
            Text("\(value.formatted())")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(color)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(color.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .strokeBorder(color.opacity(0.2), lineWidth: 1)
        )
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
}
