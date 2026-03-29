import SwiftUI

// =============================================
// APP COLOR PALETTE
//
// 60% — Neutral (Blue Smoke): backgrounds, text, borders, cards
// 30% — Primary (Azure Radiance): CTAs, active states, links, brand
// 10% — Accent (Gold) + functional colors (Success, Warning, Error)
//
// Mapped from the shared design palette. Values are RGB hex.
// =============================================

enum AppColors {

    // MARK: - Primary (Azure Radiance)

    static let primary50  = Color(hex: 0xEEFAFF)
    static let primary100 = Color(hex: 0xD9F4FF)
    static let primary200 = Color(hex: 0xBBECFF)
    static let primary300 = Color(hex: 0x8DE2FF)
    static let primary400 = Color(hex: 0x57D0FF)
    static let primary500 = Color(hex: 0x30B7FF)
    static let primary600 = Color(hex: 0x199BF7)
    static let primary700 = Color(hex: 0x1281E2)
    static let primary800 = Color(hex: 0x1667B7)
    static let primary900 = Color(hex: 0x185890)
    static let primary950 = Color(hex: 0x133658)

    // MARK: - Neutral (Blue Smoke)

    static let neutral50  = Color(hex: 0xF9FAFA)
    static let neutral100 = Color(hex: 0xF4F5F5)
    static let neutral200 = Color(hex: 0xE4E7E4)
    static let neutral300 = Color(hex: 0xD2D5D2)
    static let neutral400 = Color(hex: 0xA1A6A0)
    static let neutral500 = Color(hex: 0x7B847B)
    static let neutral600 = Color(hex: 0x4F5650)
    static let neutral700 = Color(hex: 0x3D433D)
    static let neutral800 = Color(hex: 0x262825)
    static let neutral900 = Color(hex: 0x181B18)
    static let neutral950 = Color(hex: 0x090C09)

    // MARK: - Success (Bilbao)

    static let success50  = Color(hex: 0xF1FCF1)
    static let success100 = Color(hex: 0xDEFAE1)
    static let success200 = Color(hex: 0xBEF4C3)
    static let success300 = Color(hex: 0x8CE996)
    static let success400 = Color(hex: 0x52D660)
    static let success500 = Color(hex: 0x2BBC3B)
    static let success600 = Color(hex: 0x1E9B2C)
    static let success700 = Color(hex: 0x1B7A26)
    static let success800 = Color(hex: 0x1A6123)
    static let success900 = Color(hex: 0x184F20)
    static let success950 = Color(hex: 0x072C0C)

    // MARK: - Warning (Lightning Yellow)

    static let warning50  = Color(hex: 0xFDFCE9)
    static let warning100 = Color(hex: 0xFCF7C5)
    static let warning200 = Color(hex: 0xFBEC8D)
    static let warning300 = Color(hex: 0xF8DA4C)
    static let warning400 = Color(hex: 0xF4C41B)
    static let warning500 = Color(hex: 0xF0B50F)
    static let warning600 = Color(hex: 0xC58409)
    static let warning700 = Color(hex: 0x9D5E0B)
    static let warning800 = Color(hex: 0x824B11)
    static let warning900 = Color(hex: 0x6E3D15)
    static let warning950 = Color(hex: 0x401F08)

    // MARK: - Error (Tabasco)

    static let error50  = Color(hex: 0xFFF2F1)
    static let error100 = Color(hex: 0xFFE3E0)
    static let error200 = Color(hex: 0xFFCCC7)
    static let error300 = Color(hex: 0xFFA9A0)
    static let error400 = Color(hex: 0xFF7769)
    static let error500 = Color(hex: 0xF94C3A)
    static let error600 = Color(hex: 0xE62F1C)
    static let error700 = Color(hex: 0xC22313)
    static let error800 = Color(hex: 0xA02114)
    static let error900 = Color(hex: 0x842218)
    static let error950 = Color(hex: 0x480D07)

    // MARK: - Accent (Gold)
    // Reward color — exact predictions, achievements, legendary badges

    static let accent50  = Color(hex: 0xFDF8E8)
    static let accent100 = Color(hex: 0xFAF0C8)
    static let accent300 = Color(hex: 0xF0D060)
    static let accent400 = Color(hex: 0xE2B830)
    static let accent500 = Color(hex: 0xD4A017)
    static let accent600 = Color(hex: 0xB8880F)
    static let accent700 = Color(hex: 0x946F0E)
    static let accent900 = Color(hex: 0x5C440A)

    // MARK: - One-off: Bronze (podium 3rd place)

    static let bronze = Color(hex: 0xCD7F32)

    // MARK: - Semantic Aliases

    /// Primary brand color for CTAs, links, active states
    static let brand = primary700

    /// Tier colors for prediction results (visual fills — use 400-500 for pop)
    static let tierExact    = accent400   // gold — exact score
    static let tierWinnerGd = success400  // green — correct winner + GD
    static let tierWinner   = primary500  // blue — correct result
    static let tierMiss     = neutral400  // gray — wrong

    /// Level progression colors (rings, numbers — visual, use 400-500)
    static func levelColor(_ level: Int) -> Color {
        switch level {
        case 10:   return accent400   // gold — Legend
        case 8...9: return warning500 // amber — Master/Expert
        case 6...7: return primary600 // blue — Strategist/Tactician
        case 4...5: return primary400 // lighter blue — Contender/Competitor
        default:    return success400 // green — Rookie/Beginner/Amateur
        }
    }

    /// Badge rarity colors (icons/fills — use 400-500 for visual, 600 for text)
    static func rarityColor(_ rarity: String) -> Color {
        switch rarity {
        case "Common":    return neutral400
        case "Uncommon":  return success500
        case "Rare":      return primary500
        case "Very Rare": return primary700
        case "Legendary": return accent400
        default:          return neutral400
        }
    }

    /// XP category colors (numbers — visual emphasis, use 500)
    static let xpMatch  = primary500  // Match XP
    static let xpBonus  = warning500  // Bonus XP
    static let xpBadge  = accent400   // Badge XP

    /// Streak colors (big numbers + icons — visual, use 400-500)
    static let hotStreak  = warning400
    static let coldStreak = primary300

    /// Performance
    static let outperforming = success500
}

// MARK: - Hex Color Initializer

extension Color {
    init(hex: UInt, opacity: Double = 1.0) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255.0,
            green: Double((hex >> 8) & 0xFF) / 255.0,
            blue: Double(hex & 0xFF) / 255.0,
            opacity: opacity
        )
    }
}
