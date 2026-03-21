import Foundation

// MARK: - Group Letters

let GROUP_LETTERS: [String] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]

// MARK: - Wizard Stage

enum WizardStage: Int, CaseIterable {
    case groupStage
    case roundOf32
    case roundOf16
    case quarterFinals
    case semiFinals
    case finals
    case summary

    var label: String {
        switch self {
        case .groupStage: return "Group Stage"
        case .roundOf32: return "Round of 32"
        case .roundOf16: return "Round of 16"
        case .quarterFinals: return "Quarter Finals"
        case .semiFinals: return "Semi Finals"
        case .finals: return "Third Place & Final"
        case .summary: return "Summary"
        }
    }

    /// The database stage strings that belong to this wizard stage.
    var stageKeys: [String] {
        switch self {
        case .groupStage: return ["group"]
        case .roundOf32: return ["round_32"]
        case .roundOf16: return ["round_16"]
        case .quarterFinals: return ["quarter_final"]
        case .semiFinals: return ["semi_final"]
        case .finals: return ["third_place", "final"]
        case .summary: return []
        }
    }
}

// MARK: - R32 Slot Types

enum SlotType {
    case groupWinner(group: String)
    case groupRunnerUp(group: String)
    case bestThird(eligibleGroups: [String])
}

struct R32MatchupEntry {
    let matchNumber: Int
    let homeSlot: SlotType
    let awaySlot: SlotType
}

/// Round of 32 matchup mapping. Each entry maps a match number to the
/// home/away resolution logic based on group stage results.
let R32_MATCHUPS: [Int: R32MatchupEntry] = [
    73: R32MatchupEntry(matchNumber: 73, homeSlot: .groupRunnerUp(group: "A"), awaySlot: .groupRunnerUp(group: "B")),
    74: R32MatchupEntry(matchNumber: 74, homeSlot: .groupWinner(group: "C"), awaySlot: .groupRunnerUp(group: "F")),
    75: R32MatchupEntry(matchNumber: 75, homeSlot: .groupWinner(group: "E"), awaySlot: .bestThird(eligibleGroups: ["A", "B", "C", "D", "F"])),
    76: R32MatchupEntry(matchNumber: 76, homeSlot: .groupWinner(group: "F"), awaySlot: .groupRunnerUp(group: "C")),
    77: R32MatchupEntry(matchNumber: 77, homeSlot: .groupRunnerUp(group: "E"), awaySlot: .groupRunnerUp(group: "I")),
    78: R32MatchupEntry(matchNumber: 78, homeSlot: .groupWinner(group: "I"), awaySlot: .bestThird(eligibleGroups: ["C", "D", "F", "G", "H"])),
    79: R32MatchupEntry(matchNumber: 79, homeSlot: .groupWinner(group: "A"), awaySlot: .bestThird(eligibleGroups: ["C", "E", "F", "H", "I"])),
    80: R32MatchupEntry(matchNumber: 80, homeSlot: .groupWinner(group: "L"), awaySlot: .bestThird(eligibleGroups: ["E", "H", "I", "J", "K"])),
    81: R32MatchupEntry(matchNumber: 81, homeSlot: .groupWinner(group: "G"), awaySlot: .bestThird(eligibleGroups: ["A", "E", "H", "I", "J"])),
    82: R32MatchupEntry(matchNumber: 82, homeSlot: .groupWinner(group: "D"), awaySlot: .bestThird(eligibleGroups: ["B", "E", "F", "I", "J"])),
    83: R32MatchupEntry(matchNumber: 83, homeSlot: .groupWinner(group: "H"), awaySlot: .groupRunnerUp(group: "J")),
    84: R32MatchupEntry(matchNumber: 84, homeSlot: .groupRunnerUp(group: "K"), awaySlot: .groupRunnerUp(group: "L")),
    85: R32MatchupEntry(matchNumber: 85, homeSlot: .groupWinner(group: "B"), awaySlot: .bestThird(eligibleGroups: ["E", "F", "G", "I", "J"])),
    86: R32MatchupEntry(matchNumber: 86, homeSlot: .groupRunnerUp(group: "D"), awaySlot: .groupRunnerUp(group: "G")),
    87: R32MatchupEntry(matchNumber: 87, homeSlot: .groupWinner(group: "J"), awaySlot: .groupRunnerUp(group: "H")),
    88: R32MatchupEntry(matchNumber: 88, homeSlot: .groupWinner(group: "K"), awaySlot: .bestThird(eligibleGroups: ["D", "E", "I", "J", "L"])),
]

// MARK: - Knockout Bracket

struct KnockoutBracketEntry {
    let homeFromMatch: Int
    let awayFromMatch: Int
    /// If true, this slot takes the loser of the source match instead of the winner.
    let homeIsLoser: Bool
    let awayIsLoser: Bool

    init(homeFromMatch: Int, awayFromMatch: Int, homeIsLoser: Bool = false, awayIsLoser: Bool = false) {
        self.homeFromMatch = homeFromMatch
        self.awayFromMatch = awayFromMatch
        self.homeIsLoser = homeIsLoser
        self.awayIsLoser = awayIsLoser
    }
}

/// Maps match numbers for R16 through Final to their source matches.
/// Winners of the source matches feed into the next round (except third-place match which takes losers).
let KNOCKOUT_BRACKET: [Int: KnockoutBracketEntry] = [
    // Round of 16 (winners of R32 matches)
    89: KnockoutBracketEntry(homeFromMatch: 73, awayFromMatch: 74),
    90: KnockoutBracketEntry(homeFromMatch: 75, awayFromMatch: 76),
    91: KnockoutBracketEntry(homeFromMatch: 77, awayFromMatch: 78),
    92: KnockoutBracketEntry(homeFromMatch: 79, awayFromMatch: 80),
    93: KnockoutBracketEntry(homeFromMatch: 81, awayFromMatch: 82),
    94: KnockoutBracketEntry(homeFromMatch: 83, awayFromMatch: 84),
    95: KnockoutBracketEntry(homeFromMatch: 85, awayFromMatch: 86),
    96: KnockoutBracketEntry(homeFromMatch: 87, awayFromMatch: 88),
    // Quarter Finals (winners of R16 matches)
    97: KnockoutBracketEntry(homeFromMatch: 89, awayFromMatch: 90),
    98: KnockoutBracketEntry(homeFromMatch: 91, awayFromMatch: 92),
    99: KnockoutBracketEntry(homeFromMatch: 93, awayFromMatch: 94),
    100: KnockoutBracketEntry(homeFromMatch: 95, awayFromMatch: 96),
    // Semi Finals (winners of QF matches)
    101: KnockoutBracketEntry(homeFromMatch: 97, awayFromMatch: 98),
    102: KnockoutBracketEntry(homeFromMatch: 99, awayFromMatch: 100),
    // Third Place Match (LOSERS of SF matches)
    103: KnockoutBracketEntry(homeFromMatch: 101, awayFromMatch: 102, homeIsLoser: true, awayIsLoser: true),
    // Final (winners of SF matches)
    104: KnockoutBracketEntry(homeFromMatch: 101, awayFromMatch: 102),
]

// MARK: - Stage Match Numbers

/// Returns the match number range for each stage.
func stageMatchNumbers(for stage: WizardStage) -> ClosedRange<Int>? {
    switch stage {
    case .groupStage: return 1...72
    case .roundOf32: return 73...88
    case .roundOf16: return 89...96
    case .quarterFinals: return 97...100
    case .semiFinals: return 101...102
    case .finals: return 103...104
    case .summary: return nil
    }
}
