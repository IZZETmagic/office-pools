import SwiftUI

// =============================================
// APP DESIGN TOKENS
//
// Centralized spacing, radii, shadows, borders,
// and component tokens. Sits alongside AppColors
// to form the complete design system.
//
// Based on a 4pt grid. All values are CGFloat
// unless noted otherwise.
// =============================================

enum AppDesign {

    // MARK: - Spacing (4pt base grid)

    enum Spacing {
        static let xxs: CGFloat = 2
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 20
        static let xxl: CGFloat = 24
    }

    // MARK: - Corner Radii

    enum Radius {
        static let xs: CGFloat = 8   // tiny pills, flags
        static let sm: CGFloat = 12  // inner tinted areas, badge backgrounds
        static let md: CGFloat = 16  // standard cards
        static let lg: CGFloat = 20  // emphasis containers, stat cards, empty states
    }

    // MARK: - Shadows

    enum Shadow {
        // Standard card elevation (pool cards, activity cards, match cards)
        static let cardColor = Color.black.opacity(0.06)
        static let cardRadius: CGFloat = 6
        static let cardY: CGFloat = 3

        // Subtle / inner elevation (detail rows, filter pills)
        static let subtleColor = Color.black.opacity(0.04)
        static let subtleRadius: CGFloat = 4
        static let subtleY: CGFloat = 2
    }

    // MARK: - Borders

    enum Border {
        static let thin: CGFloat = 0.5
        static let standard: CGFloat = 1
        static let accent: CGFloat = 1.5
    }

    // MARK: - Badge Pills

    enum Badge {
        static let paddingH: CGFloat = 8
        static let paddingV: CGFloat = 3
        static let font = Font.caption2.weight(.medium)
    }

    // MARK: - Form Sparkline

    enum Sparkline {
        static let barWidth: CGFloat = 6
        static let barSpacing: CGFloat = 3
        static let barCornerRadius: CGFloat = 1.5
        static let containerHeight: CGFloat = 22
        static let heightExact: CGFloat = 22
        static let heightWinnerGd: CGFloat = 16
        static let heightWinner: CGFloat = 11
        static let heightMiss: CGFloat = 6
    }
}
