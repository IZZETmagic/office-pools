import SwiftUI

struct FormTabView: View {
    let poolId: String
    let entries: [Entry]
    let selectedEntry: Entry?
    let preloadedAnalytics: [String: AnalyticsResponse]

    @State private var analytics: AnalyticsResponse?
    @State private var isLoading = false
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

    /// Use preloaded data if available, fall back to locally fetched
    private var currentAnalytics: AnalyticsResponse? {
        if let entryId = activeEntryId, let preloaded = preloadedAnalytics[entryId] {
            return preloaded
        }
        return analytics
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
        .background(Color.sp.snow)
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
                        .font(SPTypography.mono(size: 22, weight: .black))
                        .foregroundStyle(lvlColor)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(xp.currentLevel.name)
                        .font(SPTypography.sectionHeader)
                        .foregroundStyle(Color.sp.ink)
                    Text("\(xp.totalXp) XP")
                        .font(SPTypography.mono(size: 14, weight: .semibold))
                        .foregroundStyle(Color.sp.slate)
                    if let next = xp.nextLevel {
                        xpToNextLabel(xp: xp, next: next)
                    }
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Color.sp.silver)
            }

            if xp.nextLevel != nil {
                xpProgressBar(xp: xp)
            }

            HStack(spacing: 0) {
                xpStat("Match", value: xp.totalBaseXp, color: AppColors.xpMatch)
                xpStat("Bonus", value: xp.totalBonusXp, color: AppColors.xpBonus)
                xpStat("Badges", value: xp.totalBadgeXp, color: AppColors.xpBadge)
            }
        }
        .padding(16)
        .spCard()
    }

    private func xpToNextLabel(xp: XPData, next: LevelInfo) -> some View {
        HStack(spacing: 4) {
            Text("\(xp.xpToNextLevel) XP to")
                .font(SPTypography.detail)
                .foregroundStyle(Color.sp.slate)
            Text(next.name)
                .font(.system(size: 10, weight: .bold, design: .rounded))
                .foregroundStyle(levelColor(next.level))
        }
    }

    private func xpProgressBar(xp: XPData) -> some View {
        let lvlColor = levelColor(xp.currentLevel.level)
        return GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.sp.mist)
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
                .font(SPTypography.mono(size: 14, weight: .bold))
                .foregroundStyle(color)
            Text(title)
                .font(SPTypography.detail)
                .foregroundStyle(Color.sp.slate)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Entry Selector

    private var entrySelector: some View {
        HStack {
            Text("Entry")
                .font(SPTypography.cardTitle)
                .foregroundStyle(Color.sp.ink)
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
        .spCard()
    }

    private func levelColor(_ level: Int) -> Color {
        AppColors.levelColor(level)
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
        .spCard()
    }

    private func badgeCell(_ badge: BadgeInfo, earned: Bool) -> some View {
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .fill(earned ? rarityColor(badge.rarity).opacity(0.15) : Color.sp.mist)
                    .frame(width: 44, height: 44)

                if earned {
                    Image(systemName: badgeIcon(badge.id))
                        .font(.system(size: 18))
                        .foregroundStyle(rarityColor(badge.rarity))
                } else {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.sp.silver)
                }
            }

            Text(badge.name)
                .font(SPTypography.detail)
                .foregroundStyle(earned ? Color.sp.ink : Color.sp.silver)
                .lineLimit(1)

            Text("+\(badge.xpBonus) XP")
                .font(.system(size: 8, weight: .medium, design: .rounded))
                .foregroundStyle(earned ? rarityColor(badge.rarity) : Color.sp.silver)
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
        AppColors.rarityColor(rarity)
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
                    .foregroundStyle(AppColors.hotStreak)

                Text("Current Hot Streak")
                    .spCaption()
                    .foregroundStyle(Color.sp.slate)

                Text("\(currentHot)")
                    .font(SPTypography.mono(size: 36, weight: .heavy))
                    .foregroundStyle(AppColors.hotStreak)

                HStack(spacing: 3) {
                    ForEach(0..<5, id: \.self) { i in
                        Capsule()
                            .fill(i < min(currentHot, 5)
                                ? AppColors.hotStreak
                                : Color.sp.mist)
                            .frame(width: 20, height: 5)
                    }
                }
                .padding(.bottom, 2)

                Text("Personal best: **\(streaks.longestHotStreak)**")
                    .font(SPTypography.detail)
                    .foregroundStyle(Color.sp.slate)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .padding(.horizontal, 10)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: SPDesign.Radius.lg)
                    .strokeBorder(AppColors.hotStreak.opacity(0.2), lineWidth: AppDesign.Border.thin)
            )
            .spCardShadow()

            // Cold Streak Card
            VStack(spacing: 6) {
                Image(systemName: "snowflake")
                    .font(.title2)
                    .foregroundStyle(AppColors.coldStreak)

                Text("Worst Cold Streak")
                    .spCaption()
                    .foregroundStyle(Color.sp.slate)

                Text("\(coldStreak)")
                    .font(SPTypography.mono(size: 36, weight: .heavy))
                    .foregroundStyle(AppColors.coldStreak)

                HStack(spacing: 3) {
                    ForEach(0..<5, id: \.self) { i in
                        let filled = i < min(coldStreak, 5)
                        let opacity: Double = 0.15 + 0.17 * Double(i + 1)
                        Capsule()
                            .fill(filled ? AppColors.coldStreak.opacity(opacity) : Color.sp.mist)
                            .frame(width: 20, height: 5)
                    }
                }
                .padding(.bottom, 2)

                Text("Keep this one low!")
                    .font(SPTypography.detail)
                    .foregroundStyle(Color.sp.slate)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .padding(.horizontal, 10)
            .spCard()
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
                runLegendItem(color: AppColors.tierExact, label: "Exact Score")
                runLegendItem(color: AppColors.tierWinnerGd, label: "Winner + GD")
                runLegendItem(color: AppColors.tierWinner, label: "Correct Result")
                runLegendItem(color: AppColors.tierMiss, label: "Miss")
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
        .spCard()
    }

    private func tournamentNode(_ match: MatchXPItem, crowdMatch: CrowdMatchItem?) -> some View {
        let isMiss = match.tier == "submitted"
        let color: Color = tierColor(match.tier)
        let fillColor: Color = isMiss ? Color.sp.mist : color.opacity(0.2)
        let borderColor: Color = isMiss ? Color.sp.silver : color
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
                .font(SPTypography.mono(size: 8, weight: .medium))
                .foregroundStyle(Color.sp.silver)
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
            .font(.system(size: 10, weight: .semibold, design: .rounded))
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color.sp.ink, in: RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
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
        case "exact": return AppColors.tierExact
        case "winner_gd": return AppColors.tierWinnerGd
        case "winner": return AppColors.tierWinner
        default: return AppColors.tierMiss
        }
    }

    private func runLegendItem(color: Color, label: String) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(color)
                .frame(width: 7, height: 7)
            Text(label)
                .font(SPTypography.detail)
                .foregroundStyle(Color.sp.slate)
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
        .spCard()
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
                .font(SPTypography.sectionHeader)
                .foregroundStyle(Color.sp.ink)
                .frame(maxWidth: .infinity, alignment: .leading)

            HStack {
                Spacer()
                VStack(spacing: 4) {
                    Text("YOU")
                        .spCaption()
                        .foregroundStyle(Color.sp.primary)
                    Text("\(userAccuracy)%")
                        .font(SPTypography.mono(size: 32, weight: .heavy))
                        .foregroundStyle(Color.sp.primary)
                }

                Spacer()

                ZStack {
                    Circle()
                        .fill(Color.sp.mist)
                        .frame(width: 36, height: 36)
                        .overlay(
                            Circle()
                                .strokeBorder(Color.sp.silver, lineWidth: AppDesign.Border.thin)
                        )
                    Text("VS")
                        .font(.system(size: 11, weight: .heavy, design: .rounded))
                        .foregroundStyle(Color.sp.slate)
                }

                Spacer()

                VStack(spacing: 4) {
                    Text("POOL AVG")
                        .spCaption()
                        .foregroundStyle(Color.sp.slate)
                    Text("\(crowdAccuracy)%")
                        .font(SPTypography.mono(size: 32, weight: .heavy))
                        .foregroundStyle(Color.sp.silver)
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
                    .font(SPTypography.body)
                    .foregroundStyle(Color.sp.slate)
                Spacer()
                Text("\(you) vs \(crowd)")
                    .font(SPTypography.mono(size: 10))
                    .foregroundStyle(Color.sp.silver)
            }

            GeometryReader { geo in
                HStack(spacing: 2) {
                    Capsule()
                        .fill(Color.sp.primary)
                        .frame(width: max(geo.size.width * youPct / 100 - 1, 2))

                    Capsule()
                        .fill(Color.sp.silver)
                        .frame(width: max(geo.size.width * crowdPct / 100 - 1, 2))
                }
            }
            .frame(height: 8)
        }
    }

    private func performanceCallout(isOutperforming: Bool, accuracyDiff: Int, contrarianAdv: Int, showContrarian: Bool) -> some View {
        let accentColor: Color = isOutperforming ? AppColors.outperforming : AppColors.primary500
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
                    .font(SPTypography.cardTitle)
                    .foregroundStyle(accentColor)

                if showContrarian {
                    Text("Your contrarian win rate is \(contrarianAdv)% higher than average")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.slate)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(accentColor.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
        .overlay(
            RoundedRectangle(cornerRadius: SPDesign.Radius.sm)
                .strokeBorder(accentColor.opacity(0.13), lineWidth: AppDesign.Border.thin)
        )
    }

    // MARK: - Pool Stats

    private func poolStatsSection(_ stats: PoolStatsData) -> some View {
        let topPredictable = Array(stats.mostPredictable.prefix(3))
        let topUpsets = Array(stats.leastPredictable.prefix(3))

        return VStack(alignment: .leading, spacing: 0) {
            // Header
            Text("Pool-Wide Stats")
                .font(SPTypography.sectionHeader)
                .foregroundStyle(Color.sp.ink)
                .padding(.horizontal, 18)
                .padding(.top, 18)
                .padding(.bottom, 14)

            // Summary stats row
            HStack(spacing: 0) {
                VStack(spacing: 2) {
                    Text("\(Int(round(stats.avgAccuracy * 100)))%")
                        .font(SPTypography.mono(size: 24, weight: .heavy))
                        .foregroundStyle(Color.sp.ink)
                    Text("Avg Pool Accuracy")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.slate)
                }
                .frame(maxWidth: .infinity)

                VStack(spacing: 2) {
                    Text("\(stats.totalEntries)")
                        .font(SPTypography.mono(size: 24, weight: .heavy))
                        .foregroundStyle(Color.sp.ink)
                    Text("Competitors")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.slate)
                }
                .frame(maxWidth: .infinity)

                VStack(spacing: 2) {
                    Text("\(stats.completedMatches)")
                        .font(SPTypography.mono(size: 24, weight: .heavy))
                        .foregroundStyle(Color.sp.ink)
                    Text("Matches Scored")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.slate)
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
                        .foregroundStyle(Color.sp.green)
                    Text("Most Predictable")
                        .font(SPTypography.caption)
                        .foregroundStyle(Color.sp.green)
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 8)

                VStack(spacing: 0) {
                    ForEach(Array(topPredictable.enumerated()), id: \.element.id) { idx, match in
                        predictableMatchRow(index: idx, match: match, color: AppColors.success500, isLast: idx == topPredictable.count - 1)
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
                        .foregroundStyle(Color.sp.red)
                    Text("Biggest Upsets")
                        .font(SPTypography.caption)
                        .foregroundStyle(Color.sp.red)
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 8)

                VStack(spacing: 0) {
                    ForEach(Array(topUpsets.enumerated()), id: \.element.id) { idx, match in
                        predictableMatchRow(index: idx, match: match, color: AppColors.error500, isLast: idx == topUpsets.count - 1)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 16)
            }
        }
        .spCard()
    }

    private func predictableMatchRow(index: Int, match: PredictableMatch, color: Color, isLast: Bool) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text("\(index + 1). \(match.homeTeam) vs \(match.awayTeam)")
                    .font(SPTypography.body)
                    .foregroundStyle(Color.sp.slate)
                    .lineLimit(1)

                Spacer()

                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.sp.mist)
                        .frame(width: 40, height: 4)
                    Capsule()
                        .fill(color)
                        .frame(width: max(40 * match.hitRate, 2), height: 4)
                }

                Text("\(Int(round(match.hitRate * 100)))%")
                    .font(SPTypography.mono(size: 11, weight: .semibold))
                    .foregroundStyle(color)
                    .frame(width: 34, alignment: .trailing)
            }
            .padding(.vertical, 8)

            if !isLast {
                Divider()
            }
        }
    }

    // MARK: - Shared Helpers

    private func sectionHeader(_ title: String, subtitle: String? = nil) -> some View {
        HStack {
            Text(title)
                .font(SPTypography.cardTitle)
                .foregroundStyle(Color.sp.ink)
            Spacer()
            if let subtitle {
                Text(subtitle)
                    .font(SPTypography.detail)
                    .foregroundStyle(Color.sp.slate)
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
            .background(Color.sp.snow)

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
                        .font(SPTypography.mono(size: 18, weight: .black))
                        .foregroundStyle(lvlColor)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(xp.currentLevel.name)
                        .font(SPTypography.sectionHeader)
                        .foregroundStyle(Color.sp.ink)
                    Text("\(xp.totalXp.formatted()) XP")
                        .font(SPTypography.mono(size: 14, weight: .semibold))
                        .foregroundStyle(Color.sp.slate)
                    Text(progressText)
                        .font(SPTypography.body)
                        .foregroundStyle(Color.sp.slate)
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
        let circleFill: Color = isReached ? Color.sp.green : Color.sp.silver
        let nameColor: Color = isCurrent ? lvlColor : (isReached ? Color.sp.ink : Color.sp.slate)
        let xpColor: Color = isCurrent ? lvlColor : (isReached ? Color.sp.green : Color.sp.silver)
        let bgColor: Color = isCurrent ? lvlColor.opacity(0.08) : (isReached ? Color.sp.greenLight : Color.sp.mist)

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
                        .font(SPTypography.mono(size: 14, weight: .bold))
                        .foregroundStyle(Color.sp.slate)
                }
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(level.name)
                    .font(SPTypography.body)
                    .foregroundStyle(nameColor)

                if let badge = level.badge {
                    Text("Unlocks: \(badge)")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.silver)
                }
            }

            Spacer()

            Text("\(level.xpRequired.formatted()) XP")
                .font(SPTypography.mono(size: 12, weight: .medium))
                .foregroundStyle(xpColor)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(bgColor)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
        .overlay(
            RoundedRectangle(cornerRadius: SPDesign.Radius.sm)
                .strokeBorder(isCurrent ? lvlColor.opacity(0.3) : .clear, lineWidth: AppDesign.Border.thin)
        )
    }

    private var xpSummary: some View {
        VStack(spacing: 8) {
            Text("\(xp.totalXp.formatted()) XP")
                .font(SPTypography.mono(size: 28, weight: .black))
                .foregroundStyle(levelColor(xp.currentLevel.level))

            if let next = xp.nextLevel {
                Text("\(xp.xpToNextLevel.formatted()) XP to \(next.name)")
                    .font(SPTypography.body)
                    .foregroundStyle(Color.sp.slate)
            } else {
                Text("Maximum level reached")
                    .font(SPTypography.body)
                    .foregroundStyle(Color.sp.slate)
            }

            HStack(spacing: 8) {
                xpPill("Match XP", value: xp.totalBaseXp, color: AppColors.xpMatch)
                xpPill("Bonus XP", value: xp.totalBonusXp, color: AppColors.xpBonus)
                xpPill("Badge XP", value: xp.totalBadgeXp, color: AppColors.xpBadge)
            }
            .padding(.top, 4)
        }
        .padding(.vertical, 16)
    }

    private func xpPill(_ label: String, value: Int, color: Color) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(SPTypography.caption)
                .foregroundStyle(color)
            Text("\(value.formatted())")
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundStyle(color)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(color.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
        .overlay(
            RoundedRectangle(cornerRadius: SPDesign.Radius.sm)
                .strokeBorder(color.opacity(0.2), lineWidth: AppDesign.Border.thin)
        )
    }

    private func levelColor(_ level: Int) -> Color {
        AppColors.levelColor(level)
    }
}
