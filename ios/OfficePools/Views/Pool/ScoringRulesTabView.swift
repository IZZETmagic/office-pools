import SwiftUI

struct ScoringRulesTabView: View {
    let pool: Pool?
    let settings: PoolSettings?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                Spacer().frame(height: 4)

                if let settings {
                    groupStageCard(settings)
                    knockoutStageCard(settings)

                    if settings.psoEnabled {
                        psoCard(settings)
                    }

                    let bonusRows = collectBonusRows(settings)
                    if !bonusRows.isEmpty {
                        bonusCard(bonusRows)
                    }
                } else {
                    ContentUnavailableView(
                        "No Scoring Rules",
                        systemImage: "list.number",
                        description: Text("Scoring rules haven't been configured for this pool yet.")
                    )
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Color.sp.snow)
    }

    // MARK: - Group Stage

    private func groupStageCard(_ s: PoolSettings) -> some View {
        card {
            sectionHeader("Group Stage")
            scoreRow("Exact Score", pts: s.groupExactScore)
            scoreRow("Correct Difference", pts: s.groupCorrectDifference)
            scoreRow("Correct Result", pts: s.groupCorrectResult)
        }
    }

    // MARK: - Knockout Stage

    private func knockoutStageCard(_ s: PoolSettings) -> some View {
        card {
            sectionHeader("Knockout Stage")
            scoreRow("Exact Score", pts: s.knockoutExactScore)
            scoreRow("Correct Difference", pts: s.knockoutCorrectDifference)
            scoreRow("Correct Result", pts: s.knockoutCorrectResult)

            Divider().padding(.vertical, 4)

            Text("Round Multipliers")
                .font(SPTypography.cardTitle)
                .foregroundStyle(Color.sp.slate)

            multiplierRow("Round of 32", value: s.round32Multiplier)
            multiplierRow("Round of 16", value: s.round16Multiplier)
            multiplierRow("Quarter Final", value: s.quarterFinalMultiplier)
            multiplierRow("Semi Final", value: s.semiFinalMultiplier)
            multiplierRow("3rd Place", value: s.thirdPlaceMultiplier)
            multiplierRow("Final", value: s.finalMultiplier)
        }
    }

    // MARK: - PSO

    private func psoCard(_ s: PoolSettings) -> some View {
        card {
            sectionHeader("Penalty Shootout")
            if let pts = s.psoExactScore { scoreRow("Exact Score", pts: pts) }
            if let pts = s.psoCorrectDifference { scoreRow("Correct Difference", pts: pts) }
            if let pts = s.psoCorrectResult { scoreRow("Correct Result", pts: pts) }
        }
    }

    // MARK: - Bonus Points

    private func bonusCard(_ rows: [BonusRow]) -> some View {
        card {
            sectionHeader("Bonus Points")
            ForEach(rows, id: \.label) { row in
                scoreRow(row.label, pts: row.pts)
            }
        }
    }

    // MARK: - Helpers

    private func card<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            content()
        }
        .padding(16)
        .spCard()
    }

    private func sectionHeader(_ title: String) -> some View {
        VStack(spacing: 10) {
            HStack {
                Text(title)
                    .font(SPTypography.sectionHeader)
                    .foregroundStyle(Color.sp.ink)
                Spacer()
            }
            Divider()
        }
    }

    private func scoreRow(_ label: String, pts: Int) -> some View {
        HStack {
            Text(label)
                .font(SPTypography.body)
                .foregroundStyle(Color.sp.slate)
            Spacer()
            Text("\(pts) pts")
                .font(SPTypography.mono(size: 14, weight: .bold))
                .foregroundStyle(Color.sp.ink)
        }
    }

    private func multiplierRow(_ label: String, value: Double) -> some View {
        let displayValue: String = value == Double(Int(value)) ? "×\(Int(value))" : String(format: "×%.1f", value)
        return HStack {
            Text(label)
                .font(SPTypography.body)
                .foregroundStyle(Color.sp.slate)
            Spacer()
            Text(displayValue)
                .font(SPTypography.mono(size: 14, weight: .bold))
                .foregroundStyle(Color.sp.ink)
        }
    }

    private struct BonusRow: Hashable {
        let label: String
        let pts: Int
    }

    private func collectBonusRows(_ s: PoolSettings) -> [BonusRow] {
        var rows: [BonusRow] = []
        if let v = s.bonusGroupWinnerAndRunnerup, v > 0 { rows.append(BonusRow(label: "Winner & Runner-up", pts: v)) }
        if let v = s.bonusGroupWinnerOnly, v > 0 { rows.append(BonusRow(label: "Winner Only", pts: v)) }
        if let v = s.bonusGroupRunnerupOnly, v > 0 { rows.append(BonusRow(label: "Runner-up Only", pts: v)) }
        if let v = s.bonusBothQualifySwapped, v > 0 { rows.append(BonusRow(label: "Both Qualify (Swapped)", pts: v)) }
        if let v = s.bonusOneQualifiesWrongPosition, v > 0 { rows.append(BonusRow(label: "One Qualifies (Wrong Pos)", pts: v)) }
        if let v = s.bonusAll16Qualified, v > 0 { rows.append(BonusRow(label: "All 16 Qualified", pts: v)) }
        if let v = s.bonus12_15Qualified, v > 0 { rows.append(BonusRow(label: "12-15 Qualified", pts: v)) }
        if let v = s.bonus8_11Qualified, v > 0 { rows.append(BonusRow(label: "8-11 Qualified", pts: v)) }
        if let v = s.bonusCorrectBracketPairing, v > 0 { rows.append(BonusRow(label: "Correct Bracket Pairing", pts: v)) }
        if let v = s.bonusMatchWinnerCorrect, v > 0 { rows.append(BonusRow(label: "Match Winner Correct", pts: v)) }
        if let v = s.bonusChampionCorrect, v > 0 { rows.append(BonusRow(label: "Champion Correct", pts: v)) }
        if let v = s.bonusSecondPlaceCorrect, v > 0 { rows.append(BonusRow(label: "2nd Place Correct", pts: v)) }
        if let v = s.bonusThirdPlaceCorrect, v > 0 { rows.append(BonusRow(label: "3rd Place Correct", pts: v)) }
        if let v = s.bonusTopScorerCorrect, v > 0 { rows.append(BonusRow(label: "Top Scorer Correct", pts: v)) }
        if let v = s.bonusBestPlayerCorrect, v > 0 { rows.append(BonusRow(label: "Best Player Correct", pts: v)) }
        return rows
    }
}
