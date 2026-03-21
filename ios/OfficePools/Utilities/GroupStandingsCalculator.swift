import Foundation

// MARK: - GroupStanding

struct GroupStanding: Identifiable, Equatable {
    let teamId: String
    let teamName: String
    let countryCode: String
    let groupLetter: String
    var played: Int
    var won: Int
    var drawn: Int
    var lost: Int
    var goalsFor: Int
    var goalsAgainst: Int
    var goalDifference: Int
    var points: Int
    var conductScore: Int
    var fifaRankingPoints: Double

    var id: String { teamId }
}

// MARK: - Calculate Group Standings

/// Calculates group standings from matches and predictions for a given group.
/// Sorts by: points, then head-to-head tiebreakers, then GD, GF, conduct, FIFA ranking.
func calculateGroupStandings(
    groupLetter: String,
    matches: [Match],
    predictions: [String: PredictionInput],
    teams: [Team]
) -> [GroupStanding] {
    let groupTeams = teams.filter { $0.groupLetter == groupLetter }
    let groupMatches = matches.filter { $0.groupLetter == groupLetter && $0.stage == "group" }

    var standings = groupTeams.map { team in
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

    var standingsMap: [String: Int] = [:]
    for (index, standing) in standings.enumerated() {
        standingsMap[standing.teamId] = index
    }

    for match in groupMatches {
        guard let homeTeamId = match.homeTeamId,
              let awayTeamId = match.awayTeamId,
              let pred = predictions[match.matchId],
              let hGoals = pred.homeScore,
              let aGoals = pred.awayScore else {
            continue
        }

        guard let homeIdx = standingsMap[homeTeamId],
              let awayIdx = standingsMap[awayTeamId] else {
            continue
        }

        standings[homeIdx].played += 1
        standings[awayIdx].played += 1
        standings[homeIdx].goalsFor += hGoals
        standings[homeIdx].goalsAgainst += aGoals
        standings[awayIdx].goalsFor += aGoals
        standings[awayIdx].goalsAgainst += hGoals

        if hGoals > aGoals {
            standings[homeIdx].won += 1
            standings[awayIdx].lost += 1
        } else if hGoals < aGoals {
            standings[awayIdx].won += 1
            standings[homeIdx].lost += 1
        } else {
            standings[homeIdx].drawn += 1
            standings[awayIdx].drawn += 1
        }
    }

    // Compute derived fields
    for i in standings.indices {
        standings[i].goalDifference = standings[i].goalsFor - standings[i].goalsAgainst
        standings[i].points = standings[i].won * 3 + standings[i].drawn
    }

    return sortStandings(standings, groupMatches: groupMatches, predictions: predictions)
}

// MARK: - Tiebreaker Sorting

/// Sorts standings by points, then resolves ties via head-to-head tiebreaker.
private func sortStandings(
    _ standings: [GroupStanding],
    groupMatches: [Match],
    predictions: [String: PredictionInput]
) -> [GroupStanding] {
    // First sort by points descending
    let sorted = standings.sorted { $0.points > $1.points }

    var result: [GroupStanding] = []
    var i = 0
    while i < sorted.count {
        // Find teams with same points
        var j = i + 1
        while j < sorted.count && sorted[j].points == sorted[i].points {
            j += 1
        }

        if j - i == 1 {
            // No tie
            result.append(sorted[i])
        } else {
            // Tied group: resolve with head-to-head
            let tiedTeams = Array(sorted[i..<j])
            let resolved = resolveH2HTiebreaker(tiedTeams, groupMatches: groupMatches, predictions: predictions)
            result.append(contentsOf: resolved)
        }
        i = j
    }

    return result
}

/// Resolves ties between teams with equal points using head-to-head records,
/// then overall GD, GF, conduct, and FIFA ranking.
private func resolveH2HTiebreaker(
    _ tiedTeams: [GroupStanding],
    groupMatches: [Match],
    predictions: [String: PredictionInput]
) -> [GroupStanding] {
    let teamIds = Set(tiedTeams.map { $0.teamId })

    // Find matches between tied teams only
    let h2hMatches = groupMatches.filter { match in
        guard let homeId = match.homeTeamId, let awayId = match.awayTeamId else { return false }
        return teamIds.contains(homeId) && teamIds.contains(awayId)
    }

    // Compute h2h stats
    struct H2HStats {
        var points: Int = 0
        var gd: Int = 0
        var gf: Int = 0
    }

    var h2hStats: [String: H2HStats] = [:]
    for team in tiedTeams {
        h2hStats[team.teamId] = H2HStats()
    }

    for match in h2hMatches {
        guard let homeTeamId = match.homeTeamId,
              let awayTeamId = match.awayTeamId,
              let pred = predictions[match.matchId],
              let homeGoals = pred.homeScore,
              let awayGoals = pred.awayScore else {
            continue
        }

        h2hStats[homeTeamId]?.gf += homeGoals
        h2hStats[awayTeamId]?.gf += awayGoals
        h2hStats[homeTeamId]?.gd += homeGoals - awayGoals
        h2hStats[awayTeamId]?.gd += awayGoals - homeGoals

        if homeGoals > awayGoals {
            h2hStats[homeTeamId]?.points += 3
        } else if homeGoals < awayGoals {
            h2hStats[awayTeamId]?.points += 3
        } else {
            h2hStats[homeTeamId]?.points += 1
            h2hStats[awayTeamId]?.points += 1
        }
    }

    return tiedTeams.sorted { a, b in
        let aH2H = h2hStats[a.teamId]!
        let bH2H = h2hStats[b.teamId]!

        // 1. H2H points
        if bH2H.points != aH2H.points { return aH2H.points > bH2H.points }
        // 2. H2H goal difference
        if bH2H.gd != aH2H.gd { return aH2H.gd > bH2H.gd }
        // 3. H2H goals scored
        if bH2H.gf != aH2H.gf { return aH2H.gf > bH2H.gf }
        // 4. Overall goal difference
        if b.goalDifference != a.goalDifference { return a.goalDifference > b.goalDifference }
        // 5. Overall goals scored
        if b.goalsFor != a.goalsFor { return a.goalsFor > b.goalsFor }
        // 6. Team conduct score (higher/closer to 0 is better)
        if b.conductScore != a.conductScore { return a.conductScore > b.conductScore }
        // 7. FIFA ranking points
        return a.fifaRankingPoints > b.fifaRankingPoints
    }
}

// MARK: - Third Place Teams

/// Extracts the 3rd-place team from each group and ranks them.
/// Sorted by: points, GD, GF, conduct, FIFA ranking (all descending).
func rankThirdPlaceTeams(allGroupStandings: [String: [GroupStanding]]) -> [GroupStanding] {
    var thirdPlaceTeams: [GroupStanding] = []

    for (_, standings) in allGroupStandings {
        if standings.count >= 3 {
            thirdPlaceTeams.append(standings[2]) // 0-indexed: 3rd place
        }
    }

    return thirdPlaceTeams.sorted { a, b in
        if b.points != a.points { return a.points > b.points }
        if b.goalDifference != a.goalDifference { return a.goalDifference > b.goalDifference }
        if b.goalsFor != a.goalsFor { return a.goalsFor > b.goalsFor }
        if b.conductScore != a.conductScore { return a.conductScore > b.conductScore }
        return a.fifaRankingPoints > b.fifaRankingPoints
    }
}

/// Returns the top 8 third-place teams from all groups.
func getBest8ThirdPlaceTeams(rankedThirds: [GroupStanding]) -> [GroupStanding] {
    return Array(rankedThirds.prefix(8))
}

// MARK: - Knockout Winner / Loser

/// Determines the winner of a knockout match based on predictions.
/// Returns the winning team's ID, or nil if the match cannot be resolved.
///
/// Resolution order:
/// 1. Higher full-time score wins
/// 2. If tied: PSO scores determine the winner
/// 3. If tied: explicit winnerTeamId
/// 4. Fallback: higher FIFA ranking
func getKnockoutWinner(match: Match, predictions: [String: PredictionInput]) -> String? {
    guard let homeTeamId = match.homeTeamId,
          let awayTeamId = match.awayTeamId,
          let pred = predictions[match.matchId],
          let homeScore = pred.homeScore,
          let awayScore = pred.awayScore else {
        return nil
    }

    // Full-time winner
    if homeScore > awayScore { return homeTeamId }
    if awayScore > homeScore { return awayTeamId }

    // Tied: check PSO exact scores
    if let homePso = pred.homePso, let awayPso = pred.awayPso {
        if homePso > awayPso { return homeTeamId }
        if awayPso > homePso { return awayTeamId }
    }

    // Tied: check explicit winner team ID
    if let winnerTeamId = pred.winnerTeamId {
        if winnerTeamId == homeTeamId { return homeTeamId }
        if winnerTeamId == awayTeamId { return awayTeamId }
    }

    return nil
}

/// Determines the loser of a knockout match based on predictions.
/// Returns the losing team's ID, or nil if the match cannot be resolved.
func getKnockoutLoser(match: Match, predictions: [String: PredictionInput]) -> String? {
    guard let homeTeamId = match.homeTeamId,
          let awayTeamId = match.awayTeamId else {
        return nil
    }

    guard let winner = getKnockoutWinner(match: match, predictions: predictions) else {
        return nil
    }

    return winner == homeTeamId ? awayTeamId : homeTeamId
}
