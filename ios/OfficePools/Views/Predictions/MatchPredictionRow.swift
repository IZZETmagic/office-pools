import SwiftUI

/// An editable row for predicting a single match score.
/// Shows team names with score inputs and PSO fields for knockout draws.
/// When `readOnly` is true, scores are shown as static text labels.
/// Identifies which score field is focused for auto-advance.
enum ScoreFieldID: Hashable {
    case home(String)  // matchId
    case away(String)  // matchId
}

struct MatchPredictionRow: View {
    let match: Match
    let isKnockout: Bool
    let prediction: PredictionInput?
    let saveStatus: PredictionEditViewModel.SaveStatus
    let onScoreUpdate: (Int?, Int?) -> Void
    let onPsoUpdate: (Int?, Int?) -> Void
    var isDisabled: Bool = false
    var readOnly: Bool = false
    var homeTeamOverride: String? = nil
    var awayTeamOverride: String? = nil
    var homeSubtitle: String? = nil
    var awaySubtitle: String? = nil
    var homeFlagOverride: String? = nil
    var awayFlagOverride: String? = nil
    /// Binding for auto-advance focus. Nil if not using auto-advance.
    var focusedField: FocusState<ScoreFieldID?>.Binding?
    /// Called after away score is entered, to advance focus to next match.
    var onAwayScoreEntered: (() -> Void)? = nil

    @State private var homeText: String = ""
    @State private var awayText: String = ""
    @State private var homePsoText: String = ""
    @State private var awayPsoText: String = ""
    @State private var didInitialize = false

    private var needsPso: Bool {
        guard isKnockout else { return false }
        guard let h = Int(homeText), let a = Int(awayText) else { return false }
        return h == a
    }

    var body: some View {
        VStack(spacing: 6) {
            // Main score row
            HStack(spacing: 0) {
                // Home team
                VStack(alignment: .trailing, spacing: 2) {
                    HStack(spacing: 6) {
                        if let flagStr = homeFlagOverride ?? match.homeTeam?.flagUrl,
                           let url = URL(string: flagStr) {
                            CachedAsyncImage(url: url, width: 20, height: 14, cornerRadius: 2)
                        }
                        Text(homeTeamOverride ?? match.homeDisplayName)
                            .font(.subheadline)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    if let subtitle = homeSubtitle {
                        Text(subtitle)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .trailing)

                // Score display
                if readOnly {
                    readOnlyScoreDisplay
                        .padding(.horizontal, 8)
                } else {
                    HStack(spacing: 6) {
                        scoreField(text: $homeText, fieldId: .home(match.matchId), onChange: handleScoreChange, autoAdvanceTo: .away(match.matchId))
                        Text("-")
                            .font(.headline)
                            .foregroundStyle(.secondary)
                        scoreField(text: $awayText, fieldId: .away(match.matchId), onChange: handleScoreChange, autoAdvanceTo: nil)
                    }
                    .padding(.horizontal, 8)
                }

                // Away team
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(awayTeamOverride ?? match.awayDisplayName)
                            .font(.subheadline)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        if let flagStr = awayFlagOverride ?? match.awayTeam?.flagUrl,
                           let url = URL(string: flagStr) {
                            CachedAsyncImage(url: url, width: 20, height: 14, cornerRadius: 2)
                        }
                    }
                    if let subtitle = awaySubtitle {
                        Text(subtitle)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

            }

            // PSO row for knockout draws
            if needsPso {
                if readOnly {
                    readOnlyPsoRow
                } else {
                    psoRow
                }
            }
        }
        .padding(.vertical, 6)
        .opacity(isDisabled ? 0.5 : 1.0)
        .allowsHitTesting(!isDisabled && !readOnly)
        .onAppear {
            guard !didInitialize else { return }
            didInitialize = true
            if let pred = prediction {
                homeText = pred.homeScore.map(String.init) ?? ""
                awayText = pred.awayScore.map(String.init) ?? ""
                homePsoText = pred.homePso.map(String.init) ?? ""
                awayPsoText = pred.awayPso.map(String.init) ?? ""
            }
        }
    }

    // MARK: - Read-Only Score Display

    private var readOnlyScoreDisplay: some View {
        HStack(spacing: 6) {
            Text(homeText.isEmpty ? "-" : homeText)
                .font(.title3.weight(.semibold).monospacedDigit())
                .frame(width: 48, height: 44)
                .background(Color(.systemGray5))
                .clipShape(RoundedRectangle(cornerRadius: 10))
            Text("-")
                .font(.headline)
                .foregroundStyle(.secondary)
            Text(awayText.isEmpty ? "-" : awayText)
                .font(.title3.weight(.semibold).monospacedDigit())
                .frame(width: 48, height: 44)
                .background(Color(.systemGray5))
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    // MARK: - Read-Only PSO Row

    private var readOnlyPsoRow: some View {
        HStack {
            Spacer()
            VStack(spacing: 4) {
                Text("Penalty Shootout")
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.secondary)
                HStack(spacing: 6) {
                    Text(homePsoText.isEmpty ? "-" : homePsoText)
                        .font(.subheadline.monospacedDigit().weight(.medium))
                        .frame(width: 38, height: 36)
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    Text("-")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text(awayPsoText.isEmpty ? "-" : awayPsoText)
                        .font(.subheadline.monospacedDigit().weight(.medium))
                        .frame(width: 38, height: 36)
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color(.systemGray6).opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            Spacer()
        }
    }

    // MARK: - Score Field

    private func scoreField(text: Binding<String>, fieldId: ScoreFieldID, onChange: @escaping () -> Void, autoAdvanceTo nextField: ScoreFieldID?) -> some View {
        let field = TextField("", text: text)
            .keyboardType(.numberPad)
            .multilineTextAlignment(.center)
            .font(.title3.weight(.semibold).monospacedDigit())
            .frame(width: 48, height: 44)
            .background(Color(.systemGray5))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .onChange(of: text.wrappedValue) {
                // Clamp to 0-20 range
                if let val = Int(text.wrappedValue) {
                    let clamped = min(max(val, 0), 20)
                    if clamped != val {
                        text.wrappedValue = String(clamped)
                    }
                } else if !text.wrappedValue.isEmpty {
                    text.wrappedValue = ""
                }
                onChange()

                // Auto-advance when a digit is entered
                if !text.wrappedValue.isEmpty, let focus = focusedField {
                    if let nextField {
                        focus.wrappedValue = nextField
                    } else {
                        // Away score entered — advance to next match
                        onAwayScoreEntered?()
                    }
                }
            }

        return Group {
            if let focus = focusedField {
                field.focused(focus, equals: fieldId)
            } else {
                field
            }
        }
    }

    // MARK: - PSO Row

    private var psoRow: some View {
        HStack {
            Spacer()
            VStack(spacing: 4) {
                Text("Penalty Shootout")
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.secondary)
                HStack(spacing: 6) {
                    scoreField(text: $homePsoText, fieldId: .home("\(match.matchId)_pso"), onChange: handlePsoChange, autoAdvanceTo: .away("\(match.matchId)_pso"))
                    Text("-")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    scoreField(text: $awayPsoText, fieldId: .away("\(match.matchId)_pso"), onChange: handlePsoChange, autoAdvanceTo: nil)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color(.systemGray6).opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            Spacer()
        }
    }

    // MARK: - Handlers

    private func handleScoreChange() {
        let home = Int(homeText)
        let away = Int(awayText)
        onScoreUpdate(home, away)
    }

    private func handlePsoChange() {
        let homePso = Int(homePsoText)
        let awayPso = Int(awayPsoText)
        onPsoUpdate(homePso, awayPso)
    }
}
