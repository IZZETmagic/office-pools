import SwiftUI

// =============================================
// SPORTPOOL DESIGN SYSTEM — Single Color Source
//
// All app colors live under Color.sp.*
// Structural (snow, surface, ink, …), brand
// (primary, accent), feedback (green, red, amber),
// and semantic (tier, streak, level, rarity, XP).
//
// Reuses the Color(hex:) initializer defined
// in the Color extension below.
// =============================================

extension Color {
    enum sp {
        // MARK: - Neutrals

        /// Page backgrounds
        static let snow     = Color.adaptive(light: 0xF7F8FC, dark: 0x121520)
        /// Card / elevated surface backgrounds
        static let surface  = Color.adaptive(light: 0xFFFFFF, dark: 0x1C2030)
        /// Dividers, input fields, skeleton blocks
        static let mist     = Color.adaptive(light: 0xEEF1F8, dark: 0x232840)
        /// Borders
        static let silver   = Color.adaptive(light: 0xD4DAE8, dark: 0x2E3448)
        /// Secondary text, inactive icons
        static let slate    = Color.adaptive(light: 0x7B87A8, dark: 0x8B97B8)
        /// Primary text, headings
        static let ink      = Color.adaptive(light: 0x1B2340, dark: 0xE8EAF0)
        /// Dark hero accents (countdown, bar headers)
        static let midnight = Color.adaptive(light: 0x0B0F1A, dark: 0x0B0F1A)

        // MARK: - Primary

        /// Primary actions, links, active tab
        static let primary      = Color.adaptive(light: 0x3B6EFF, dark: 0x5B8AFF)
        /// Selected pill backgrounds, tab indicator
        static let primaryLight = Color.adaptive(light: 0xF7F9FF, dark: 0x1A2440)

        // MARK: - Accent

        /// Highlights, countdown number, exact predictions
        static let accent      = Color.adaptive(light: 0xF5C518, dark: 0xF5C518)
        /// Action banner backgrounds
        static let accentLight = Color.adaptive(light: 0xFFF8E1, dark: 0x2A2210)

        // MARK: - Feedback

        static let green      = Color.adaptive(light: 0x22C55E, dark: 0x34D972)
        static let greenLight = Color.adaptive(light: 0xECFDF5, dark: 0x0F2A1A)
        static let red        = Color.adaptive(light: 0xEF4444, dark: 0xF87171)
        static let redLight   = Color.adaptive(light: 0xFEF2F2, dark: 0x2A1010)
        static let amber      = Color.adaptive(light: 0xF59E0B, dark: 0xFBBF24)
        static let amberLight = Color.adaptive(light: 0xFFFBEB, dark: 0x2A2210)

        // MARK: - Prediction Tier Colors

        static let tierExact    = Color(hex: 0xE2B830)  // gold — exact score
        static let tierWinnerGd = Color(hex: 0x52D660)  // green — correct winner + GD
        static let tierWinner   = Color(hex: 0x30B7FF)  // blue — correct result
        static let tierMiss     = Color(hex: 0xA1A6A0)  // gray — wrong

        // MARK: - XP Category Colors

        static let xpMatch = Color(hex: 0x30B7FF)  // blue
        static let xpBonus = Color(hex: 0xF0B50F)  // amber
        static let xpBadge = Color(hex: 0xE2B830)  // gold

        // MARK: - Streak Colors

        static let hotStreak  = Color(hex: 0xF4C41B)  // warm yellow
        static let coldStreak = Color(hex: 0x8DE2FF)  // cool blue

        // MARK: - Special

        static let bronze        = Color(hex: 0xCD7F32)
        static let outperforming = Color(hex: 0x2BBC3B)

        // MARK: - Level Progression

        static func levelColor(_ level: Int) -> Color {
            switch level {
            case 10:    return accent        // gold — Legend
            case 8...9: return amber         // amber — Master/Expert
            case 6...7: return primary       // blue — Strategist/Tactician
            case 4...5: return Color(hex: 0x57D0FF) // lighter blue — Contender/Competitor
            default:    return green          // green — Rookie/Beginner/Amateur
            }
        }

        // MARK: - Badge Rarity

        static func rarityColor(_ rarity: String) -> Color {
            switch rarity {
            case "Common":    return slate
            case "Uncommon":  return green
            case "Rare":      return primary
            case "Very Rare": return Color(hex: 0x1281E2)
            case "Legendary": return accent
            default:          return slate
            }
        }
    }
}
