import SwiftUI

struct ResultsTabView: View {
    let matches: [Match]

    var completedMatches: [Match] {
        matches.filter(\.isCompleted).sorted { $0.matchNumber > $1.matchNumber }
    }

    var upcomingMatches: [Match] {
        matches.filter { !$0.isCompleted }.sorted { $0.matchNumber < $1.matchNumber }
    }

    var body: some View {
        if matches.isEmpty {
            ContentUnavailableView("No Matches", systemImage: "sportscourt", description: Text("Match results will appear here."))
        } else {
            List {
                if !completedMatches.isEmpty {
                    Section("Completed") {
                        ForEach(completedMatches) { match in
                            MatchResultRow(match: match)
                        }
                    }
                }

                if !upcomingMatches.isEmpty {
                    Section("Upcoming") {
                        ForEach(upcomingMatches) { match in
                            MatchResultRow(match: match)
                        }
                    }
                }
            }
            .listStyle(.plain)
        }
    }
}

struct MatchResultRow: View {
    let match: Match

    var body: some View {
        VStack(spacing: 8) {
            // Stage label
            HStack {
                Text(stageLabel)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("Match \(match.matchNumber)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            // Teams and score
            HStack {
                // Home team
                VStack(alignment: .trailing) {
                    Text(match.homeDisplayName)
                        .font(.subheadline.weight(.medium))
                    if let code = match.homeTeam?.countryCode {
                        Text(code)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .trailing)

                // Score
                if let score = match.scoreDisplay {
                    Text(score)
                        .font(.headline.monospacedDigit())
                        .padding(.horizontal, 12)
                } else {
                    Text("vs")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 12)
                }

                // Away team
                VStack(alignment: .leading) {
                    Text(match.awayDisplayName)
                        .font(.subheadline.weight(.medium))
                    if let code = match.awayTeam?.countryCode {
                        Text(code)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.vertical, 4)
    }

    private var stageLabel: String {
        if let group = match.groupLetter {
            return "Group \(group)"
        }
        return match.stage
            .replacingOccurrences(of: "_", with: " ")
            .capitalized
    }
}
