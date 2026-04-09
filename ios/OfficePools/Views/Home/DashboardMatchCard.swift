import SwiftUI

/// Full-width match card for the Home dashboard.
struct DashboardMatchCard: View {
    let match: Match

    var body: some View {
        HStack(spacing: 16) {
            // Home team
            VStack(spacing: 4) {
                teamFlag(match.homeTeam)
                Text(match.homeTeam?.countryCode ?? match.homeTeamPlaceholder ?? "TBD")
                    .font(SPTypography.caption)
                    .foregroundStyle(Color.sp.ink)
            }
            .frame(width: 48)

            // Score or VS
            VStack(spacing: 2) {
                if let homeScore = match.homeScoreFt, let awayScore = match.awayScoreFt {
                    Text("\(homeScore) - \(awayScore)")
                        .font(SPTypography.mono(size: 20, weight: .bold))
                        .foregroundStyle(Color.sp.ink)
                } else {
                    Text("vs")
                        .font(SPTypography.body)
                        .foregroundStyle(Color.sp.slate)
                }
            }
            .frame(width: 48)

            // Away team
            VStack(spacing: 4) {
                teamFlag(match.awayTeam)
                Text(match.awayTeam?.countryCode ?? match.awayTeamPlaceholder ?? "TBD")
                    .font(SPTypography.caption)
                    .foregroundStyle(Color.sp.ink)
            }
            .frame(width: 48)

            Spacer()

            // Date + venue
            VStack(alignment: .trailing, spacing: 2) {
                Text(formattedDate)
                    .font(SPTypography.body)
                    .foregroundStyle(Color.sp.ink)
                if let venue = match.venue {
                    Text(venue)
                        .font(.system(size: 11, weight: .medium, design: .rounded))
                        .foregroundStyle(Color.sp.slate)
                        .lineLimit(1)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(Color.sp.surface)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
    }

    // MARK: - Subviews

    @ViewBuilder
    private func teamFlag(_ team: TeamInfo?) -> some View {
        if let flagUrl = team?.flagUrl, let url = URL(string: flagUrl) {
            CachedAsyncImage(url: url, width: 32, height: 22, cornerRadius: 3)
        } else {
            RoundedRectangle(cornerRadius: 3)
                .fill(Color.sp.mist)
                .frame(width: 32, height: 22)
                .overlay {
                    Text(team?.countryCode.prefix(2) ?? "?")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(Color.sp.slate)
                }
        }
    }

    // MARK: - Helpers

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
        display.dateFormat = "EEE, MMM d · h:mm a"
        return display.string(from: date)
    }
}

#Preview {
    VStack(spacing: 10) {
        DashboardMatchCard(
            match: Match(
                matchId: "1", tournamentId: "t1", matchNumber: 1,
                stage: "Group A", groupLetter: "A",
                homeTeamId: "h1", awayTeamId: "a1",
                homeTeamPlaceholder: nil, awayTeamPlaceholder: nil,
                matchDate: "2026-06-11T20:00:00Z", venue: "MetLife Stadium",
                status: "scheduled", homeScoreFt: nil, awayScoreFt: nil,
                homeScorePso: nil, awayScorePso: nil,
                winnerTeamId: nil, isCompleted: false, completedAt: nil,
                homeTeam: TeamInfo(countryName: "USA", countryCode: "US", flagUrl: nil),
                awayTeam: TeamInfo(countryName: "Mexico", countryCode: "MX", flagUrl: nil)
            )
        )
        DashboardMatchCard(
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
            )
        )
    }
    .padding(.horizontal, 20)
    .background(Color.sp.snow)
}
