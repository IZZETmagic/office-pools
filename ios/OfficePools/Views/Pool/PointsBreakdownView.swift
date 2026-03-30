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
                ProgressView("Loading breakdown...")
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
            // Scrollable content
            ScrollView {
                VStack(spacing: 16) {
                    // Summary Cards
                    summaryCards(data.summary, adjustment: data.entry.pointAdjustment)

                    // Adjustment Reason
                    if data.entry.pointAdjustment != 0 {
                        adjustmentSection(data.entry)
                    }

                    // Match Points Breakdown
                    if !data.matchResults.isEmpty {
                        matchPointsSection(data.matchResults)
                    }

                    // Bonus Points Breakdown
                    if !data.bonusEntries.isEmpty {
                        bonusPointsSection(data.bonusEntries)
                    }

                    // Scoring Rules
                    scoringRulesSection(data.poolSettings)
                }
                .padding(.top, headerHeight + 16)
                .padding(.horizontal)
                .padding(.bottom, 24)
            }
            .background(Color(.systemGroupedBackground))

            // Fixed header
            headerSection(data)
        }
    }

    // MARK: - Header (Fixed, glass)

    private func headerSection(_ data: PointsBreakdownResponse) -> some View {
        VStack(spacing: 6) {
            HStack(spacing: 12) {
                // Rank badge
                Text("#\(rank)")
                    .font(rank >= 10 ? .callout.weight(.black).monospacedDigit() : .title3.weight(.black).monospacedDigit())
                    .foregroundStyle(.white)
                    .frame(minWidth: 40, minHeight: 40)
                    .frame(width: rank >= 100 ? 50 : 40, height: 40)
                    .background(rankColor)
                    .clipShape(Capsule())

                VStack(alignment: .leading, spacing: 2) {
                    Text(data.user.fullName)
                        .font(.headline.weight(.bold))

                    HStack(spacing: 6) {
                        if !data.entry.entryName.isEmpty {
                            Text(data.entry.entryName)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        Text("@\(data.user.username)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()
            }
            .padding(.horizontal, 20)
        }
        .padding(.vertical, 16)
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

    private var rankColor: Color {
        switch rank {
        case 1: return AppColors.accent300
        case 2: return AppColors.neutral400
        case 3: return AppColors.bronze
        default: return AppColors.primary500
        }
    }

    // MARK: - Summary Cards

    private func summaryCards(_ summary: BreakdownSummary, adjustment: Int) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                summaryCell(title: "Match", value: "\(summary.matchPoints)", color: AppColors.xpMatch)
                verticalDivider
                summaryCell(title: "Bonus", value: "\(summary.bonusPoints)", color: AppColors.xpBonus)
                if adjustment != 0 {
                    verticalDivider
                    summaryCell(title: "Adj.", value: "\(adjustment)", color: AppColors.warning600)
                }
                verticalDivider
                summaryCell(title: "Total", value: "\(summary.totalPoints)", color: .primary, bold: true)
            }
            .padding(.vertical, 14)
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    private var verticalDivider: some View {
        Rectangle()
            .fill(Color(.separator).opacity(0.3))
            .frame(width: 1, height: 36)
    }

    private func summaryCell(title: String, value: String, color: Color, bold: Bool = false) -> some View {
        VStack(spacing: 4) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(bold ? .title2.weight(.black).monospacedDigit() : .title3.weight(.bold).monospacedDigit())
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Adjustment Section

    private func adjustmentSection(_ entry: BreakdownEntry) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Point Adjustments")
                    .font(.headline)
                Spacer()
                Text(entry.pointAdjustment > 0 ? "+\(entry.pointAdjustment)" : "\(entry.pointAdjustment)")
                    .font(.headline.weight(.bold).monospacedDigit())
                    .foregroundStyle(entry.pointAdjustment > 0 ? AppColors.success600 : AppColors.error600)
            }
            Divider()

            if !adjustments.isEmpty {
                ForEach(adjustments) { adj in
                    HStack(alignment: .top, spacing: 10) {
                        Text(adj.amount > 0 ? "+\(adj.amount)" : "\(adj.amount)")
                            .font(.subheadline.weight(.bold).monospacedDigit())
                            .foregroundStyle(adj.amount > 0 ? AppColors.success600 : AppColors.error600)
                            .frame(width: 44, alignment: .trailing)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(adj.reason)
                                .font(.subheadline)
                            Text(formattedAdjustmentDate(adj.createdAt))
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }

                        Spacer()
                    }
                    .padding(10)
                    .background(AppColors.warning600.opacity(0.06))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            } else if let reason = entry.adjustmentReason, !reason.isEmpty {
                // Fallback for legacy single-reason display
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "info.circle.fill")
                        .foregroundStyle(AppColors.warning600)
                        .font(.subheadline)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Reason")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(reason)
                            .font(.subheadline)
                    }
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(AppColors.warning600.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
        .padding(16)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    private func formattedAdjustmentDate(_ dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: dateString) ?? {
            formatter.formatOptions = [.withInternetDateTime]
            return formatter.date(from: dateString)
        }()
        guard let date else { return dateString }
        let display = DateFormatter()
        display.dateFormat = "MMM d, yyyy 'at' h:mm a"
        return display.string(from: date)
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
            // Stage header
            HStack {
                Text(stageLabel(stage))
                    .font(.subheadline.weight(.semibold))

                if multiplier > 1.0 {
                    Text("\(String(format: "%.1f", multiplier))x")
                        .font(.caption2.weight(.bold))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(AppColors.primary500.opacity(0.12))
                        .foregroundStyle(AppColors.primary600)
                        .clipShape(Capsule())
                }

                Spacer()

                Text("\(stageTotal) pts")
                    .font(.subheadline.weight(.bold).monospacedDigit())
                    .foregroundStyle(AppColors.primary500)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            // Summary pills
            HStack(spacing: 6) {
                if exactCount > 0 { countPill("\(exactCount) Exact", color: AppColors.tierExact) }
                if wgdCount > 0 { countPill("\(wgdCount) W+GD", color: AppColors.tierWinnerGd) }
                if winnerCount > 0 { countPill("\(winnerCount) Winner", color: AppColors.tierWinner) }
                if missCount > 0 { countPill("\(missCount) Miss", color: AppColors.neutral400) }
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            // Match rows
            ForEach(results.sorted(by: { $0.matchNumber < $1.matchNumber })) { result in
                matchRow(result)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
            }
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    private func countPill(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.system(size: 10, weight: .semibold))
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
                // Type badge
                Text(typeLabel(result.type))
                    .font(.system(size: 9, weight: .bold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(typeColor(result.type).opacity(0.12))
                    .foregroundStyle(typeColor(result.type))
                    .clipShape(Capsule())
                    .frame(width: 52)

                // Predicted score
                VStack(spacing: 1) {
                    Text("\(result.predictedHome)-\(result.predictedAway)")
                        .font(.caption.weight(.semibold).monospacedDigit())
                    Text("Pred")
                        .font(.system(size: 8))
                        .foregroundStyle(.tertiary)
                }
                .frame(width: 36)

                // Actual score
                VStack(spacing: 1) {
                    Text("\(result.actualHome)-\(result.actualAway)")
                        .font(.caption.weight(.semibold).monospacedDigit())
                    Text("Actual")
                        .font(.system(size: 8))
                        .foregroundStyle(.tertiary)
                }
                .frame(width: 40)

                // Teams
                Text("\(result.homeTeam) v \(result.awayTeam)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.tail)

                Spacer()

                // Points
                Text(result.totalPoints > 0 ? "+\(result.totalPoints)" : "0")
                    .font(.caption.weight(.bold).monospacedDigit())
                    .foregroundStyle(result.totalPoints > 0 ? AppColors.success600 : AppColors.neutral300)
            }

            // Second line: predicted teams (only when they differ)
            if hasDifferentTeams {
                HStack(spacing: 4) {
                    Image(systemName: "arrow.triangle.branch")
                        .font(.system(size: 8))
                        .foregroundStyle(AppColors.warning600)

                    Text("You predicted: \(result.predictedHomeTeam!) v \(result.predictedAwayTeam!)")
                        .font(.system(size: 10))
                        .foregroundStyle(AppColors.warning600)
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

            // Any remaining categories not in the standard order
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
            // Category header
            HStack {
                Text(bonusCategoryLabel(category))
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text("\(subtotal) pts")
                    .font(.subheadline.weight(.bold).monospacedDigit())
                    .foregroundStyle(AppColors.xpBonus)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            // Bonus rows
            ForEach(entries) { entry in
                HStack {
                    Text(entry.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("+\(entry.pointsEarned)")
                        .font(.caption.weight(.bold).monospacedDigit())
                        .foregroundStyle(AppColors.xpBonus)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
            }

            Spacer().frame(height: 6)
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    // MARK: - Scoring Rules

    private func scoringRulesSection(_ settings: BreakdownPoolSettings) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Scoring Rules")

            // Group Stage
            sectionCard(title: "Group Stage Points") {
                ruleRow("Exact Score", value: settings.groupExactScore)
                ruleRow("Correct Winner + GD", value: settings.groupCorrectDifference)
                ruleRow("Correct Result Only", value: settings.groupCorrectResult)
            }

            // Knockout Base
            sectionCard(title: "Knockout Base Points") {
                ruleRow("Exact Score", value: settings.knockoutExactScore)
                ruleRow("Correct Winner + GD", value: settings.knockoutCorrectDifference)
                ruleRow("Correct Result Only", value: settings.knockoutCorrectResult)
            }

            // Multipliers
            sectionCard(title: "Round Multipliers") {
                ruleRowMultiplier("Round of 32", multiplier: settings.round32Multiplier)
                ruleRowMultiplier("Round of 16", multiplier: settings.round16Multiplier)
                ruleRowMultiplier("Quarter Finals", multiplier: settings.quarterFinalMultiplier)
                ruleRowMultiplier("Semi Finals", multiplier: settings.semiFinalMultiplier)
                ruleRowMultiplier("Third Place", multiplier: settings.thirdPlaceMultiplier)
                ruleRowMultiplier("Final", multiplier: settings.finalMultiplier)
            }

            // PSO
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
            // Header
            HStack {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            // Rows
            content()

            Spacer().frame(height: 6)
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    private func ruleRow(_ label: String, value: Int) -> some View {
        HStack {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            Text("\(value) pts")
                .font(.caption.weight(.semibold).monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
    }

    private func ruleRowMultiplier(_ label: String, multiplier: Double) -> some View {
        HStack {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            Text("\(String(format: "%.1f", multiplier))x")
                .font(.caption.weight(.semibold).monospacedDigit())
                .foregroundStyle(AppColors.primary600)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
    }

    // MARK: - Section Header

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
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
        case "miss": return AppColors.neutral400
        default: return AppColors.neutral400
        }
    }

    // MARK: - Data Loading

    private func loadBreakdown() async {
        isLoading = true
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
