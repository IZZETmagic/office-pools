import SwiftUI

struct PointsBreakdownView: View {
    let poolId: String
    let entryId: String
    let entryName: String
    let playerName: String
    let rank: Int

    @State private var breakdown: PointsBreakdownResponse?
    @State private var isLoading = true
    @State private var errorMessage: String?

    private let apiService = APIService()

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
        .navigationTitle("Points Breakdown")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadBreakdown()
        }
    }

    // MARK: - Main Content

    private func breakdownContent(_ data: PointsBreakdownResponse) -> some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                // Header
                headerSection(data)

                // Summary Cards
                summaryCards(data.summary, adjustment: data.entry.pointAdjustment)

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
            .padding(.horizontal)
            .padding(.bottom, 20)
        }
    }

    // MARK: - Header

    private func headerSection(_ data: PointsBreakdownResponse) -> some View {
        VStack(spacing: 6) {
            // Rank badge
            Text("#\(rank)")
                .font(.caption.weight(.black))
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(rankColor)
                .clipShape(Capsule())

            // Player name
            Text(data.user.fullName)
                .font(.title2.weight(.bold))

            // Entry name + username
            if !data.entry.entryName.isEmpty {
                Text(data.entry.entryName)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Text("@\(data.user.username)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.top, 8)
    }

    private var rankColor: Color {
        switch rank {
        case 1: return .yellow
        case 2: return .gray
        case 3: return .orange
        default: return .blue
        }
    }

    // MARK: - Summary Cards

    private func summaryCards(_ summary: BreakdownSummary, adjustment: Int) -> some View {
        let columns = adjustment != 0
            ? [GridItem(.flexible()), GridItem(.flexible())]
            : [GridItem(.flexible()), GridItem(.flexible())]

        return LazyVGrid(columns: columns, spacing: 10) {
            summaryCard(title: "Match Points", value: summary.matchPoints, color: .blue)
            summaryCard(title: "Bonus Points", value: summary.bonusPoints, color: .green)

            if adjustment != 0 {
                summaryCard(title: "Adjustment", value: adjustment, color: .orange)
            }

            summaryCard(title: "Total Points", value: summary.totalPoints, color: .primary, bordered: true)
        }
    }

    private func summaryCard(title: String, value: Int, color: Color, bordered: Bool = false) -> some View {
        VStack(spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text("\(value)")
                .font(.title2.weight(.black).monospacedDigit())
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .background(bordered ? Color(.secondarySystemBackground) : color.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            bordered
                ? RoundedRectangle(cornerRadius: 10).stroke(Color(.separator), lineWidth: 1)
                : nil
        )
    }

    // MARK: - Match Points Section

    private func matchPointsSection(_ results: [MatchResultData]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Match Points Breakdown")
                .font(.headline)
                .padding(.top, 8)

            let grouped = Dictionary(grouping: results, by: { $0.stage })

            ForEach(stageOrder, id: \.self) { stage in
                if let stageResults = grouped[stage], !stageResults.isEmpty {
                    stageSection(stage: stage, results: stageResults)
                }
            }
        }
    }

    private func stageSection(stage: String, results: [MatchResultData]) -> some View {
        let stageTotal = results.reduce(0) { $0 + $1.totalPoints }
        let exactCount = results.filter { $0.type == "exact" }.count
        let wgdCount = results.filter { $0.type == "winner_gd" }.count
        let winnerCount = results.filter { $0.type == "winner" }.count
        let missCount = results.filter { $0.type == "miss" }.count
        let multiplier = results.first?.multiplier ?? 1.0

        return DisclosureGroup {
            VStack(spacing: 0) {
                // Summary pills
                HStack(spacing: 6) {
                    if exactCount > 0 { countPill("\(exactCount) Exact", color: .green) }
                    if wgdCount > 0 { countPill("\(wgdCount) W+GD", color: .blue) }
                    if winnerCount > 0 { countPill("\(winnerCount) Winner", color: .orange) }
                    if missCount > 0 { countPill("\(missCount) Miss", color: .gray) }
                    Spacer()
                }
                .padding(.vertical, 8)

                // Match rows
                ForEach(results.sorted(by: { $0.matchNumber < $1.matchNumber })) { result in
                    matchRow(result)
                }
            }
        } label: {
            HStack {
                Text(stageLabel(stage))
                    .font(.subheadline.weight(.semibold))

                if multiplier > 1.0 {
                    Text("\(String(format: "%.1f", multiplier))x")
                        .font(.caption2.weight(.bold))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.blue.opacity(0.15))
                        .foregroundStyle(.blue)
                        .clipShape(Capsule())
                }

                Spacer()

                Text("\(stageTotal) pts")
                    .font(.subheadline.weight(.bold).monospacedDigit())
                    .foregroundStyle(.blue)
            }
        }
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func countPill(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.system(size: 10, weight: .semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }

    private func matchRow(_ result: MatchResultData) -> some View {
        HStack(spacing: 8) {
            // Type badge
            Text(typeLabel(result.type))
                .font(.system(size: 9, weight: .bold))
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(typeColor(result.type).opacity(0.15))
                .foregroundStyle(typeColor(result.type))
                .clipShape(Capsule())
                .frame(width: 52)

            // Predicted score
            VStack(spacing: 1) {
                Text("\(result.predictedHome)-\(result.predictedAway)")
                    .font(.caption.weight(.semibold).monospacedDigit())
                Text("Pred")
                    .font(.system(size: 8))
                    .foregroundStyle(.secondary)
            }
            .frame(width: 36)

            // Actual score
            VStack(spacing: 1) {
                Text("\(result.actualHome)-\(result.actualAway)")
                    .font(.caption.weight(.semibold).monospacedDigit())
                Text("Actual")
                    .font(.system(size: 8))
                    .foregroundStyle(.secondary)
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
                .foregroundStyle(result.totalPoints > 0 ? .green : Color(.systemGray4))
        }
        .padding(.vertical, 6)
    }

    // MARK: - Bonus Points Section

    private func bonusPointsSection(_ entries: [BonusEntryData]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Bonus Points Breakdown")
                .font(.headline)
                .padding(.top, 8)

            let grouped = Dictionary(grouping: entries, by: { $0.bonusCategory })

            ForEach(bonusCategoryOrder, id: \.self) { category in
                if let categoryEntries = grouped[category], !categoryEntries.isEmpty {
                    bonusCategorySection(category: category, entries: categoryEntries)
                }
            }

            // Any remaining categories not in the standard order
            let remainingCategories = Set(grouped.keys).subtracting(Set(bonusCategoryOrder))
            ForEach(Array(remainingCategories).sorted(), id: \.self) { category in
                if let categoryEntries = grouped[category] {
                    bonusCategorySection(category: category, entries: categoryEntries)
                }
            }
        }
    }

    private func bonusCategorySection(category: String, entries: [BonusEntryData]) -> some View {
        let subtotal = entries.reduce(0) { $0 + $1.pointsEarned }

        return DisclosureGroup {
            VStack(spacing: 0) {
                ForEach(entries) { entry in
                    HStack {
                        Text(entry.description)
                            .font(.caption)
                            .foregroundStyle(.primary)
                        Spacer()
                        Text("+\(entry.pointsEarned)")
                            .font(.caption.weight(.bold).monospacedDigit())
                            .foregroundStyle(.green)
                    }
                    .padding(.vertical, 5)
                }
            }
        } label: {
            HStack {
                Text(bonusCategoryLabel(category))
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text("\(subtotal) pts")
                    .font(.subheadline.weight(.bold).monospacedDigit())
                    .foregroundStyle(.green)
            }
        }
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Scoring Rules

    private func scoringRulesSection(_ settings: BreakdownPoolSettings) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Scoring Rules")
                .font(.headline)
                .padding(.top, 8)

            // Group Stage
            DisclosureGroup {
                ruleRow("Exact Score", value: settings.groupExactScore)
                ruleRow("Correct Winner + GD", value: settings.groupCorrectDifference)
                ruleRow("Correct Result Only", value: settings.groupCorrectResult)
            } label: {
                Text("Group Stage Points")
                    .font(.subheadline.weight(.semibold))
            }
            .padding(12)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10))

            // Knockout Base
            DisclosureGroup {
                ruleRow("Exact Score", value: settings.knockoutExactScore)
                ruleRow("Correct Winner + GD", value: settings.knockoutCorrectDifference)
                ruleRow("Correct Result Only", value: settings.knockoutCorrectResult)
            } label: {
                Text("Knockout Base Points")
                    .font(.subheadline.weight(.semibold))
            }
            .padding(12)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10))

            // Multipliers
            DisclosureGroup {
                ruleRow("Round of 32", multiplier: settings.round32Multiplier)
                ruleRow("Round of 16", multiplier: settings.round16Multiplier)
                ruleRow("Quarter Finals", multiplier: settings.quarterFinalMultiplier)
                ruleRow("Semi Finals", multiplier: settings.semiFinalMultiplier)
                ruleRow("Third Place", multiplier: settings.thirdPlaceMultiplier)
                ruleRow("Final", multiplier: settings.finalMultiplier)
            } label: {
                Text("Round Multipliers")
                    .font(.subheadline.weight(.semibold))
            }
            .padding(12)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10))

            // PSO
            if settings.psoEnabled {
                DisclosureGroup {
                    if let v = settings.psoExactScore { ruleRow("Exact PSO Score", value: v) }
                    if let v = settings.psoCorrectDifference { ruleRow("Correct PSO Winner + GD", value: v) }
                    if let v = settings.psoCorrectResult { ruleRow("Correct PSO Winner", value: v) }
                } label: {
                    Text("Penalty Shootout Bonus")
                        .font(.subheadline.weight(.semibold))
                }
                .padding(12)
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    private func ruleRow(_ label: String, value: Int) -> some View {
        HStack {
            Text(label)
                .font(.caption)
            Spacer()
            Text("\(value) pts")
                .font(.caption.weight(.semibold).monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 3)
    }

    private func ruleRow(_ label: String, multiplier: Double) -> some View {
        HStack {
            Text(label)
                .font(.caption)
            Spacer()
            Text("\(String(format: "%.1f", multiplier))x")
                .font(.caption.weight(.semibold).monospacedDigit())
                .foregroundStyle(.blue)
        }
        .padding(.vertical, 3)
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
        case "exact": return .green
        case "winner_gd": return .blue
        case "winner": return .orange
        case "miss": return Color(.systemGray3)
        default: return .gray
        }
    }

    // MARK: - Data Loading

    private func loadBreakdown() async {
        isLoading = true
        do {
            breakdown = try await apiService.fetchPointsBreakdown(poolId: poolId, entryId: entryId)
            isLoading = false
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
            print("[PointsBreakdown] Error loading: \(error)")
        }
    }
}
