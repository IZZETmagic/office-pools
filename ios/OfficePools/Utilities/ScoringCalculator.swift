import Foundation

/// Calculates points for predictions — port of lib/scoring.ts calculatePoints()
enum ScoringCalculator {

    struct MatchResult {
        let homeScore: Int
        let awayScore: Int
        let homePso: Int?
        let awayPso: Int?
    }

    struct PredictionResult {
        let homeScore: Int
        let awayScore: Int
        let homePso: Int?
        let awayPso: Int?
    }

    struct ScoringRules {
        let exactScore: Int
        let correctDifference: Int
        let correctResult: Int
        let multiplier: Double
        let psoEnabled: Bool
        let psoExactScore: Int?
        let psoCorrectDifference: Int?
        let psoCorrectResult: Int?
    }

    /// Calculate points for a single prediction against actual result.
    static func calculatePoints(
        prediction: PredictionResult,
        actual: MatchResult,
        rules: ScoringRules
    ) -> Int {
        var points = 0

        // Check full-time score
        let predDiff = prediction.homeScore - prediction.awayScore
        let actualDiff = actual.homeScore - actual.awayScore

        if prediction.homeScore == actual.homeScore && prediction.awayScore == actual.awayScore {
            // Exact score
            points = rules.exactScore
        } else if predDiff == actualDiff {
            // Correct goal difference
            points = rules.correctDifference
        } else if (predDiff > 0 && actualDiff > 0) ||
                  (predDiff < 0 && actualDiff < 0) ||
                  (predDiff == 0 && actualDiff == 0) {
            // Correct result (winner or draw)
            points = rules.correctResult
        }

        // PSO scoring (knockout matches that went to penalties)
        if rules.psoEnabled,
           let actualHomePso = actual.homePso, let actualAwayPso = actual.awayPso,
           let predHomePso = prediction.homePso, let predAwayPso = prediction.awayPso {

            if predHomePso == actualHomePso && predAwayPso == actualAwayPso {
                points += rules.psoExactScore ?? 0
            } else {
                let predPsoDiff = predHomePso - predAwayPso
                let actualPsoDiff = actualHomePso - actualAwayPso
                if predPsoDiff == actualPsoDiff {
                    points += rules.psoCorrectDifference ?? 0
                } else if (predPsoDiff > 0 && actualPsoDiff > 0) || (predPsoDiff < 0 && actualPsoDiff < 0) {
                    points += rules.psoCorrectResult ?? 0
                }
            }
        }

        // Apply round multiplier
        return Int(Double(points) * rules.multiplier)
    }

    /// Get the multiplier for a given stage from pool settings.
    static func multiplier(for stage: String, settings: PoolSettings) -> Double {
        switch stage {
        case "round_32": return settings.round32Multiplier
        case "round_16": return settings.round16Multiplier
        case "quarter_final": return settings.quarterFinalMultiplier
        case "semi_final": return settings.semiFinalMultiplier
        case "third_place": return settings.thirdPlaceMultiplier
        case "final": return settings.finalMultiplier
        default: return 1.0 // group stage
        }
    }
}
