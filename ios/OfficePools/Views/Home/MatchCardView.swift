import SwiftUI

/// A card displaying a live or upcoming match.
struct MatchCardView: View {
    let match: Match
    let isLive: Bool

    var body: some View {
        VStack(spacing: 8) {
            // Live badge or date
            if isLive {
                liveBadge
            } else {
                dateLabel
            }

            // Teams and score
            HStack(spacing: 12) {
                // Home team
                VStack(spacing: 4) {
                    teamFlag(match.homeTeam)
                    Text(match.homeDisplayName)
                        .font(.caption.bold())
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                .frame(maxWidth: .infinity)

                // Score or VS
                if isLive, let homeScore = match.homeScoreFt, let awayScore = match.awayScoreFt {
                    VStack(spacing: 2) {
                        Text("\(homeScore) - \(awayScore)")
                            .font(.title3.bold().monospacedDigit())
                        Text(elapsedTimeText)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Text("vs")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                }

                // Away team
                VStack(spacing: 4) {
                    teamFlag(match.awayTeam)
                    Text(match.awayDisplayName)
                        .font(.caption.bold())
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                .frame(maxWidth: .infinity)
            }

            // Venue
            if let venue = match.venue, !isLive {
                Text(venue)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }
        }
        .padding(12)
        .frame(width: isLive ? 200 : nil)
        .background {
            RoundedRectangle(cornerRadius: 12)
                .fill(isLive ? Color.red.opacity(0.05) : Color(.secondarySystemBackground))
        }
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(isLive ? Color.red.opacity(0.3) : .clear, lineWidth: 1)
        }
    }

    // MARK: - Subviews

    private var liveBadge: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(.red)
                .frame(width: 6, height: 6)
                .modifier(PulsingModifier())

            Text("LIVE")
                .font(.caption2.bold())
                .foregroundStyle(.red)
        }
    }

    private var dateLabel: some View {
        Text(formattedDate)
            .font(.caption2)
            .foregroundStyle(.secondary)
    }

    @ViewBuilder
    private func teamFlag(_ team: TeamInfo?) -> some View {
        if let flagUrl = team?.flagUrl, let url = URL(string: flagUrl) {
            AsyncImage(url: url) { image in
                image
                    .resizable()
                    .aspectRatio(contentMode: .fit)
            } placeholder: {
                RoundedRectangle(cornerRadius: 2)
                    .fill(.quaternary)
            }
            .frame(width: 28, height: 20)
            .clipShape(RoundedRectangle(cornerRadius: 2))
        } else {
            RoundedRectangle(cornerRadius: 2)
                .fill(.quaternary)
                .frame(width: 28, height: 20)
                .overlay {
                    Text(team?.countryCode.prefix(2) ?? "?")
                        .font(.system(size: 8).bold())
                        .foregroundStyle(.secondary)
                }
        }
    }

    // MARK: - Helpers

    private var elapsedTimeText: String {
        // For live matches, show a generic "In Progress" since we don't have minute data
        "In Progress"
    }

    private var formattedDate: String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var date = formatter.date(from: match.matchDate)
        if date == nil {
            formatter.formatOptions = [.withInternetDateTime]
            date = formatter.date(from: match.matchDate)
        }

        guard let date else { return match.matchDate }

        let display = DateFormatter()
        display.dateFormat = "EEE, MMM d 'at' h:mm a"
        return display.string(from: date)
    }
}

// MARK: - Pulsing Animation Modifier

struct PulsingModifier: ViewModifier {
    @State private var isPulsing = false

    func body(content: Content) -> some View {
        content
            .opacity(isPulsing ? 0.3 : 1.0)
            .animation(
                .easeInOut(duration: 0.8).repeatForever(autoreverses: true),
                value: isPulsing
            )
            .onAppear { isPulsing = true }
    }
}

#Preview("Live Match") {
    MatchCardView(
        match: Match(
            matchId: "1", tournamentId: "t1", matchNumber: 1,
            stage: "Group A", groupLetter: "A",
            homeTeamId: "h1", awayTeamId: "a1",
            homeTeamPlaceholder: nil, awayTeamPlaceholder: nil,
            matchDate: "2026-06-11T20:00:00Z", venue: "MetLife Stadium",
            status: "live", homeScoreFt: 2, awayScoreFt: 1,
            homeScorePso: nil, awayScorePso: nil,
            winnerTeamId: nil, isCompleted: false, completedAt: nil,
            homeTeam: TeamInfo(countryName: "USA", countryCode: "US", flagUrl: nil),
            awayTeam: TeamInfo(countryName: "Mexico", countryCode: "MX", flagUrl: nil)
        ),
        isLive: true
    )
    .padding()
}

#Preview("Upcoming Match") {
    MatchCardView(
        match: Match(
            matchId: "2", tournamentId: "t1", matchNumber: 5,
            stage: "Group B", groupLetter: "B",
            homeTeamId: "h2", awayTeamId: "a2",
            homeTeamPlaceholder: nil, awayTeamPlaceholder: nil,
            matchDate: "2026-06-12T18:00:00Z", venue: "SoFi Stadium",
            status: "scheduled", homeScoreFt: nil, awayScoreFt: nil,
            homeScorePso: nil, awayScorePso: nil,
            winnerTeamId: nil, isCompleted: false, completedAt: nil,
            homeTeam: TeamInfo(countryName: "Brazil", countryCode: "BR", flagUrl: nil),
            awayTeam: TeamInfo(countryName: "Germany", countryCode: "DE", flagUrl: nil)
        ),
        isLive: false
    )
    .padding()
}
