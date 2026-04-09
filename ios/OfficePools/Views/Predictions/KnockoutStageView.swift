import SwiftUI

/// Shows matches for a specific knockout stage with bracket-resolved team names.
/// Teams are resolved from the bracket; unresolved teams display as TBD with disabled inputs.
struct KnockoutStageView: View {
    let stage: WizardStage
    @Bindable var viewModel: PredictionEditViewModel
    var readOnly: Bool = false

    var body: some View {
        let matches = viewModel.matchesForWizardStage(stage)

        LazyVStack(spacing: 12) {
            if stage == .finals {
                finalsContent(matches: matches)
            } else {
                ForEach(matches) { match in
                    knockoutMatchCard(match: match)
                }
            }
        }
        .padding(.vertical, 8)
    }

    // MARK: - Finals (Third Place + Final)

    private func finalsContent(matches: [Match]) -> some View {
        let thirdPlaceMatches = matches.filter { $0.stage == "third_place" }
        let finalMatches = matches.filter { $0.stage == "final" }

        return Group {
            if !thirdPlaceMatches.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Third Place Match")
                        .font(SPTypography.cardTitle)
                        .foregroundStyle(Color.sp.slate)
                        .padding(.horizontal)

                    ForEach(thirdPlaceMatches) { match in
                        knockoutMatchCard(match: match)
                    }
                }
            }

            if !finalMatches.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Final")
                        .font(SPTypography.cardTitle)
                        .foregroundStyle(Color.sp.slate)
                        .padding(.horizontal)

                    ForEach(finalMatches) { match in
                        knockoutMatchCard(match: match, isFinal: true)
                    }
                }
            }
        }
    }

    // MARK: - Knockout Match Card

    private func knockoutMatchCard(match: Match, isFinal: Bool = false) -> some View {
        let resolved = viewModel.resolvedTeamsForMatch(match.matchNumber)
        let bothResolved = resolved.home != nil && resolved.away != nil

        return VStack(spacing: 0) {
            // Bracket source label
            if !bothResolved && !readOnly {
                bracketSourceLabel(match: match, resolved: resolved)
                    .padding(.horizontal)
                    .padding(.top, 4)
            }

            if bothResolved || readOnly {
                MatchPredictionRow(
                    match: match,
                    isKnockout: true,
                    prediction: viewModel.predictions[match.matchId],
                    saveStatus: viewModel.saveStatus,
                    onScoreUpdate: { home, away in
                        viewModel.updateScore(matchId: match.matchId, homeScore: home, awayScore: away)
                    },
                    onPsoUpdate: { homePso, awayPso in
                        viewModel.updatePso(matchId: match.matchId, homePso: homePso, awayPso: awayPso)
                    },
                    readOnly: readOnly,
                    homeTeamOverride: resolved.home?.teamName,
                    awayTeamOverride: resolved.away?.teamName,
                    homeSubtitle: match.homeTeamPlaceholder,
                    awaySubtitle: match.awayTeamPlaceholder,
                    homeFlagOverride: flagUrl(for: resolved.home),
                    awayFlagOverride: flagUrl(for: resolved.away)
                )
                .padding(.horizontal)
            } else {
                disabledMatchRow(match: match, resolved: resolved)
                    .padding(.horizontal)
            }
        }
        .padding(.vertical, 4)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
        .overlay(
            RoundedRectangle(cornerRadius: SPDesign.Radius.md)
                .strokeBorder(
                    isFinal ? Color.sp.accent.opacity(0.6) : Color.sp.silver,
                    lineWidth: isFinal ? 2 : AppDesign.Border.thin
                )
        )
        .padding(.horizontal)
    }

    // MARK: - Disabled Match Row

    private func disabledMatchRow(match: Match, resolved: (home: GroupStanding?, away: GroupStanding?)) -> some View {
        HStack(spacing: 0) {
            // Home team
            Text(resolved.home?.teamName ?? match.homeTeamPlaceholder ?? "TBD")
                .font(SPTypography.body)
                .foregroundStyle(resolved.home != nil ? Color.sp.ink : Color.sp.slate)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, alignment: .trailing)

            // Placeholder score
            HStack(spacing: 6) {
                Text("?")
                    .font(SPTypography.cardTitle)
                    .foregroundStyle(Color.sp.silver)
                    .frame(width: 38, height: 36)
                    .background(Color.sp.mist.opacity(0.5))
                    .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
                Text("-")
                    .font(SPTypography.cardTitle)
                    .foregroundStyle(Color.sp.silver)
                Text("?")
                    .font(SPTypography.cardTitle)
                    .foregroundStyle(Color.sp.silver)
                    .frame(width: 38, height: 36)
                    .background(Color.sp.mist.opacity(0.5))
                    .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
            }
            .padding(.horizontal, 8)

            // Away team
            Text(resolved.away?.teamName ?? match.awayTeamPlaceholder ?? "TBD")
                .font(SPTypography.body)
                .foregroundStyle(resolved.away != nil ? Color.sp.ink : Color.sp.slate)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, alignment: .leading)

            Color.clear.frame(width: 20)
        }
        .padding(.vertical, 6)
    }

    // MARK: - Bracket Source Label

    private func bracketSourceLabel(match: Match, resolved: (home: GroupStanding?, away: GroupStanding?)) -> some View {
        HStack(spacing: 4) {
            Image(systemName: "arrow.triangle.branch")
                .font(.caption2)
                .foregroundStyle(Color.sp.slate)

            if resolved.home == nil, let placeholder = match.homeTeamPlaceholder {
                Text(placeholder)
                    .font(.caption2)
                    .foregroundStyle(Color.sp.slate)
            }
            if resolved.home == nil && resolved.away == nil {
                Text("vs")
                    .font(.caption2)
                    .foregroundStyle(Color.sp.silver)
            }
            if resolved.away == nil, let placeholder = match.awayTeamPlaceholder {
                Text(placeholder)
                    .font(.caption2)
                    .foregroundStyle(Color.sp.slate)
            }

            Spacer()

            Text("Complete earlier rounds")
                .font(.caption2)
                .foregroundStyle(Color.sp.silver)
        }
    }

    // MARK: - Flag URL Lookup

    private func flagUrl(for standing: GroupStanding?) -> String? {
        guard let standing = standing else { return nil }
        return viewModel.teams.first(where: { $0.teamId == standing.teamId })?.flagUrl
    }
}
