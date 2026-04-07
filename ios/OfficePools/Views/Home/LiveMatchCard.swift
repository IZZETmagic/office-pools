import SwiftUI

/// Full-width live match card for the Home dashboard — dark themed with pulsing indicator.
struct LiveMatchCard: View {
    let match: Match

    var body: some View {
        VStack(spacing: 14) {
            // Live badge + stage
            HStack {
                HStack(spacing: 5) {
                    Circle()
                        .fill(Color.sp.red)
                        .frame(width: 7, height: 7)
                        .modifier(PulsingModifier())
                    Text("LIVE")
                        .font(.system(size: 11, weight: .heavy, design: .rounded))
                        .foregroundStyle(Color.sp.red)
                }

                Spacer()

                Text(match.stage.replacingOccurrences(of: "_", with: " ").capitalized)
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundStyle(.white.opacity(0.5))
                    .textCase(.uppercase)
                    .tracking(1)
            }

            // Teams + score
            HStack(spacing: 0) {
                // Home team
                VStack(spacing: 6) {
                    teamFlag(match.homeTeam)
                    Text(match.homeTeam?.countryCode ?? match.homeTeamPlaceholder ?? "TBD")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundStyle(.white.opacity(0.7))
                }
                .frame(maxWidth: .infinity)

                // Score
                if let homeScore = match.homeScoreFt, let awayScore = match.awayScoreFt {
                    HStack(spacing: 8) {
                        Text("\(homeScore)")
                            .font(SPTypography.mono(size: 32, weight: .heavy))
                            .foregroundStyle(.white)
                        Text("–")
                            .font(SPTypography.mono(size: 24, weight: .bold))
                            .foregroundStyle(.white.opacity(0.4))
                        Text("\(awayScore)")
                            .font(SPTypography.mono(size: 32, weight: .heavy))
                            .foregroundStyle(.white)
                    }
                } else {
                    Text("vs")
                        .font(SPTypography.body)
                        .foregroundStyle(.white.opacity(0.5))
                }

                // Away team
                VStack(spacing: 6) {
                    teamFlag(match.awayTeam)
                    Text(match.awayTeam?.countryCode ?? match.awayTeamPlaceholder ?? "TBD")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundStyle(.white.opacity(0.7))
                }
                .frame(maxWidth: .infinity)
            }

            // Venue
            if let venue = match.venue {
                Text(venue)
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundStyle(.white.opacity(0.35))
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

                // Subtle red glow from the live indicator
                Circle()
                    .fill(Color.sp.red.opacity(0.08))
                    .frame(width: 120, height: 120)
                    .blur(radius: 40)
                    .offset(x: -100, y: -30)
            }
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
        }
    }

    // MARK: - Subviews

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
}

#Preview {
    LiveMatchCard(
        match: Match(
            matchId: "1", tournamentId: "t1", matchNumber: 1,
            stage: "group", groupLetter: "A",
            homeTeamId: "h1", awayTeamId: "a1",
            homeTeamPlaceholder: nil, awayTeamPlaceholder: nil,
            matchDate: "2026-06-11T20:00:00Z", venue: "MetLife Stadium, New York",
            status: "live", homeScoreFt: 2, awayScoreFt: 1,
            homeScorePso: nil, awayScorePso: nil,
            winnerTeamId: nil, isCompleted: false, completedAt: nil,
            homeTeam: TeamInfo(countryName: "USA", countryCode: "US", flagUrl: nil),
            awayTeam: TeamInfo(countryName: "Mexico", countryCode: "MX", flagUrl: nil)
        )
    )
    .padding(.horizontal, 20)
    .background(Color.sp.snow)
}
