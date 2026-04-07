import SwiftUI

/// Dark-themed card showing the next upcoming match with a live countdown,
/// plus a note about additional matches happening today.
struct NextKickoffCard: View {
    let nextMatch: Match
    let matchesToday: Int

    @State private var totalSecondsRemaining: Int = 0

    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private var days: Int { totalSecondsRemaining / 86400 }
    private var hours: Int { (totalSecondsRemaining % 86400) / 3600 }
    private var minutes: Int { (totalSecondsRemaining % 3600) / 60 }
    private var seconds: Int { totalSecondsRemaining % 60 }
    private var isMoreThanADay: Bool { totalSecondsRemaining >= 86400 }

    var body: some View {
        VStack(spacing: 16) {
            // Top row: "NEXT KICKOFF" label
            HStack {
                Text("NEXT KICKOFF")
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white.opacity(0.5))
                    .tracking(1.5)

                Spacer()

                Text(stageLabel)
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundStyle(.white.opacity(0.4))
                    .textCase(.uppercase)
                    .tracking(1)
            }

            // Teams
            HStack(spacing: 0) {
                // Home team
                VStack(spacing: 6) {
                    teamFlag(nextMatch.homeTeam)
                    Text(nextMatch.homeTeam?.countryCode ?? nextMatch.homeTeamPlaceholder ?? "TBD")
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .foregroundStyle(.white.opacity(0.7))
                }
                .frame(maxWidth: .infinity)

                // Countdown
                VStack(spacing: 4) {
                    if isMoreThanADay {
                        // Days + hours when more than 24h away
                        HStack(spacing: 2) {
                            countdownUnit(value: days, label: "D")
                            Text(":")
                                .font(SPTypography.mono(size: 20, weight: .bold))
                                .foregroundStyle(.white.opacity(0.3))
                            countdownUnit(value: hours, label: "H")
                        }

                        Text(matchDateLabel)
                            .font(.system(size: 10, weight: .medium, design: .rounded))
                            .foregroundStyle(.white.opacity(0.4))
                    } else {
                        // Live H:M:S countdown when within 24h
                        HStack(spacing: 2) {
                            countdownUnit(value: hours, label: "H")
                            Text(":")
                                .font(SPTypography.mono(size: 20, weight: .bold))
                                .foregroundStyle(.white.opacity(0.3))
                            countdownUnit(value: minutes, label: "M")
                            Text(":")
                                .font(SPTypography.mono(size: 20, weight: .bold))
                                .foregroundStyle(.white.opacity(0.3))
                            countdownUnit(value: seconds, label: "S")
                        }
                    }
                }

                // Away team
                VStack(spacing: 6) {
                    teamFlag(nextMatch.awayTeam)
                    Text(nextMatch.awayTeam?.countryCode ?? nextMatch.awayTeamPlaceholder ?? "TBD")
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .foregroundStyle(.white.opacity(0.7))
                }
                .frame(maxWidth: .infinity)
            }

            // Venue + context line
            VStack(spacing: 6) {
                if let venue = nextMatch.venue {
                    Text(venue)
                        .font(.system(size: 11, weight: .medium, design: .rounded))
                        .foregroundStyle(.white.opacity(0.35))
                }

                if !isMoreThanADay, matchesToday > 1 {
                    Text("\(matchesToday - 1) more match\(matchesToday - 1 == 1 ? "" : "es") today")
                        .font(.system(size: 11, weight: .semibold, design: .rounded))
                        .foregroundStyle(Color.sp.accent.opacity(0.8))
                }
            }
        }
        .padding(18)
        .background {
            ZStack {
                RoundedRectangle(cornerRadius: SPDesign.Radius.lg)
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: 0x0F0F1A), Color(hex: 0x1A1830)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                // Subtle accent glow
                Circle()
                    .fill(Color.sp.primary.opacity(0.06))
                    .frame(width: 140, height: 140)
                    .blur(radius: 50)
                    .offset(x: 80, y: -20)

                Circle()
                    .fill(Color.sp.accent.opacity(0.05))
                    .frame(width: 100, height: 100)
                    .blur(radius: 40)
                    .offset(x: -90, y: 30)
            }
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
        }
        .onAppear { updateCountdown() }
        .onReceive(timer) { _ in updateCountdown() }
    }

    // MARK: - Subviews

    private func countdownUnit(value: Int, label: String) -> some View {
        VStack(spacing: 1) {
            Text(String(format: "%02d", value))
                .font(SPTypography.mono(size: 22, weight: .heavy))
                .foregroundStyle(.white)
            Text(label)
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .foregroundStyle(.white.opacity(0.35))
        }
    }

    @ViewBuilder
    private func teamFlag(_ team: TeamInfo?) -> some View {
        if let flagUrl = team?.flagUrl, let url = URL(string: flagUrl) {
            CachedAsyncImage(url: url, width: 36, height: 26, cornerRadius: 3)
        } else {
            RoundedRectangle(cornerRadius: 3)
                .fill(.white.opacity(0.1))
                .frame(width: 36, height: 26)
                .overlay {
                    Text(team?.countryCode.prefix(2) ?? "?")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.white.opacity(0.5))
                }
        }
    }

    // MARK: - Helpers

    private var stageLabel: String {
        nextMatch.stage.replacingOccurrences(of: "_", with: " ").capitalized
    }

    /// Friendly date label like "Friday, Jun 13"
    private var matchDateLabel: String {
        guard let date = parseMatchDate() else { return "" }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMM d"
        return formatter.string(from: date)
    }

    private func updateCountdown() {
        guard let date = parseMatchDate() else { return }
        totalSecondsRemaining = max(0, Int(date.timeIntervalSince(Date())))
    }

    private func parseMatchDate() -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: nextMatch.matchDate) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: nextMatch.matchDate)
    }
}

#Preview {
    NextKickoffCard(
        nextMatch: Match(
            matchId: "1", tournamentId: "t1", matchNumber: 1,
            stage: "group_stage", groupLetter: "C",
            homeTeamId: "h1", awayTeamId: "a1",
            homeTeamPlaceholder: nil, awayTeamPlaceholder: nil,
            matchDate: ISO8601DateFormatter().string(from: Date().addingTimeInterval(3 * 3600 + 1200)),
            venue: "MetLife Stadium, New York",
            status: "scheduled", homeScoreFt: nil, awayScoreFt: nil,
            homeScorePso: nil, awayScorePso: nil,
            winnerTeamId: nil, isCompleted: false, completedAt: nil,
            homeTeam: TeamInfo(countryName: "Brazil", countryCode: "BRA", flagUrl: nil),
            awayTeam: TeamInfo(countryName: "Germany", countryCode: "GER", flagUrl: nil)
        ),
        matchesToday: 3
    )
    .padding(.horizontal, 20)
    .background(Color.sp.snow)
}
