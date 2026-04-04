import Foundation

// MARK: - Bracket Picker Resolver

/// Resolves the full tournament bracket from bracket picker data (rankings + picks)
/// instead of score-based predictions. This is the bracket picker equivalent of
/// `resolveFullBracket` in BracketResolver.swift.

/// Creates a minimal GroupStanding from a Team and a predicted position.
/// Used for bracket picker mode where standings come from user rankings, not match scores.
private func teamToRankedStanding(team: Team, position: Int) -> GroupStanding {
    GroupStanding(
        teamId: team.teamId,
        teamName: team.countryName,
        countryCode: team.countryCode,
        groupLetter: team.groupLetter,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
        conductScore: 0,
        fifaRankingPoints: team.fifaRankingPoints
    )
}

/// Builds group standings from bracket picker group rankings.
/// Returns teams ordered by user's predicted position (1st, 2nd, 3rd, 4th).
func buildGroupStandingsFromRankings(
    groupRankings: [String: [String]],
    teams: [Team]
) -> [String: [GroupStanding]] {
    let teamMap = Dictionary(uniqueKeysWithValues: teams.map { ($0.teamId, $0) })
    var allGroupStandings: [String: [GroupStanding]] = [:]

    for letter in GROUP_LETTERS {
        guard let teamIds = groupRankings[letter] else {
            allGroupStandings[letter] = []
            continue
        }
        allGroupStandings[letter] = teamIds.enumerated().compactMap { idx, teamId in
            guard let team = teamMap[teamId] else { return nil }
            return teamToRankedStanding(team: team, position: idx + 1)
        }
    }

    return allGroupStandings
}

/// Resolves the R32 bracket from bracket picker data.
/// Uses user's group rankings for winners/runners-up and
/// user's third-place rankings + Annex C for third-place team assignment.
func resolveR32FromBracketPicker(
    groupRankings: [String: [String]],
    thirdPlaceRanking: [String],
    teams: [Team]
) -> [Int: (home: GroupStanding?, away: GroupStanding?)] {
    let teamMap = Dictionary(uniqueKeysWithValues: teams.map { ($0.teamId, $0) })

    // 1. Build group standings from user rankings
    let allGroupStandings = buildGroupStandingsFromRankings(
        groupRankings: groupRankings,
        teams: teams
    )

    // 2. Get the top 8 third-place teams from user's ranking
    let qualifyingThirdIds = Array(thirdPlaceRanking.prefix(8))
    let qualifyingGroups = qualifyingThirdIds.compactMap { teamMap[$0]?.groupLetter }

    // Build third-place standings keyed by group letter
    var thirdByGroup: [String: GroupStanding] = [:]
    for teamId in qualifyingThirdIds {
        guard let team = teamMap[teamId] else { continue }
        thirdByGroup[team.groupLetter] = teamToRankedStanding(team: team, position: 3)
    }

    // 3. Resolve non-third-place slots (group winners & runners-up)
    var result: [Int: (home: GroupStanding?, away: GroupStanding?)] = [:]
    let matchNumbers = R32_MATCHUPS.keys.sorted()

    for matchNum in matchNumbers {
        guard let mapping = R32_MATCHUPS[matchNum] else { continue }
        let home = resolveNonThirdSlotBP(slot: mapping.homeSlot, allGroupStandings: allGroupStandings)
        let away = resolveNonThirdSlotBP(slot: mapping.awaySlot, allGroupStandings: allGroupStandings)
        result[matchNum] = (home: home, away: away)
    }

    // 4. Try Annex C deterministic assignment
    if qualifyingGroups.count == 8 {
        if let annexCResult = lookupAnnexC(qualifyingGroups: qualifyingGroups) {
            for (matchNum, thirdGroupLetter) in annexCResult {
                if let team = thirdByGroup[thirdGroupLetter],
                   let current = result[matchNum] {
                    result[matchNum] = (home: current.home, away: team)
                }
            }
            return result
        }
    }

    // 5. Fallback: backtracking assignment
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
    let best8 = qualifyingThirdIds.compactMap { thirdByGroup[teamMap[$0]?.groupLetter ?? ""] }

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
        if let current = result[slot.matchNum] {
            if slot.side == "home" {
                result[slot.matchNum] = (home: team, away: current.away)
            } else {
                result[slot.matchNum] = (home: current.home, away: team)
            }
        }
    }

    return result
}

private func resolveNonThirdSlotBP(
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
        return nil
    }
}

// MARK: - Full Bracket Resolution from Bracket Picker

/// Resolves the complete tournament bracket from bracket picker data.
/// Uses user's group rankings, third-place rankings, and knockout picks
/// to determine all matchups and the champion.
func resolveFullBracketFromBracketPicker(
    groupRankings: [String: [String]],
    thirdPlaceRanking: [String],
    knockoutPicks: [String: (winnerTeamId: String, predictedPenalty: Bool)],
    matches: [Match],
    teams: [Team]
) -> BracketResult {

    // 1. Build group standings from rankings
    let allGroupStandings = buildGroupStandingsFromRankings(
        groupRankings: groupRankings,
        teams: teams
    )

    // 2. Rank third-place teams from user's ranking
    let teamMap = Dictionary(uniqueKeysWithValues: teams.map { ($0.teamId, $0) })
    let rankedThirds: [GroupStanding] = thirdPlaceRanking.compactMap { teamId in
        guard let team = teamMap[teamId] else { return nil }
        return teamToRankedStanding(team: team, position: 3)
    }
    let qualifiedThirds = Array(rankedThirds.prefix(8))

    // 3. Resolve R32 matches
    let r32Map = resolveR32FromBracketPicker(
        groupRankings: groupRankings,
        thirdPlaceRanking: thirdPlaceRanking,
        teams: teams
    )

    var knockoutTeamMap = r32Map

    // 4. Cascade through knockout stages using picks
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

            let home: GroupStanding?
            let away: GroupStanding?

            if isLoserStage {
                home = resolvePickLoser(sourceMatch: homeSourceMatch, source: homeSource, picks: knockoutPicks)
                away = resolvePickLoser(sourceMatch: awaySourceMatch, source: awaySource, picks: knockoutPicks)
            } else {
                home = resolvePickWinner(sourceMatch: homeSourceMatch, source: homeSource, picks: knockoutPicks)
                away = resolvePickWinner(sourceMatch: awaySourceMatch, source: awaySource, picks: knockoutPicks)
            }

            knockoutTeamMap[match.matchNumber] = (home: home, away: away)
        }
    }

    // 5. Determine champion, runner-up, third place
    let champion: GroupStanding?
    let runnerUp: GroupStanding?
    let thirdPlaceWinner: GroupStanding?

    if let finalMatch = matches.first(where: { $0.stage == "final" }),
       let finalTeams = knockoutTeamMap[finalMatch.matchNumber] {
        let pick = knockoutPicks[finalMatch.matchId]
        if let winnerId = pick?.winnerTeamId {
            if winnerId == finalTeams.home?.teamId {
                champion = finalTeams.home
                runnerUp = finalTeams.away
            } else {
                champion = finalTeams.away
                runnerUp = finalTeams.home
            }
        } else {
            champion = nil
            runnerUp = nil
        }
    } else {
        champion = nil
        runnerUp = nil
    }

    if let thirdMatch = matches.first(where: { $0.stage == "third_place" }),
       let thirdTeams = knockoutTeamMap[thirdMatch.matchNumber] {
        let pick = knockoutPicks[thirdMatch.matchId]
        if let winnerId = pick?.winnerTeamId {
            thirdPlaceWinner = winnerId == thirdTeams.home?.teamId ? thirdTeams.home : thirdTeams.away
        } else {
            thirdPlaceWinner = nil
        }
    } else {
        thirdPlaceWinner = nil
    }

    return BracketResult(
        allGroupStandings: allGroupStandings,
        knockoutTeamMap: knockoutTeamMap,
        champion: champion,
        runnerUp: runnerUp,
        thirdPlace: thirdPlaceWinner,
        qualifiedThirds: qualifiedThirds,
        rankedThirds: rankedThirds
    )
}

// MARK: - Pick Winner/Loser Helpers

/// Resolves the winner of a knockout match using bracket picker picks.
/// In bracket picker mode, the user directly picks the winner (no scores).
private func resolvePickWinner(
    sourceMatch: Match?,
    source: (home: GroupStanding?, away: GroupStanding?)?,
    picks: [String: (winnerTeamId: String, predictedPenalty: Bool)]
) -> GroupStanding? {
    guard let sourceMatch, let source else { return nil }
    guard let home = source.home, let away = source.away else { return nil }
    guard let pick = picks[sourceMatch.matchId] else { return nil }

    if pick.winnerTeamId == home.teamId { return home }
    if pick.winnerTeamId == away.teamId { return away }
    return nil
}

/// Resolves the loser of a knockout match using bracket picker picks.
private func resolvePickLoser(
    sourceMatch: Match?,
    source: (home: GroupStanding?, away: GroupStanding?)?,
    picks: [String: (winnerTeamId: String, predictedPenalty: Bool)]
) -> GroupStanding? {
    guard let sourceMatch, let source else { return nil }
    guard let home = source.home, let away = source.away else { return nil }
    guard let pick = picks[sourceMatch.matchId] else { return nil }

    if pick.winnerTeamId == home.teamId { return away }
    if pick.winnerTeamId == away.teamId { return home }
    return nil
}
