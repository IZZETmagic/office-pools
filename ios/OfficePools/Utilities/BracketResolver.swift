import Foundation

// MARK: - Bracket Result

struct BracketResult {
    /// Group standings keyed by group letter (A-L)
    let allGroupStandings: [String: [GroupStanding]]

    /// Knockout team assignments keyed by match number.
    /// Each value contains the home and away team for that knockout match.
    let knockoutTeamMap: [Int: (home: GroupStanding?, away: GroupStanding?)]

    /// Tournament champion (winner of the final)
    let champion: GroupStanding?

    /// Tournament runner-up (loser of the final)
    let runnerUp: GroupStanding?

    /// Third-place winner (winner of the third-place match)
    let thirdPlace: GroupStanding?

    /// The 8 best third-place teams that qualified for R32
    let qualifiedThirds: [GroupStanding]

    /// All 12 third-place teams ranked
    let rankedThirds: [GroupStanding]
}

// MARK: - Bracket Resolver

/// Resolves the full tournament bracket from a set of predictions.
///
/// Computes group standings for all 12 groups, resolves R32 via Annex C,
/// then cascades through R16, QF, SF, third-place, and final to determine
/// champion, runner-up, third place, and all knockout team assignments.
func resolveFullBracket(
    matches: [Match],
    predictions: [String: PredictionInput],
    teams: [Team]
) -> BracketResult {

    // 1. Calculate group standings for all 12 groups
    var allGroupStandings: [String: [GroupStanding]] = [:]
    for letter in GROUP_LETTERS {
        allGroupStandings[letter] = calculateGroupStandings(
            groupLetter: letter,
            matches: matches,
            predictions: predictions,
            teams: teams
        )
    }

    // 2. Rank all third-place teams
    let rankedThirds = rankThirdPlaceTeams(allGroupStandings: allGroupStandings)

    // 3. Get best 8 third-place teams
    let best8 = getBest8ThirdPlaceTeams(rankedThirds: rankedThirds)

    // 4. Resolve R32 matches
    var knockoutTeamMap: [Int: (home: GroupStanding?, away: GroupStanding?)] = [:]
    resolveR32Matches(
        allGroupStandings: allGroupStandings,
        best8: best8,
        into: &knockoutTeamMap
    )

    // 5. Cascade through knockout stages using KNOCKOUT_BRACKET
    resolveKnockoutStages(
        matches: matches,
        predictions: predictions,
        knockoutTeamMap: &knockoutTeamMap
    )

    // 6. Determine champion, runner-up, third place
    let champion: GroupStanding?
    let runnerUp: GroupStanding?
    let thirdPlaceWinner: GroupStanding?

    // Final is match 104
    if let finalMatch = matches.first(where: { $0.stage == "final" }),
       let finalTeams = knockoutTeamMap[finalMatch.matchNumber] {
        champion = bracketGetKnockoutWinner(
            matchId: finalMatch.matchId,
            predictions: predictions,
            homeTeam: finalTeams.home,
            awayTeam: finalTeams.away
        )
        runnerUp = bracketGetKnockoutLoser(
            matchId: finalMatch.matchId,
            predictions: predictions,
            homeTeam: finalTeams.home,
            awayTeam: finalTeams.away
        )
    } else {
        champion = nil
        runnerUp = nil
    }

    // Third-place match is match 103
    if let thirdPlaceMatch = matches.first(where: { $0.stage == "third_place" }),
       let thirdTeams = knockoutTeamMap[thirdPlaceMatch.matchNumber] {
        thirdPlaceWinner = bracketGetKnockoutWinner(
            matchId: thirdPlaceMatch.matchId,
            predictions: predictions,
            homeTeam: thirdTeams.home,
            awayTeam: thirdTeams.away
        )
    } else {
        thirdPlaceWinner = nil
    }

    return BracketResult(
        allGroupStandings: allGroupStandings,
        knockoutTeamMap: knockoutTeamMap,
        champion: champion,
        runnerUp: runnerUp,
        thirdPlace: thirdPlaceWinner,
        qualifiedThirds: best8,
        rankedThirds: rankedThirds
    )
}

// MARK: - R32 Resolution

/// Resolves all Round of 32 matches using Annex C for third-place team assignment
/// and R32_MATCHUPS for group winners/runners-up.
private func resolveR32Matches(
    allGroupStandings: [String: [GroupStanding]],
    best8: [GroupStanding],
    into knockoutTeamMap: inout [Int: (home: GroupStanding?, away: GroupStanding?)]
) {
    let matchNumbers = R32_MATCHUPS.keys.sorted()

    // First resolve all non-third-place slots (group winners & runners-up are deterministic)
    for matchNum in matchNumbers {
        guard let mapping = R32_MATCHUPS[matchNum] else { continue }
        let home = resolveNonThirdSlot(slot: mapping.homeSlot, allGroupStandings: allGroupStandings)
        let away = resolveNonThirdSlot(slot: mapping.awaySlot, allGroupStandings: allGroupStandings)
        knockoutTeamMap[matchNum] = (home: home, away: away)
    }

    // Try Annex C deterministic assignment
    if best8.count == 8 {
        let qualifyingGroups = best8.map { $0.groupLetter }
        if let annexCResult = lookupAnnexC(qualifyingGroups: qualifyingGroups) {
            // Build map: group letter -> third-place team
            var thirdByGroup: [String: GroupStanding] = [:]
            for team in best8 {
                thirdByGroup[team.groupLetter] = team
            }

            // Apply Annex C assignments
            for (matchNum, thirdGroupLetter) in annexCResult {
                if let team = thirdByGroup[thirdGroupLetter],
                   let current = knockoutTeamMap[matchNum] {
                    // Third-place team is always the away team in these matches
                    knockoutTeamMap[matchNum] = (home: current.home, away: team)
                }
            }
            return
        }
    }

    // Fallback: backtracking (used when < 8 third-place teams or Annex C lookup fails)
    var thirdSlots: [(matchNum: Int, side: String, eligible: [String])] = []
    for matchNum in matchNumbers {
        guard let mapping = R32_MATCHUPS[matchNum] else { continue }
        if case .bestThird(let eligible) = mapping.homeSlot {
            thirdSlots.append((matchNum: matchNum, side: "home", eligible: eligible))
        }
        if case .bestThird(let eligible) = mapping.awaySlot {
            thirdSlots.append((matchNum: matchNum, side: "away", eligible: eligible))
        }
    }

    var assignment: [Int: GroupStanding] = [:]
    var usedTeamIds: Set<String> = []

    func backtrack(_ slotIdx: Int) -> Bool {
        if slotIdx == thirdSlots.count { return true }

        let slot = thirdSlots[slotIdx]
        for team in best8 {
            if usedTeamIds.contains(team.teamId) { continue }
            if !slot.eligible.contains(team.groupLetter) { continue }

            usedTeamIds.insert(team.teamId)
            assignment[slotIdx] = team

            if backtrack(slotIdx + 1) { return true }

            usedTeamIds.remove(team.teamId)
            assignment.removeValue(forKey: slotIdx)
        }
        return false
    }

    _ = backtrack(0)

    for i in 0..<thirdSlots.count {
        let slot = thirdSlots[i]
        let team = assignment[i]
        if let current = knockoutTeamMap[slot.matchNum] {
            if slot.side == "home" {
                knockoutTeamMap[slot.matchNum] = (home: team, away: current.away)
            } else {
                knockoutTeamMap[slot.matchNum] = (home: current.home, away: team)
            }
        }
    }
}

/// Resolves a non-third-place slot (group winner or group runner-up).
private func resolveNonThirdSlot(
    slot: SlotType,
    allGroupStandings: [String: [GroupStanding]]
) -> GroupStanding? {
    switch slot {
    case .groupWinner(let group):
        return allGroupStandings[group]?.first
    case .groupRunnerUp(let group):
        let standings = allGroupStandings[group]
        return (standings?.count ?? 0) >= 2 ? standings?[1] : nil
    case .bestThird:
        return nil // Handled separately
    }
}

// MARK: - Knockout Stage Cascading

/// Cascades through knockout stages (R16, QF, SF, third-place, final)
/// by reading home_team_placeholder / away_team_placeholder from match data
/// to determine source matches — matching the web app's approach.
private func resolveKnockoutStages(
    matches: [Match],
    predictions: [String: PredictionInput],
    knockoutTeamMap: inout [Int: (home: GroupStanding?, away: GroupStanding?)]
) {
    let stages = ["round_16", "quarter_final", "semi_final", "third_place", "final"]

    for stage in stages {
        let isLoserStage = (stage == "third_place")
        let stageMatches = matches
            .filter { $0.stage == stage }
            .sorted { $0.matchNumber < $1.matchNumber }

        for match in stageMatches {
            let homeMatchNum = extractMatchNumber(placeholder: match.homeTeamPlaceholder)
            let awayMatchNum = extractMatchNumber(placeholder: match.awayTeamPlaceholder)

            let homeSource = homeMatchNum.flatMap { knockoutTeamMap[$0] }
            let awaySource = awayMatchNum.flatMap { knockoutTeamMap[$0] }

            let homeSourceMatch = homeMatchNum.flatMap { num in matches.first(where: { $0.matchNumber == num }) }
            let awaySourceMatch = awayMatchNum.flatMap { num in matches.first(where: { $0.matchNumber == num }) }

            let resolveFn = isLoserStage ? bracketGetKnockoutLoser : bracketGetKnockoutWinner

            let home: GroupStanding? = if let sourceMatch = homeSourceMatch, let source = homeSource {
                resolveFn(sourceMatch.matchId, predictions, source.home, source.away)
            } else {
                nil
            }

            let away: GroupStanding? = if let sourceMatch = awaySourceMatch, let source = awaySource {
                resolveFn(sourceMatch.matchId, predictions, source.home, source.away)
            } else {
                nil
            }

            knockoutTeamMap[match.matchNumber] = (home: home, away: away)
        }
    }
}

// MARK: - Knockout Winner/Loser (GroupStanding-based)

/// Determines the winner of a knockout match based on predictions, returning a GroupStanding.
/// Falls back to FIFA ranking if the prediction results in a draw without PSO resolution.
private func bracketGetKnockoutWinner(
    matchId: String,
    predictions: [String: PredictionInput],
    homeTeam: GroupStanding?,
    awayTeam: GroupStanding?
) -> GroupStanding? {
    guard let home = homeTeam, let away = awayTeam else { return nil }
    guard let pred = predictions[matchId],
          let homeScore = pred.homeScore,
          let awayScore = pred.awayScore else { return nil }

    // Full-time winner
    if homeScore > awayScore { return home }
    if awayScore > homeScore { return away }

    // Tied: check PSO exact scores
    if let homePso = pred.homePso, let awayPso = pred.awayPso {
        if homePso > awayPso { return home }
        if awayPso > homePso { return away }
    }

    // Tied: check explicit winner team ID
    if let winnerTeamId = pred.winnerTeamId {
        if winnerTeamId == home.teamId { return home }
        if winnerTeamId == away.teamId { return away }
    }

    // Fallback: FIFA ranking
    return home.fifaRankingPoints >= away.fifaRankingPoints ? home : away
}

/// Determines the loser of a knockout match based on predictions, returning a GroupStanding.
private func bracketGetKnockoutLoser(
    matchId: String,
    predictions: [String: PredictionInput],
    homeTeam: GroupStanding?,
    awayTeam: GroupStanding?
) -> GroupStanding? {
    guard let home = homeTeam, let away = awayTeam else { return nil }
    guard let winner = bracketGetKnockoutWinner(
        matchId: matchId,
        predictions: predictions,
        homeTeam: home,
        awayTeam: away
    ) else { return nil }
    return winner.teamId == home.teamId ? away : home
}

// MARK: - Helper

/// Extracts a match number from a placeholder string like "Winner Match 73" or "Match 73".
func extractMatchNumber(placeholder: String?) -> Int? {
    guard let placeholder = placeholder else { return nil }
    let pattern = #"(?:Match\s*)?(\d+)"#
    guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
          let match = regex.firstMatch(
              in: placeholder,
              range: NSRange(placeholder.startIndex..., in: placeholder)
          ),
          let range = Range(match.range(at: 1), in: placeholder) else {
        return nil
    }
    return Int(placeholder[range])
}
