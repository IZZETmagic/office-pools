import SwiftUI

/// Tappable pool card for the Discover section — shows pool info at a glance.
struct DiscoverPoolCardView: View {
    let data: DiscoverPoolData

    // MARK: - Colour helpers

    private var modeColor: Color {
        switch data.pool.predictionMode {
        case .fullTournament: return Color(hex: 0x3B6EFF)
        case .progressive: return Color(hex: 0x059669)
        case .bracketPicker: return Color(hex: 0xD97706)
        }
    }

    private var accentGradient: LinearGradient {
        if data.pool.hasBranding, let hex = data.pool.brandColor,
           let val = UInt(hex.dropFirst(), radix: 16) {
            let c = Color(hex: val)
            return LinearGradient(colors: [c, c.opacity(0.7)], startPoint: .top, endPoint: .bottom)
        }
        switch data.pool.predictionMode {
        case .fullTournament:
            return LinearGradient(colors: [Color(hex: 0x667EEA), Color(hex: 0x3B6EFF)], startPoint: .top, endPoint: .bottom)
        case .progressive:
            return LinearGradient(colors: [Color(hex: 0x34D399), Color(hex: 0x059669)], startPoint: .top, endPoint: .bottom)
        case .bracketPicker:
            return LinearGradient(colors: [Color(hex: 0xFBBF24), Color(hex: 0xD97706)], startPoint: .top, endPoint: .bottom)
        }
    }

    private var modeName: String {
        switch data.pool.predictionMode {
        case .fullTournament: return "Full Tournament"
        case .progressive: return "Progressive"
        case .bracketPicker: return "Bracket Picker"
        }
    }

    // MARK: - Body

    var body: some View {
        HStack(spacing: 0) {
            // Left accent bar
            if !data.pool.hasBranding {
                UnevenRoundedRectangle(
                    topLeadingRadius: SPDesign.Radius.lg,
                    bottomLeadingRadius: SPDesign.Radius.lg,
                    bottomTrailingRadius: 0,
                    topTrailingRadius: 0
                )
                .fill(accentGradient)
                .frame(width: 5)
            }

            VStack(alignment: .leading, spacing: 0) {
                // Brand strip
                if data.pool.hasBranding, let hex = data.pool.brandColor,
                   let val = UInt(hex.dropFirst(), radix: 16) {
                    HStack(spacing: 4) {
                        Text(data.pool.brandEmoji ?? "")
                            .font(.caption2)
                        Text(data.pool.brandName ?? "")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(hex: val))
                }

                VStack(alignment: .leading, spacing: 10) {
                    // Row 1: Name + joined badge
                    HStack {
                        Text(data.pool.poolName)
                            .font(SPTypography.cardTitle)
                            .foregroundStyle(Color.sp.ink)
                            .lineLimit(1)

                        Spacer()

                        if data.isAlreadyJoined {
                            HStack(spacing: 3) {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 10))
                                Text("Joined")
                                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                            }
                            .foregroundStyle(Color.sp.green)
                        } else {
                            Image(systemName: "chevron.right")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(Color.sp.slate.opacity(0.5))
                        }
                    }

                    // Row 2: Description (if any)
                    if let desc = data.pool.description, !desc.isEmpty {
                        Text(desc)
                            .font(SPTypography.body)
                            .foregroundStyle(Color.sp.slate)
                            .lineLimit(2)
                    }

                    // Row 3: Badges + meta
                    HStack(spacing: 6) {
                        badgePill(modeName, color: modeColor)

                        Spacer()

                        HStack(spacing: 4) {
                            Image(systemName: "person.2.fill")
                                .font(.system(size: 10))
                            if let max = data.pool.maxParticipants, max > 0 {
                                Text("\(data.memberCount)/\(max)")
                                    .font(SPTypography.caption)
                            } else {
                                Text("\(data.memberCount)")
                                    .font(SPTypography.caption)
                            }
                        }
                        .foregroundStyle(Color.sp.slate)

                        if let deadlineStr = data.pool.predictionDeadline,
                           let date = SPDateFormatter.parse(deadlineStr) {
                            let days = Calendar.current.dateComponents([.day], from: Date(), to: date).day ?? 0
                            HStack(spacing: 3) {
                                Image(systemName: "clock")
                                    .font(.system(size: 10))
                                Text(days > 0 ? "\(days)d" : "Soon")
                                    .font(SPTypography.caption)
                            }
                            .foregroundStyle(days <= 3 ? Color.sp.red : Color.sp.slate)
                        }
                    }
                }
                .padding(14)
            }
        }
        .background {
            RoundedRectangle(cornerRadius: SPDesign.Radius.lg)
                .fill(Color.sp.surface)
        }
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
    }

    // MARK: - Badge

    private func badgePill(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold, design: .rounded))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.1))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}
