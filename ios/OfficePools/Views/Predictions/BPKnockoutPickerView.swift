import SwiftUI

/// Displays knockout matches for bracket picker mode.
/// Users tap to select the winner of each match and optionally predict penalties.
/// Shows matches for the specified stage keys (e.g. ["round_32"] or ["third_place", "final"]).
struct BPKnockoutPickerView: View {
    @Bindable var viewModel: BracketPickerViewModel
    let stageKeys: [String]
    let readOnly: Bool

    private var stageMatches: [Match] {
        viewModel.matchesForStageKeys(stageKeys)
    }

    private var pickedCount: Int {
        stageMatches.filter { viewModel.knockoutPicks[$0.matchId] != nil }.count
    }

    var body: some View {
        VStack(spacing: 12) {
            // Progress
            HStack {
                Text("\(pickedCount)")
                    .font(SPTypography.body)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.sp.ink)
                +
                Text(" / \(stageMatches.count) matches picked")
                    .font(SPTypography.body)
                    .foregroundColor(Color.sp.slate)

                Spacer()

                if pickedCount == stageMatches.count && !stageMatches.isEmpty {
                    Label("All picked", systemImage: "checkmark.circle.fill")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.green)
                }
            }
            .padding(.horizontal)

            // Progress bar
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.sp.mist)
                        .frame(height: 6)

                    RoundedRectangle(cornerRadius: 4)
                        .fill(pickedCount == stageMatches.count ? Color.sp.green : Color.sp.primary)
                        .frame(
                            width: stageMatches.isEmpty ? 0 : geometry.size.width * CGFloat(pickedCount) / CGFloat(stageMatches.count),
                            height: 6
                        )
                        .animation(.easeInOut(duration: 0.3), value: pickedCount)
                }
            }
            .frame(height: 6)
            .padding(.horizontal)

            // Match cards
            LazyVStack(spacing: 10) {
                ForEach(stageMatches, id: \.matchId) { match in
                    BPMatchCard(
                        match: match,
                        viewModel: viewModel,
                        readOnly: readOnly
                    )
                }
            }
            .padding(.horizontal)
        }
    }
}

// MARK: - Match Card

private struct BPMatchCard: View {
    let match: Match
    @Bindable var viewModel: BracketPickerViewModel
    let readOnly: Bool

    private var resolved: (home: GroupStanding?, away: GroupStanding?) {
        viewModel.knockoutTeamMap[match.matchNumber] ?? (nil, nil)
    }

    private var homeTeam: GroupStanding? { resolved.home }
    private var awayTeam: GroupStanding? { resolved.away }
    private var bothResolved: Bool { homeTeam != nil && awayTeam != nil }
    private var isDisabled: Bool { !bothResolved || readOnly }

    private var pick: (winnerTeamId: String, predictedPenalty: Bool)? {
        viewModel.knockoutPicks[match.matchId]
    }

    var body: some View {
        VStack(spacing: 0) {
            // Match header
            HStack {
                Text("Match \(match.matchNumber)")
                    .font(SPTypography.detail)
                    .foregroundStyle(Color.sp.slate)

                Spacer()

                if pick != nil {
                    Text("Picked")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(Color.sp.green)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(Color.sp.greenLight)
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 12)
            .padding(.bottom, 8)

            // Team buttons
            HStack(spacing: 8) {
                BPTeamButton(
                    team: homeTeam,
                    placeholder: match.homeTeamPlaceholder,
                    isSelected: pick?.winnerTeamId == homeTeam?.teamId,
                    isDisabled: isDisabled,
                    teamMap: viewModel.teamMap,
                    onTap: {
                        if let id = homeTeam?.teamId {
                            viewModel.selectWinner(matchId: match.matchId, teamId: id)
                        }
                    }
                )

                Text("vs")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.sp.slate)

                BPTeamButton(
                    team: awayTeam,
                    placeholder: match.awayTeamPlaceholder,
                    isSelected: pick?.winnerTeamId == awayTeam?.teamId,
                    isDisabled: isDisabled,
                    teamMap: viewModel.teamMap,
                    onTap: {
                        if let id = awayTeam?.teamId {
                            viewModel.selectWinner(matchId: match.matchId, teamId: id)
                        }
                    }
                )
            }
            .padding(.horizontal, 14)
            .padding(.bottom, bothResolved ? 0 : 12)

            // Penalty toggle
            if bothResolved && !readOnly {
                Divider()
                    .padding(.top, 10)

                Toggle(isOn: Binding(
                    get: { pick?.predictedPenalty ?? false },
                    set: { _ in viewModel.togglePenalty(matchId: match.matchId) }
                )) {
                    Text("Goes to penalties?")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.slate)
                }
                .toggleStyle(.switch)
                .controlSize(.mini)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
            } else if bothResolved && readOnly && (pick?.predictedPenalty ?? false) {
                HStack {
                    Spacer()
                    Text("Predicted penalties")
                        .font(.caption2)
                        .foregroundStyle(Color.sp.primary)
                    Spacer()
                }
                .padding(.vertical, 6)
            }
        }
        .background(Color.sp.surface)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
        .overlay(
            RoundedRectangle(cornerRadius: SPDesign.Radius.md)
                .strokeBorder(
                    match.stage == "final" ? Color.sp.accent.opacity(0.5) : Color.sp.silver,
                    lineWidth: match.stage == "final" ? 1.5 : AppDesign.Border.thin
                )
        )
        .opacity(bothResolved ? 1.0 : 0.5)
    }
}

// MARK: - Team Button

private struct BPTeamButton: View {
    let team: GroupStanding?
    let placeholder: String?
    let isSelected: Bool
    let isDisabled: Bool
    let teamMap: [String: Team]
    let onTap: () -> Void

    private var teamData: Team? {
        guard let id = team?.teamId else { return nil }
        return teamMap[id]
    }

    private var displayName: String {
        team?.teamName ?? placeholder ?? "TBD"
    }

    private var isTBD: Bool { team == nil }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                // Flag
                if let flagStr = teamData?.flagUrl, let url = URL(string: flagStr) {
                    CachedAsyncImage(url: url, width: 28, height: 20, cornerRadius: 3)
                } else {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color.sp.silver)
                        .frame(width: 28, height: 20)
                        .overlay {
                            Text("?")
                                .font(.system(size: 8))
                                .foregroundStyle(Color.sp.slate)
                        }
                }

                // Name
                Text(displayName)
                    .font(SPTypography.body)
                    .foregroundStyle(isTBD ? Color.sp.slate : Color.sp.ink)
                    .lineLimit(1)

                Spacer(minLength: 0)

                // Checkmark
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.body)
                        .foregroundStyle(Color.sp.green)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isSelected ? Color.sp.greenLight : Color.sp.mist)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(
                        isSelected ? Color.sp.green : Color.clear,
                        lineWidth: 2
                    )
            )
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .opacity(isTBD ? 0.5 : 1.0)
    }
}
