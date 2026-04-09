import SwiftUI

struct PointsBreakdownView: View {
    let poolId: String
    let entryId: String
    let entryName: String
    let playerName: String
    let rank: Int

    @State private var breakdown: PointsBreakdownResponse?
    @State private var adjustments: [PointAdjustment] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var headerHeight: CGFloat = 120

    private let apiService = APIService()
    private let poolService = PoolService()

    private let stageOrder = ["group", "round_32", "round_16", "quarter_final", "semi_final", "third_place", "final"]
    private let bonusCategoryOrder = ["group_standings", "qualification", "bracket", "tournament"]

    var body: some View {
        Group {
            if isLoading {
                VStack(spacing: 12) {
                    ProgressView()
                        .controlSize(.large)
                    Text("Loading breakdown...")
                        .font(SPTypography.body)
                        .foregroundStyle(Color.sp.slate)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.sp.snow)
            } else if let error = errorMessage {
                ContentUnavailableView("Error", systemImage: "exclamationmark.triangle", description: Text(error))
            } else if let breakdown = breakdown {
                breakdownContent(breakdown)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadBreakdown()
        }
    }

    // MARK: - Main Content

    private func breakdownContent(_ data: PointsBreakdownResponse) -> some View {
        ZStack(alignment: .top) {
            ScrollView {
                VStack(spacing: 16) {
                    summaryCards(data.summary, adjustment: data.entry.pointAdjustment)

                    if data.entry.pointAdjustment != 0 {
                        adjustmentSection(data.entry)
                    }

                    if !data.matchResults.isEmpty {
                        matchPointsSection(data.matchResults)
                    }

                    if !data.bonusEntries.isEmpty {
                        bonusPointsSection(data.bonusEntries)
                    }

                    scoringRulesSection(data.poolSettings)
                }
                .padding(.top, headerHeight + 16)
                .padding(.horizontal)
                .padding(.bottom, 24)
            }
            .background(Color.sp.snow)

            headerSection(data)
        }
    }

    // MARK: - Header

    private func headerSection(_ data: PointsBreakdownResponse) -> some View {
        VStack(spacing: 6) {
            HStack(spacing: 12) {
                Text("#\(rank)")
                    .font(SPTypography.mono(size: rank >= 10 ? 15 : 18, weight: .black))
                    .foregroundStyle(.white)
                    .frame(minWidth: 40, minHeight: 40)
                    .frame(width: rank >= 100 ? 50 : 40, height: 40)
                    .background(SPTypography.rankColor(rank))
                    .clipShape(Capsule())

                VStack(alignment: .leading, spacing: 2) {
                    Text(data.user.fullName)
                        .font(SPTypography.cardTitle)
                        .foregroundStyle(Color.sp.ink)

                    HStack(spacing: 6) {
                        if !data.entry.entryName.isEmpty {
                            Text(data.entry.entryName)
                                .font(SPTypography.body)
                                .foregroundStyle(Color.sp.slate)
                        }
                        Text("@\(data.user.username)")
                            .font(SPTypography.detail)
                            .foregroundStyle(Color.sp.slate)
                    }
                }

                Spacer()
            }
            .padding(.horizontal, 20)
        }
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
        .spCardShadow()
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

    // MARK: - Summary Cards

    private func summaryCards(_ summary: BreakdownSummary, adjustment: Int) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                summaryCell(title: "MATCH", value: "\(summary.matchPoints)", color: Color.sp.primary)
                verticalDivider
                summaryCell(title: "BONUS", value: "\(summary.bonusPoints)", color: Color.sp.amber)
                if adjustment != 0 {
                    verticalDivider
                    summaryCell(title: "ADJ.", value: "\(adjustment)", color: Color.sp.amber)
                }
                verticalDivider
                summaryCell(title: "TOTAL", value: "\(summary.totalPoints)", color: Color.sp.ink, bold: true)
            }
            .padding(.vertical, 14)
        }
        .spCard()
    }

    private var verticalDivider: some View {
        Rectangle()
            .fill(Color.sp.silver.opacity(0.4))
            .frame(width: 1, height: 36)
    }

    private func summaryCell(title: String, value: String, color: Color, bold: Bool = false) -> some View {
        VStack(spacing: 4) {
            Text(title)
                .spCaption()
                .foregroundStyle(Color.sp.slate)
            Text(value)
                .font(SPTypography.mono(size: bold ? 24 : 20, weight: bold ? .black : .bold))
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Adjustment Section

    private func adjustmentSection(_ entry: BreakdownEntry) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Point Adjustments")
                    .font(SPTypography.sectionHeader)
                    .foregroundStyle(Color.sp.ink)
                Spacer()
                Text(entry.pointAdjustment > 0 ? "+\(entry.pointAdjustment)" : "\(entry.pointAdjustment)")
                    .font(SPTypography.mono(size: 17, weight: .bold))
                    .foregroundStyle(entry.pointAdjustment > 0 ? Color.sp.green : Color.sp.red)
            }

            Divider()
                .background(Color.sp.silver.opacity(0.5))

            if !adjustments.isEmpty {
                ForEach(adjustments) { adj in
                    HStack(alignment: .top, spacing: 10) {
                        Text(adj.amount > 0 ? "+\(adj.amount)" : "\(adj.amount)")
                            .font(SPTypography.mono(size: 14, weight: .bold))
                            .foregroundStyle(adj.amount > 0 ? Color.sp.green : Color.sp.red)
                            .frame(width: 44, alignment: .trailing)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(adj.reason)
                                .font(SPTypography.body)
                                .foregroundStyle(Color.sp.ink)
                            Text(SPDateFormatter.long(adj.createdAt))
                                .font(SPTypography.detail)
                                .foregroundStyle(Color.sp.slate)
                        }

                        Spacer()
                    }
                    .padding(10)
                    .background(Color.sp.amberLight)
                    .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
                }
            } else if let reason = entry.adjustmentReason, !reason.isEmpty {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "info.circle.fill")
                        .foregroundStyle(Color.sp.amber)
                        .font(.subheadline)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Reason")
                            .spCaption()
                            .foregroundStyle(Color.sp.slate)
                        Text(reason)
                            .font(SPTypography.body)
                            .foregroundStyle(Color.sp.ink)
                    }
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.sp.amberLight)
                .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
            }
        }
        .padding(16)
        .spCard()
    }

    // MARK: - Match Points Section

    private func matchPointsSection(_ results: [MatchResultData]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Match Points")

            let grouped = Dictionary(grouping: results, by: { $0.stage })

            ForEach(stageOrder, id: \.self) { stage in
                if let stageResults = grouped[stage], !stageResults.isEmpty {
                    stageCard(stage: stage, results: stageResults)
                }
            }
        }
    }

    private func stageCard(stage: String, results: [MatchResultData]) -> some View {
        let stageTotal = results.reduce(0) { $0 + $1.totalPoints }
        let exactCount = results.filter { $0.type == "exact" }.count
        let wgdCount = results.filter { $0.type == "winner_gd" }.count
        let winnerCount = results.filter { $0.type == "winner" }.count
        let missCount = results.filter { $0.type == "miss" }.count
        let multiplier = results.first?.multiplier ?? 1.0

        return VStack(spacing: 0) {
            HStack {
                Text(stageLabel(stage))
                    .font(SPTypography.cardTitle)
                    .foregroundStyle(Color.sp.ink)

                if multiplier > 1.0 {
                    Text("\(String(format: "%.1f", multiplier))x")
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.sp.primaryLight)
                        .foregroundStyle(Color.sp.primary)
                        .clipShape(Capsule())
                }

                Spacer()

                Text("\(stageTotal) pts")
                    .font(SPTypography.mono(size: 14, weight: .bold))
                    .foregroundStyle(Color.sp.primary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            HStack(spacing: 6) {
                if exactCount > 0 { countPill("\(exactCount) Exact", color: AppColors.tierExact) }
                if wgdCount > 0 { countPill("\(wgdCount) W+GD", color: AppColors.tierWinnerGd) }
                if winnerCount > 0 { countPill("\(winnerCount) Winner", color: AppColors.tierWinner) }
                if missCount > 0 { countPill("\(missCount) Miss", color: Color.sp.slate) }
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            ForEach(results.sorted(by: { $0.matchNumber < $1.matchNumber })) { result in
                matchRow(result)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
            }

            Spacer().frame(height: 8)
        }
        .spCard()
    }

    private func countPill(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.system(size: 10, weight: .semibold, design: .rounded))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.12))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }

    private func matchRow(_ result: MatchResultData) -> some View {
        let hasDifferentTeams = !result.teamsMatch
            && result.predictedHomeTeam != nil
            && result.predictedAwayTeam != nil

        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Text(typeLabel(result.type))
                    .font(.system(size: 9, weight: .bold, design: .rounded))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(typeColor(result.type).opacity(0.12))
                    .foregroundStyle(typeColor(result.type))
                    .clipShape(Capsule())
                    .frame(width: 52)

                VStack(spacing: 1) {
                    Text("\(result.predictedHome)-\(result.predictedAway)")
                        .font(SPTypography.mono(size: 12))
                    Text("Pred")
                        .font(.system(size: 8, weight: .medium, design: .rounded))
                        .foregroundStyle(Color.sp.slate)
                }
                .frame(width: 36)

                VStack(spacing: 1) {
                    Text("\(result.actualHome)-\(result.actualAway)")
                        .font(SPTypography.mono(size: 12))
                    Text("Actual")
                        .font(.system(size: 8, weight: .medium, design: .rounded))
                        .foregroundStyle(Color.sp.slate)
                }
                .frame(width: 40)

                Text("\(result.homeTeam) v \(result.awayTeam)")
                    .font(SPTypography.detail)
                    .foregroundStyle(Color.sp.slate)
                    .lineLimit(1)
                    .truncationMode(.tail)

                Spacer()

                Text(result.totalPoints > 0 ? "+\(result.totalPoints)" : "0")
                    .font(SPTypography.mono(size: 12, weight: .bold))
                    .foregroundStyle(result.totalPoints > 0 ? Color.sp.green : Color.sp.slate)
            }

            if hasDifferentTeams {
                HStack(spacing: 4) {
                    Image(systemName: "arrow.triangle.branch")
                        .font(.system(size: 8))
                        .foregroundStyle(Color.sp.amber)

                    Text("You predicted: \(result.predictedHomeTeam!) v \(result.predictedAwayTeam!)")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.amber)
                }
                .padding(.leading, 60)
            }
        }
    }

    // MARK: - Bonus Points Section

    private func bonusPointsSection(_ entries: [BonusEntryData]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Bonus Points")

            let grouped = Dictionary(grouping: entries, by: { $0.bonusCategory })

            ForEach(bonusCategoryOrder, id: \.self) { category in
                if let categoryEntries = grouped[category], !categoryEntries.isEmpty {
                    bonusCategoryCard(category: category, entries: categoryEntries)
                }
            }

            let remainingCategories = Set(grouped.keys).subtracting(Set(bonusCategoryOrder))
            ForEach(Array(remainingCategories).sorted(), id: \.self) { category in
                if let categoryEntries = grouped[category] {
                    bonusCategoryCard(category: category, entries: categoryEntries)
                }
            }
        }
    }

    private func bonusCategoryCard(category: String, entries: [BonusEntryData]) -> some View {
        let subtotal = entries.reduce(0) { $0 + $1.pointsEarned }

        return VStack(spacing: 0) {
            HStack {
                Text(bonusCategoryLabel(category))
                    .font(SPTypography.cardTitle)
                    .foregroundStyle(Color.sp.ink)
                Spacer()
                Text("\(subtotal) pts")
                    .font(SPTypography.mono(size: 14, weight: .bold))
                    .foregroundStyle(Color.sp.amber)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            ForEach(entries) { entry in
                HStack {
                    Text(entry.description)
                        .font(SPTypography.body)
                        .foregroundStyle(Color.sp.slate)
                    Spacer()
                    Text("+\(entry.pointsEarned)")
                        .font(SPTypography.mono(size: 12, weight: .bold))
                        .foregroundStyle(Color.sp.amber)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
            }

            Spacer().frame(height: 6)
        }
        .spCard()
    }

    // MARK: - Scoring Rules

    private func scoringRulesSection(_ settings: BreakdownPoolSettings) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Scoring Rules")

            sectionCard(title: "Group Stage Points") {
                ruleRow("Exact Score", value: settings.groupExactScore)
                ruleRow("Correct Winner + GD", value: settings.groupCorrectDifference)
                ruleRow("Correct Result Only", value: settings.groupCorrectResult)
            }

            sectionCard(title: "Knockout Base Points") {
                ruleRow("Exact Score", value: settings.knockoutExactScore)
                ruleRow("Correct Winner + GD", value: settings.knockoutCorrectDifference)
                ruleRow("Correct Result Only", value: settings.knockoutCorrectResult)
            }

            sectionCard(title: "Round Multipliers") {
                ruleRowMultiplier("Round of 32", multiplier: settings.round32Multiplier)
                ruleRowMultiplier("Round of 16", multiplier: settings.round16Multiplier)
                ruleRowMultiplier("Quarter Finals", multiplier: settings.quarterFinalMultiplier)
                ruleRowMultiplier("Semi Finals", multiplier: settings.semiFinalMultiplier)
                ruleRowMultiplier("Third Place", multiplier: settings.thirdPlaceMultiplier)
                ruleRowMultiplier("Final", multiplier: settings.finalMultiplier)
            }

            if settings.psoEnabled {
                sectionCard(title: "Penalty Shootout Bonus") {
                    if let v = settings.psoExactScore { ruleRow("Exact PSO Score", value: v) }
                    if let v = settings.psoCorrectDifference { ruleRow("Correct PSO Winner + GD", value: v) }
                    if let v = settings.psoCorrectResult { ruleRow("Correct PSO Winner", value: v) }
                }
            }
        }
    }

    private func sectionCard(title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text(title)
                    .font(SPTypography.cardTitle)
                    .foregroundStyle(Color.sp.ink)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            content()

            Spacer().frame(height: 6)
        }
        .spCard()
    }

    private func ruleRow(_ label: String, value: Int) -> some View {
        HStack {
            Text(label)
                .font(SPTypography.body)
                .foregroundStyle(Color.sp.slate)
            Spacer()
            Text("\(value) pts")
                .font(SPTypography.mono(size: 12))
                .foregroundStyle(Color.sp.slate)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
    }

    private func ruleRowMultiplier(_ label: String, multiplier: Double) -> some View {
        HStack {
            Text(label)
                .font(SPTypography.body)
                .foregroundStyle(Color.sp.slate)
            Spacer()
            Text("\(String(format: "%.1f", multiplier))x")
                .font(SPTypography.mono(size: 12))
                .foregroundStyle(Color.sp.primary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
    }

    // MARK: - Section Header

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(SPTypography.sectionHeader)
            .foregroundStyle(Color.sp.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .spCard()
    }

    // MARK: - Helpers

    private func stageLabel(_ stage: String) -> String {
        switch stage {
        case "group": return "Group Stage"
        case "round_32": return "Round of 32"
        case "round_16": return "Round of 16"
        case "quarter_final": return "Quarter Finals"
        case "semi_final": return "Semi Finals"
        case "third_place": return "Third Place"
        case "final": return "Final"
        default: return stage.capitalized
        }
    }

    private func bonusCategoryLabel(_ category: String) -> String {
        switch category {
        case "group_standings": return "Group Standings Bonus"
        case "qualification": return "Overall Qualification Bonus"
        case "bracket": return "Knockout & Bracket Bonus"
        case "tournament": return "Tournament Podium"
        default: return category.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    private func typeLabel(_ type: String) -> String {
        switch type {
        case "exact": return "Exact"
        case "winner_gd": return "W+GD"
        case "winner": return "Winner"
        case "miss": return "Miss"
        default: return type
        }
    }

    private func typeColor(_ type: String) -> Color {
        switch type {
        case "exact": return AppColors.tierExact
        case "winner_gd": return AppColors.tierWinnerGd
        case "winner": return AppColors.tierWinner
        case "miss": return Color.sp.slate
        default: return Color.sp.slate
        }
    }

    // MARK: - Data Loading

    private func loadBreakdown() async {
        do {
            async let breakdownTask = apiService.fetchPointsBreakdown(poolId: poolId, entryId: entryId)
            async let adjustmentsTask = poolService.fetchAdjustments(entryId: entryId)

            breakdown = try await breakdownTask
            adjustments = (try? await adjustmentsTask) ?? []
            isLoading = false
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
            print("[PointsBreakdown] Error loading: \(error)")
        }
    }
}
