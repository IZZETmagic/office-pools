import SwiftUI

// =============================================
// SPORTPOOL BRAND PALETTE
//
// Layered alongside AppColors. Use Color.sp.*
// for brand/structural colors on redesigned
// screens. AppColors.* still owns semantic
// aliases (tier, streak, level, rarity, XP).
//
// Reuses the Color(hex:) initializer from
// AppColors.swift.
// =============================================

extension Color {
    enum sp {
        // MARK: - Neutrals

        /// Page backgrounds
        static let snow     = Color(hex: 0xF7F8FC)
        /// Dividers, input fields, skeleton blocks
        static let mist     = Color(hex: 0xEEF1F8)
        /// Borders
        static let silver   = Color(hex: 0xD4DAE8)
        /// Secondary text, inactive icons
        static let slate    = Color(hex: 0x7B87A8)
        /// Primary text, headings
        static let ink      = Color(hex: 0x1B2340)
        /// Dark hero accents (countdown, bar headers)
        static let midnight = Color(hex: 0x0B0F1A)

        // MARK: - Primary

        /// Primary actions, links, active tab
        static let primary      = Color(hex: 0x3B6EFF)
        /// Selected pill backgrounds, tab indicator
        static let primaryLight = Color(hex: 0xEBF1FF)

        // MARK: - Accent

        /// Highlights, countdown number
        static let accent      = Color(hex: 0xF5C518)
        /// Action banner backgrounds
        static let accentLight = Color(hex: 0xFFF8E1)

        // MARK: - Feedback

        static let green      = Color(hex: 0x22C55E)
        static let greenLight = Color(hex: 0xECFDF5)
        static let red        = Color(hex: 0xEF4444)
        static let redLight   = Color(hex: 0xFEF2F2)
        static let amber      = Color(hex: 0xF59E0B)
        static let amberLight = Color(hex: 0xFFFBEB)
    }
}
