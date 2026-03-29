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
                // Home team name + flag
                HStack(spacing: 6) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(homeTeamOverride ?? match.homeDisplayName)
                            .font(.subheadline)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        if let subtitle = homeSubtitle {
                            Text(subtitle)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    homeFlag
                }
                .frame(maxWidth: .infinity, alignment: .trailing)

                // Score display (centered)
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

                // Flag + away team name
                HStack(spacing: 6) {
                    awayFlag
                    VStack(alignment: .leading, spacing: 2) {
                        Text(awayTeamOverride ?? match.awayDisplayName)
                            .font(.subheadline)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        if let subtitle = awaySubtitle {
                            Text(subtitle)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
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

    // MARK: - Flag Views

    @ViewBuilder
    private var homeFlag: some View {
        if let flagStr = homeFlagOverride ?? match.homeTeam?.flagUrl,
           let url = URL(string: flagStr) {
            CachedAsyncImage(url: url, width: 20, height: 14, cornerRadius: 2)
        }
    }

    @ViewBuilder
    private var awayFlag: some View {
        if let flagStr = awayFlagOverride ?? match.awayTeam?.flagUrl,
           let url = URL(string: flagStr) {
            CachedAsyncImage(url: url, width: 20, height: 14, cornerRadius: 2)
        }
    }

    // MARK: - Score Field

    private func scoreField(text: Binding<String>, fieldId: ScoreFieldID, onChange: @escaping () -> Void, autoAdvanceTo nextField: ScoreFieldID?) -> some View {
        TapScoreField(
            text: text,
            onChange: {
                onChange()
                // Auto-advance after tap
                if !text.wrappedValue.isEmpty, let focus = focusedField {
                    if let nextField {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                            focus.wrappedValue = nextField
                        }
                    } else {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                            onAwayScoreEntered?()
                        }
                    }
                }
            }
        )
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

// MARK: - Tap-to-Increment Score Field

private struct TapScoreField: View {
    @Binding var text: String
    let onChange: () -> Void

    @State private var scale: CGFloat = 1.0
    @State private var showKeyboard = false
    @State private var isPressed = false
    @State private var dotOpacity: Double = 0.4
    @FocusState private var keyboardFocused: Bool

    private var currentValue: Int? {
        Int(text)
    }

    var body: some View {
        ZStack {
            if showKeyboard {
                // Keyboard mode
                TextField("", text: $text)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.center)
                    .font(.title3.weight(.semibold).monospacedDigit())
                    .frame(width: 48, height: 44)
                    .background(Color.accentColor.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .strokeBorder(Color.accentColor, lineWidth: 1.5)
                    )
                    .focused($keyboardFocused)
                    .onChange(of: text) {
                        if let val = Int(text) {
                            let clamped = min(max(val, 0), 15)
                            if clamped != val { text = String(clamped) }
                        } else if !text.isEmpty {
                            text = ""
                        }
                        onChange()
                    }
                    .onChange(of: keyboardFocused) { _, focused in
                        if !focused {
                            showKeyboard = false
                        }
                    }
                    .onAppear {
                        keyboardFocused = true
                    }
            } else {
                // Tap mode
                Group {
                    if text.isEmpty {
                        Circle()
                            .fill(Color(.systemGray3))
                            .frame(width: 8, height: 8)
                            .opacity(dotOpacity)
                            .onAppear {
                                withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                                    dotOpacity = 0.85
                                }
                            }
                    } else {
                        Text(text)
                            .font(.title3.weight(.semibold).monospacedDigit())
                            .foregroundStyle(.primary)
                    }
                }
                    .frame(width: 48, height: 44)
                    .background(Color(.systemGray5))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .scaleEffect(scale)
                    .opacity(isPressed ? 0.7 : 1.0)
                    .onTapGesture {
                        increment()
                    }
                    .onLongPressGesture(minimumDuration: 0.35, pressing: { pressing in
                        withAnimation(.easeInOut(duration: 0.15)) {
                            isPressed = pressing
                        }
                        if pressing {
                            let generator = UIImpactFeedbackGenerator(style: .medium)
                            generator.prepare()
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                                if isPressed {
                                    generator.impactOccurred()
                                }
                            }
                        }
                    }, perform: {
                        let generator = UIImpactFeedbackGenerator(style: .heavy)
                        generator.impactOccurred()
                        showKeyboard = true
                    })
            }
        }
        .animation(.easeInOut(duration: 0.15), value: showKeyboard)
    }

    private func increment() {
        // Dismiss any open keyboard first
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)

        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()

        if text.isEmpty {
            text = "0"
        } else if let val = currentValue {
            text = String(val >= 15 ? 0 : val + 1)
        }

        // Subtle scale pulse
        withAnimation(.easeOut(duration: 0.1)) { scale = 1.12 }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            withAnimation(.easeIn(duration: 0.1)) { scale = 1.0 }
        }

        onChange()
    }
}
