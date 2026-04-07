import SwiftUI

// =============================================
// SPORTPOOL DESIGN TOKENS
//
// New brand design system: rounded, soft,
// bubbly. Sits alongside AppDesign which
// continues to serve non-redesigned screens.
// =============================================

// MARK: - Radius / Shadow / Spacing

enum SPDesign {

    enum Radius {
        static let sm: CGFloat = 12   // badges, small pills
        static let md: CGFloat = 18   // inputs, inner containers
        static let lg: CGFloat = 24   // cards
        static let xl: CGFloat = 32   // hero containers
    }
}

// MARK: - Typography

enum SPTypography {
    /// Page titles — 32pt, extra-bold, rounded
    static let pageTitle = Font.system(size: 32, weight: .heavy, design: .rounded)
    /// Section headers — 20pt, extra-bold, rounded
    static let sectionHeader = Font.system(size: 20, weight: .heavy, design: .rounded)
    /// Card titles — 16pt, bold, rounded
    static let cardTitle = Font.system(size: 16, weight: .bold, design: .rounded)
    /// Body text — 14pt, medium, rounded
    static let body = Font.system(size: 14, weight: .medium, design: .rounded)
    /// Caption labels — 11pt, bold, rounded (use with .spCaption() for full style)
    static let caption = Font.system(size: 11, weight: .bold, design: .rounded)

    /// Monospaced number at a given size — scores, countdowns, stats
    static func mono(size: CGFloat, weight: Font.Weight = .bold) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

// MARK: - View Extensions

extension View {
    /// Caption label style: 11pt bold rounded, uppercase, wide tracking.
    func spCaption() -> some View {
        self.font(SPTypography.caption)
            .textCase(.uppercase)
            .tracking(1.5)
    }

    /// Standard SportPool card shadow — soft and subtle.
    func spCardShadow() -> some View {
        self.shadow(color: Color.black.opacity(0.04), radius: 10, y: 2)
    }
}
