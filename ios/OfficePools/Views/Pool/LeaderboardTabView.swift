import SwiftUI

struct LeaderboardTabView: View {
    let poolId: String
    let leaderboardData: [LeaderboardEntryData]
    let response: LeaderboardResponse?
    let currentUserId: String?
    let awardsForEntry: (String) -> [PoolAward]
    let isCurrentUser: (String) -> Bool

    var body: some View {
        if leaderboardData.isEmpty {
            ContentUnavailableView("No Entries Yet", systemImage: "trophy", description: Text("The leaderboard will appear once entries are submitted."))
        } else {
            ScrollView {
                LazyVStack(spacing: 16) {
                    if let mvp = response?.matchdayMvp {
                        matchdayMVPBanner(mvp)
                    }

                    if leaderboardData.count >= 3 {
                        podiumView
                    }

                    legendView

                    let startIndex = min(3, leaderboardData.count)
                    if startIndex < leaderboardData.count {
                        ForEach(Array(leaderboardData[startIndex...].enumerated()), id: \.element.entryId) { index, entry in
                            leaderboardRow(entry: entry, rank: startIndex + index + 1)
                        }
                    }

                    if leaderboardData.count < 3 {
                        ForEach(Array(leaderboardData.enumerated()), id: \.element.entryId) { index, entry in
                            leaderboardRow(entry: entry, rank: index + 1)
                        }
                    }

                    if let superlatives = response?.superlatives, !superlatives.isEmpty {
                        superlativesSection(superlatives)
                    }

                    if let info = response?.matchdayInfo {
                        matchdayInfoBar(info)
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 20)
                .animation(.easeInOut(duration: 0.8), value: leaderboardData.map(\.entryId))
            }
            .background(Color.sp.snow)
        }
    }

    // MARK: - Matchday MVP Banner

    private func matchdayMVPBanner(_ mvp: MatchdayMVP) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "star.fill")
                .font(.title3)
                .foregroundStyle(Color.sp.accent)

            VStack(alignment: .leading, spacing: 2) {
                Text("MATCHDAY MVP")
                    .spCaption()
                    .foregroundStyle(Color.sp.slate)
                Text("\(mvp.entryName.isEmpty ? mvp.fullName : mvp.entryName) scored \(mvp.matchPoints) pts on Match \(mvp.matchNumber)")
                    .font(SPTypography.body)
                    .foregroundStyle(Color.sp.ink)
            }
            Spacer()
        }
        .padding(14)
        .background(Color.sp.surface)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
        .spCardShadow()
        .overlay {
            RoundedRectangle(cornerRadius: SPDesign.Radius.lg)
                .strokeBorder(Color.sp.accent.opacity(0.3), lineWidth: AppDesign.Border.accent)
        }
    }

    // MARK: - Podium

    private var podiumView: some View {
        HStack(alignment: .bottom, spacing: 8) {
            podiumEntry(entry: leaderboardData[1], rank: 2, pedestalHeight: 105, medalIcon: "medal.fill", ringColor: Color.sp.silver)
            podiumEntry(entry: leaderboardData[0], rank: 1, pedestalHeight: 130, medalIcon: "trophy.fill", ringColor: Color.sp.accent)
            podiumEntry(entry: leaderboardData[2], rank: 3, pedestalHeight: 85, medalIcon: "medal.fill", ringColor: AppColors.bronze)
        }
        .padding(.top, 8)
    }

    private func podiumEntry(entry: LeaderboardEntryData, rank: Int, pedestalHeight: CGFloat, medalIcon: String, ringColor: Color) -> some View {
        let entryAwards = awardsForEntry(entry.entryId)

        return NavigationLink(destination: PointsBreakdownView(
            poolId: poolId,
            entryId: entry.entryId,
            entryName: entry.entryName,
            playerName: entry.fullName,
            rank: rank
        )) {
        VStack(spacing: 6) {
            ZStack {
                Circle()
                    .stroke(ringColor, lineWidth: 3)
                    .frame(width: 52, height: 52)
                    .overlay {
                        Image(systemName: medalIcon)
                            .font(.title2)
                            .foregroundStyle(ringColor)
                    }

                if let delta = entry.rankDelta(currentPosition: rank), delta != 0 {
                    HStack(spacing: 1) {
                        Image(systemName: delta > 0 ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill")
                            .font(.system(size: 7))
                        Text("\(abs(delta))")
                            .font(.system(size: 8, weight: .bold).monospacedDigit())
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(delta > 0 ? Color.sp.green : Color.sp.red)
                    .clipShape(Capsule())
                    .offset(x: 22, y: 20)
                }

                if !entryAwards.isEmpty {
                    ZStack {
                        ForEach(Array(entryAwards.enumerated()), id: \.element.id) { index, award in
                            let fanAngle = Double(index) * 15 - Double(entryAwards.count - 1) * 7.5
                            let xOffset = Double(index) * 6

                            Image(systemName: podiumAwardIcon(for: award.type))
                                .font(.system(size: 9))
                                .foregroundStyle(.white)
                                .padding(5)
                                .background(awardColor(for: award.type))
                                .clipShape(Circle())
                                .rotationEffect(.degrees(fanAngle))
                                .offset(x: xOffset - Double(entryAwards.count - 1) * 3)
                        }
                    }
                    .offset(x: -22, y: 20)
                }
            }
            .frame(height: 60)

            Text(entry.entryName.isEmpty ? entry.fullName : entry.entryName)
                .font(SPTypography.cardTitle)
                .foregroundStyle(Color.sp.ink)
                .lineLimit(1)
                .truncationMode(.tail)

            Text("@\(entry.username)")
                .font(SPTypography.detail)
                .foregroundStyle(Color.sp.slate)
                .lineLimit(1)

            if let level = entry.level, let levelName = entry.levelName {
                LevelPillView(level: level, name: levelName)
            }

            if let lastFive = entry.lastFive {
                FormDotsView(results: lastFive, streak: entry.currentStreak)
            }

            VStack(spacing: 4) {
                Text("\(entry.totalPoints)")
                    .font(SPTypography.mono(size: 20, weight: .black))
                    .foregroundStyle(Color.sp.primary)
                    .contentTransition(.numericText(value: Double(entry.totalPoints)))
                    .animation(.spring(response: 1.2, dampingFraction: 0.6), value: entry.totalPoints)

                Text("\(entry.matchPoints) + \(entry.bonusPoints)")
                    .font(SPTypography.detail)
                    .foregroundStyle(Color.sp.slate)

                if let hitRate = entry.hitRate, let exactCount = entry.exactCount {
                    Text("\(exactCount) exact · \(Int(hitRate))%")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.slate)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: pedestalHeight)
            .background(pedestalFill(for: rank))
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md, style: .continuous))
        }
        .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    private func podiumAwardIcon(for type: String) -> String {
        switch type {
        case "mvp": return "trophy.fill"
        case "contrarian": return "dice.fill"
        case "crowd": return "person.3.fill"
        case "hot": return "flame.fill"
        case "cold": return "snowflake"
        default: return "star.fill"
        }
    }

    private func awardColor(for type: String) -> Color {
        switch type {
        case "mvp": return Color.sp.accent
        case "contrarian": return Color.sp.primary
        case "crowd": return Color.sp.primary.opacity(0.7)
        case "hot": return Color.sp.red
        case "cold": return Color.sp.primary.opacity(0.5)
        default: return Color.sp.slate
        }
    }

    private func pedestalFill(for rank: Int) -> some ShapeStyle {
        switch rank {
        case 1: return Color.sp.accent.opacity(0.08)
        case 2: return Color.sp.silver.opacity(0.15)
        case 3: return AppColors.bronze.opacity(0.1)
        default: return Color.clear
        }
    }

    // MARK: - Legend

    private var legendView: some View {
        HStack(spacing: 12) {
            legendDot(color: AppColors.tierExact, label: "Exact")
            legendDot(color: AppColors.tierWinnerGd, label: "W+GD")
            legendDot(color: AppColors.tierWinner, label: "Winner")
            legendDot(color: Color.sp.red, label: "Miss")
        }
        .spCaption()
        .foregroundStyle(Color.sp.slate)
        .padding(.vertical, 4)
    }

    private func legendDot(color: Color, label: String) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(label)
        }
    }

    // MARK: - Leaderboard Row

    private func leaderboardRow(entry: LeaderboardEntryData, rank: Int) -> some View {
        let isCurrent = isCurrentUser(entry.entryId)
        let entryAwards = awardsForEntry(entry.entryId)

        return NavigationLink(destination: PointsBreakdownView(
            poolId: poolId,
            entryId: entry.entryId,
            entryName: entry.entryName,
            playerName: entry.fullName,
            rank: rank
        )) {
        HStack(spacing: 12) {
            VStack(spacing: 2) {
                Text("#\(rank)")
                    .font(SPTypography.mono(size: 14, weight: .black))
                    .foregroundStyle(SPTypography.rankColor(rank))

                if let delta = entry.rankDelta(currentPosition: rank), delta != 0 {
                    HStack(spacing: 1) {
                        Image(systemName: delta > 0 ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill")
                            .font(.system(size: 8))
                        Text("\(abs(delta))")
                            .font(.system(size: 9, weight: .bold).monospacedDigit())
                    }
                    .foregroundStyle(delta > 0 ? Color.sp.green : Color.sp.red)
                }
            }
            .frame(width: 36)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(entry.entryName.isEmpty ? entry.fullName : entry.entryName)
                        .font(SPTypography.cardTitle)
                        .foregroundStyle(Color.sp.ink)
                        .lineLimit(1)

                    if isCurrent {
                        Text("YOU")
                            .font(.system(size: 9, weight: .bold, design: .rounded))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.sp.primaryLight)
                            .foregroundStyle(Color.sp.primary)
                            .clipShape(Capsule())
                    }
                }

                HStack(spacing: 6) {
                    Text("@\(entry.username)")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.slate)

                    if let level = entry.level, let levelName = entry.levelName {
                        LevelPillView(level: level, name: levelName)
                    }
                }

                if !entryAwards.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(entryAwards) { award in
                            AwardBadgeView(award: award)
                        }
                    }
                }

                if let lastFive = entry.lastFive {
                    FormDotsView(results: lastFive, streak: entry.currentStreak)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text("\(entry.totalPoints)")
                    .font(SPTypography.mono(size: 17, weight: .black))
                    .foregroundStyle(Color.sp.primary)
                    .contentTransition(.numericText(value: Double(entry.totalPoints)))
                    .animation(.spring(response: 1.2, dampingFraction: 0.6), value: entry.totalPoints)

                Text("\(entry.matchPoints) + \(entry.bonusPoints)")
                    .font(SPTypography.detail)
                    .foregroundStyle(Color.sp.slate)

                if let hitRate = entry.hitRate, let exactCount = entry.exactCount {
                    Text("\(exactCount) exact · \(Int(hitRate))%")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.slate)
                }
            }

            Image(systemName: "chevron.right")
                .font(.caption2)
                .foregroundStyle(Color.sp.slate)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: SPDesign.Radius.lg)
                .fill(isCurrent ? Color.sp.primaryLight : Color.sp.surface)
        )
        .spCardShadow()
        .overlay(
            RoundedRectangle(cornerRadius: SPDesign.Radius.lg)
                .strokeBorder(isCurrent ? Color.sp.primary.opacity(0.25) : Color.sp.silver.opacity(0.5), lineWidth: isCurrent ? AppDesign.Border.accent : AppDesign.Border.thin)
        )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Superlatives

    private func superlativesSection(_ superlatives: [Superlative]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Pool Superlatives")
                .font(SPTypography.sectionHeader)
                .foregroundStyle(Color.sp.ink)
                .padding(.top, 8)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(superlatives) { superlative in
                    VStack(spacing: 6) {
                        Image(systemName: superlativeIcon(for: superlative.type))
                            .font(.title2)
                            .foregroundStyle(superlativeColor(for: superlative.type))
                        Text(superlative.title)
                            .font(SPTypography.caption)
                            .foregroundStyle(Color.sp.ink)
                            .multilineTextAlignment(.center)
                            .textCase(.uppercase)
                            .tracking(1)
                        Text(superlative.name)
                            .font(SPTypography.body)
                            .foregroundStyle(Color.sp.primary)
                            .lineLimit(1)
                        Text(superlative.detail)
                            .font(SPTypography.detail)
                            .foregroundStyle(Color.sp.slate)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(12)
                    .spCard()
                }
            }
        }
    }

    private func superlativeIcon(for type: String) -> String {
        switch type {
        case "hot": return "flame.fill"
        case "cold": return "snowflake"
        case "contrarian": return "dice.fill"
        case "crowd": return "person.3.fill"
        case "sharpshooter": return "scope"
        case "climber": return "arrow.up.right"
        case "faller": return "arrow.down.right"
        default: return "star.fill"
        }
    }

    private func superlativeColor(for type: String) -> Color {
        switch type {
        case "hot": return Color.sp.red
        case "cold": return Color.sp.primary
        case "contrarian": return Color.sp.primary
        case "crowd": return Color.sp.primary.opacity(0.7)
        case "sharpshooter": return Color.sp.accent
        case "climber": return Color.sp.green
        case "faller": return Color.sp.red
        default: return Color.sp.accent
        }
    }

    // MARK: - Matchday Info

    private func matchdayInfoBar(_ info: MatchdayInfo) -> some View {
        HStack {
            if let lastMatch = info.lastMatchNumber {
                Text("Last: Match \(lastMatch)")
                    .font(SPTypography.detail)
                    .foregroundStyle(Color.sp.slate)
            }

            Spacer()

            Text("\(info.completedCount)/\(info.totalCount) played")
                .font(SPTypography.detail)
                .foregroundStyle(Color.sp.slate)

            if let nextDate = info.nextMatchDate {
                Spacer()
                Text("Next: \(SPDateFormatter.short(nextDate))")
                    .font(SPTypography.detail)
                    .foregroundStyle(Color.sp.slate)
            }
        }
        .padding(12)
        .background(Color.sp.mist)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
    }
}

// MARK: - Reusable Sub-views

struct FormDotsView: View {
    let results: [String]
    let streak: StreakInfo?
    @State private var visibleCount: Int = 0

    var body: some View {
        HStack(spacing: 3) {
            ForEach(Array(results.enumerated()), id: \.offset) { index, result in
                Circle()
                    .fill(dotColor(for: result))
                    .frame(width: 8, height: 8)
                    .scaleEffect(index < visibleCount ? 1 : 0)
                    .opacity(index < visibleCount ? 1 : 0)
                    .animation(
                        .spring(response: 0.4, dampingFraction: 0.45, blendDuration: 0.1)
                            .delay(0.15 + Double(index) * 0.12),
                        value: visibleCount
                    )
            }

            if let streak = streak, streak.length >= 3 {
                HStack(spacing: 1) {
                    Image(systemName: streak.type == "hot" ? "flame.fill" : "snowflake")
                        .font(.system(size: 9))
                        .foregroundStyle(streak.type == "hot" ? Color.sp.amber : Color.sp.primary)
                    Text("\(streak.length)")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(streak.type == "hot" ? Color.sp.amber : Color.sp.primary)
                }
                .opacity(visibleCount >= results.count ? 1 : 0)
                .animation(.easeIn(duration: 0.3).delay(0.15 + Double(results.count) * 0.12), value: visibleCount)
            }
        }
        .onAppear {
            visibleCount = results.count
        }
    }

    private func dotColor(for result: String) -> Color {
        switch result {
        case "exact": return AppColors.tierExact
        case "winner_gd": return AppColors.tierWinnerGd
        case "winner": return AppColors.tierWinner
        case "miss": return Color.sp.red
        case "no_pick": return Color.sp.mist
        default: return Color.sp.mist
        }
    }
}

struct LevelPillView: View {
    let level: Int
    let name: String

    var body: some View {
        Text("Lv.\(level) \(name)")
            .font(.system(size: 9, weight: .semibold, design: .rounded))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(pillBackground)
            .foregroundStyle(pillForeground)
            .clipShape(Capsule())
    }

    private var pillBackground: Color {
        switch level {
        case 10: return Color.sp.accent
        case 8...9: return Color.sp.amber.opacity(0.15)
        case 6...7: return Color.sp.primary.opacity(0.12)
        case 4...5: return Color.sp.primary.opacity(0.08)
        default: return Color.sp.mist
        }
    }

    private var pillForeground: Color {
        switch level {
        case 10: return .white
        case 8...9: return Color.sp.amber
        case 6...7: return Color.sp.primary
        case 4...5: return Color.sp.primary
        default: return Color.sp.slate
        }
    }
}

struct AwardBadgeView: View {
    let award: PoolAward

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: awardIcon)
                .font(.system(size: 9))
            Text(award.label)
                .font(.system(size: 9, weight: .medium, design: .rounded))
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(badgeBackground)
        .foregroundStyle(badgeForeground)
        .clipShape(Capsule())
    }

    private var awardIcon: String {
        switch award.type {
        case "mvp": return "trophy.fill"
        case "contrarian": return "dice.fill"
        case "crowd": return "person.3.fill"
        case "hot": return "flame.fill"
        case "cold": return "snowflake"
        default: return "star.fill"
        }
    }

    private var badgeBackground: Color {
        switch award.type {
        case "mvp": return Color.sp.accent.opacity(0.15)
        case "contrarian": return Color.sp.primary.opacity(0.12)
        case "crowd": return Color.sp.primary.opacity(0.1)
        case "hot": return Color.sp.red.opacity(0.12)
        case "cold": return Color.sp.primary.opacity(0.08)
        default: return Color.sp.mist
        }
    }

    private var badgeForeground: Color {
        switch award.type {
        case "mvp": return Color.sp.accent
        case "contrarian": return Color.sp.primary
        case "crowd": return Color.sp.primary
        case "hot": return Color.sp.red
        case "cold": return Color.sp.primary
        default: return Color.sp.slate
        }
    }
}
