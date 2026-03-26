import SwiftUI

struct SharePredictionSheet: View {
    let matches: [Match]
    let entryId: String?
    let onSelect: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var predictions: [Prediction] = []
    @State private var isLoading = true
    @State private var selectedMatchId: String?

    private var completedMatchesWithPredictions: [MatchPredictionResult] {
        let completedMatches = matches.filter { $0.isCompleted && $0.homeScoreFt != nil && $0.awayScoreFt != nil }
        let predictionsByMatch = Dictionary(grouping: predictions, by: \.matchId)

        return completedMatches.compactMap { match in
            guard let prediction = predictionsByMatch[match.matchId]?.first else { return nil }

            let actualHome = match.homeScoreFt!
            let actualAway = match.awayScoreFt!
            let predHome = prediction.predictedHomeScore
            let predAway = prediction.predictedAwayScore

            let outcome: PredictionOutcome
            if predHome == actualHome && predAway == actualAway {
                outcome = .exact
            } else {
                let predWinner = predHome > predAway ? "home" : (predAway > predHome ? "away" : "draw")
                let actualWinner = actualHome > actualAway ? "home" : (actualAway > actualHome ? "away" : "draw")
                outcome = predWinner == actualWinner ? .correct : .miss
            }

            return MatchPredictionResult(
                match: match,
                prediction: prediction,
                outcome: outcome
            )
        }
        .sorted { a, b in
            if a.outcome.sortOrder != b.outcome.sortOrder {
                return a.outcome.sortOrder < b.outcome.sortOrder
            }
            return a.match.matchNumber > b.match.matchNumber
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading predictions...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if completedMatchesWithPredictions.isEmpty {
                    ContentUnavailableView(
                        "No Completed Matches",
                        systemImage: "sportscourt",
                        description: Text("No completed matches with predictions yet.")
                    )
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(completedMatchesWithPredictions) { result in
                                matchRow(result)
                                    .onTapGesture {
                                        selectMatch(result)
                                    }
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                    }
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Share Prediction")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .task {
            await loadPredictions()
        }
    }

    // MARK: - Match Row

    private func matchRow(_ result: MatchPredictionResult) -> some View {
        VStack(spacing: 10) {
            // Header: match number + stage + outcome badge
            HStack {
                Text("Match \(result.match.matchNumber) · \(result.match.stage)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                outcomeBadge(result.outcome)
            }

            // Teams and scores
            HStack(spacing: 0) {
                // Home team
                VStack(spacing: 4) {
                    Text(result.match.homeDisplayName)
                        .font(.subheadline.weight(.medium))
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity)

                // Scores column
                VStack(spacing: 2) {
                    Text("\(result.prediction.predictedHomeScore) - \(result.prediction.predictedAwayScore)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("\(result.match.homeScoreFt!) - \(result.match.awayScoreFt!)")
                        .font(.title3.weight(.bold))
                }
                .frame(width: 60)

                // Away team
                VStack(spacing: 4) {
                    Text(result.match.awayDisplayName)
                        .font(.subheadline.weight(.medium))
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(14)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    // MARK: - Outcome Badge

    private func outcomeBadge(_ outcome: PredictionOutcome) -> some View {
        Text(outcome.label)
            .font(.caption2.weight(.bold))
            .foregroundStyle(outcome.color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(outcome.color.opacity(0.12))
            .clipShape(Capsule())
    }

    // MARK: - Actions

    private func selectMatch(_ result: MatchPredictionResult) {
        let m = result.match
        let p = result.prediction
        let outcomeTag = result.outcome == .exact ? "exact" : (result.outcome == .correct ? "correct" : "miss")
        let homeCode = m.homeTeam?.countryCode ?? ""
        let awayCode = m.awayTeam?.countryCode ?? ""
        let homeFlagUrl = m.homeTeam?.flagUrl ?? ""
        let awayFlagUrl = m.awayTeam?.flagUrl ?? ""

        // Format: 🎯 match_number|stage|homeName|awayName|homeCode|awayCode|actualHome|actualAway|predHome|predAway|outcome|homeFlagUrl|awayFlagUrl
        let text = "🎯 \(m.matchNumber)|\(m.stage)|\(m.homeDisplayName)|\(m.awayDisplayName)|\(homeCode)|\(awayCode)|\(m.homeScoreFt!)|\(m.awayScoreFt!)|\(p.predictedHomeScore)|\(p.predictedAwayScore)|\(outcomeTag)|\(homeFlagUrl)|\(awayFlagUrl)"

        onSelect(text)
        dismiss()
    }

    private func loadPredictions() async {
        guard let entryId = entryId else {
            isLoading = false
            return
        }

        do {
            predictions = try await PredictionService().fetchPredictions(entryId: entryId)
        } catch {
            print("[SharePrediction] Failed to fetch predictions: \(error)")
        }
        isLoading = false
    }
}

// MARK: - Supporting Types

struct MatchPredictionResult: Identifiable {
    let match: Match
    let prediction: Prediction
    let outcome: PredictionOutcome

    var id: String { match.matchId }
}

enum PredictionOutcome {
    case exact, correct, miss

    var sortOrder: Int {
        switch self {
        case .exact: return 0
        case .correct: return 1
        case .miss: return 2
        }
    }

    var label: String {
        switch self {
        case .exact: return "★ EXACT"
        case .correct: return "✓ CORRECT"
        case .miss: return "✗ MISS"
        }
    }

    var color: Color {
        switch self {
        case .exact: return .orange
        case .correct: return .green
        case .miss: return .red
        }
    }
}
