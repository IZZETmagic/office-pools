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

    /// Detail / metadata text — 10pt, medium, rounded
    static let detail = Font.system(size: 10, weight: .medium, design: .rounded)

    /// Monospaced number at a given size — scores, countdowns, stats
    static func mono(size: CGFloat, weight: Font.Weight = .bold) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }

    /// Rank position color (podium + rows).
    static func rankColor(_ rank: Int) -> Color {
        switch rank {
        case 1: return Color.sp.accent
        case 2: return Color.sp.silver
        case 3: return AppColors.bronze
        default: return Color.sp.primary
        }
    }
}

// MARK: - Date Formatting

enum SPDateFormatter {
    nonisolated(unsafe) private static let iso8601: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    nonisolated(unsafe) private static let iso8601NoFrac: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    nonisolated(unsafe) private static let shortDate: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f
    }()

    nonisolated(unsafe) private static let longDate: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM d, yyyy 'at' h:mm a"
        return f
    }()

    /// Parse an ISO8601 date string (with or without fractional seconds).
    static func parse(_ dateString: String) -> Date? {
        iso8601.date(from: dateString) ?? iso8601NoFrac.date(from: dateString)
    }

    /// "Jun 11"
    static func short(_ dateString: String) -> String {
        guard let date = parse(dateString) else { return dateString }
        return shortDate.string(from: date)
    }

    /// "Jun 11, 2026 at 3:00 PM"
    static func long(_ dateString: String) -> String {
        guard let date = parse(dateString) else { return dateString }
        return longDate.string(from: date)
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

    /// Standard white card chrome: background, rounded corners, shadow, border.
    func spCard(radius: CGFloat = SPDesign.Radius.lg) -> some View {
        self.background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: radius))
            .spCardShadow()
            .overlay {
                RoundedRectangle(cornerRadius: radius)
                    .strokeBorder(Color.sp.silver.opacity(0.5), lineWidth: AppDesign.Border.thin)
            }
    }
}
