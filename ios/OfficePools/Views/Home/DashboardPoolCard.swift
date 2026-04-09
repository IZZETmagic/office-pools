import SwiftUI

/// Compact pool card for the Home dashboard — matches countdown hero height (180pt).
struct DashboardPoolCard: View {
    let data: PoolCardData

    private var brandColorValue: Color? {
        guard let hex = data.pool.brandColor else { return nil }
        return Color(hex: UInt(hex.dropFirst(), radix: 16) ?? 0)
    }

    private var accentGradient: LinearGradient {
        if data.pool.hasBranding, let c = brandColorValue {
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

    private var accentColor: Color {
        if data.pool.hasBranding, let c = brandColorValue { return c }
        switch data.pool.predictionMode {
        case .fullTournament: return Color.sp.primary
        case .progressive: return Color.sp.green
        case .bracketPicker: return Color.sp.accent
        }
    }

    private var ringGradientColors: [Color] {
        if data.pool.hasBranding, let c = brandColorValue {
            return [c, c.opacity(0.7)]
        }
        switch data.pool.predictionMode {
        case .fullTournament: return [Color(hex: 0x667EEA), Color(hex: 0x3B6EFF)]
        case .progressive: return [Color(hex: 0x34D399), Color(hex: 0x059669)]
        case .bracketPicker: return [Color(hex: 0xFBBF24), Color(hex: 0xD97706)]
        }
    }

    private var predictionProgress: CGFloat {
        guard data.predictionsTotal > 0 else { return 0 }
        return CGFloat(data.predictionsCompleted) / CGFloat(data.predictionsTotal)
    }

    var body: some View {
        HStack(spacing: 0) {
            // Left accent bar (non-branded pools only)
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
                if data.pool.hasBranding, let brandColor = brandColorValue {
                    HStack(spacing: 4) {
                        Text(data.pool.brandEmoji ?? "")
                            .font(.caption2)
                        Text(data.pool.brandName ?? "")
                            .font(.caption2.weight(.bold))
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(brandColor)
                }

                VStack(alignment: .leading, spacing: 8) {
                    // Pool name + unread badge
                    HStack(alignment: .top) {
                        Text(data.pool.poolName)
                            .font(SPTypography.cardTitle)
                            .foregroundStyle(Color.sp.ink)
                            .lineLimit(2)
                            .minimumScaleFactor(0.85)

                        Spacer()

                        if data.unreadBanterCount > 0 {
                            Text("\(data.unreadBanterCount)")
                                .font(.caption2.bold())
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Color.sp.red, in: Capsule())
                        }
                    }

                    // Big rank
                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                        if let rank = data.userRank {
                            Text("#\(rank)")
                                .font(SPTypography.mono(size: 32, weight: .heavy))
                                .foregroundStyle(Color.sp.ink)
                            Text("of \(data.totalEntries)")
                                .font(SPTypography.body)
                                .foregroundStyle(Color.sp.slate)
                        } else {
                            Text("--")
                                .font(SPTypography.mono(size: 32, weight: .heavy))
                                .foregroundStyle(Color.sp.slate)
                        }
                    }

                    Spacer()

                    // Bottom row: member avatars + progress ring + points
                    HStack {
                        // Overlapping member circles
                        memberAvatars

                        Spacer()

                        // Progress ring + points
                        HStack(spacing: 8) {
                            progressRing
                            Text("\(data.totalPoints) pts")
                                .font(SPTypography.caption)
                                .foregroundStyle(Color.sp.slate)
                        }
                    }
                }
                .padding(12)
            }
        }
        .frame(width: 220, height: 180)
        .background {
            RoundedRectangle(cornerRadius: SPDesign.Radius.lg)
                .fill(data.pool.hasBranding && brandColorValue != nil
                    ? AnyShapeStyle(brandColorValue!.opacity(0.05))
                    : AnyShapeStyle(Color.white))
        }
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
    }

    // MARK: - Member Avatars

    private let avatarGradients: [[Color]] = [
        [Color(hex: 0x667EEA), Color(hex: 0x764BA2)],
        [Color(hex: 0xF093FB), Color(hex: 0xF5576C)],
        [Color(hex: 0x4FACFE), Color(hex: 0x00F2FE)],
    ]

    private var memberAvatars: some View {
        HStack(spacing: -6) {
            ForEach(Array(data.memberInitials.prefix(3).enumerated()), id: \.offset) { i, initials in
                Circle()
                    .fill(
                        LinearGradient(
                            colors: avatarGradients[i % avatarGradients.count],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 24, height: 24)
                    .overlay {
                        Text(initials)
                            .font(.system(size: 9, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                    }
                    .overlay {
                        Circle()
                            .strokeBorder(Color.white, lineWidth: 1.5)
                    }
            }

            if data.memberCount > 3 {
                Text("+\(data.memberCount - 3)")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.sp.slate)
                    .padding(.leading, 4)
            }
        }
    }

    // MARK: - Progress Ring

    private var progressRing: some View {
        ZStack {
            Circle()
                .stroke(Color.sp.mist, lineWidth: 2.5)
            Circle()
                .trim(from: 0, to: predictionProgress)
                .stroke(
                    AngularGradient(
                        gradient: Gradient(colors: ringGradientColors),
                        center: .center,
                        startAngle: .degrees(0),
                        endAngle: .degrees(360 * predictionProgress)
                    ),
                    style: StrokeStyle(lineWidth: 2.5, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
            Text("\(data.predictionsCompleted)")
                .font(.system(size: 8, weight: .bold, design: .rounded))
                .foregroundStyle(Color.sp.ink)
        }
        .frame(width: 24, height: 24)
    }

    private func formColor(for result: FormResult) -> Color {
        switch result {
        case .exact: return Color.sp.accent
        case .winnerGd: return Color.sp.green
        case .winner: return Color.sp.primary
        case .miss: return Color.sp.red
        case .placeholder: return Color.sp.mist
        }
    }
}

#Preview {
    ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 12) {
            DashboardPoolCard(data: PoolCardData(
                pool: Pool(
                    poolId: "1", poolName: "Office Pool",
                    poolCode: "ABC", description: nil, status: "open",
                    isPrivate: false, maxParticipants: nil, maxEntriesPerUser: 1,
                    tournamentId: "t1", predictionDeadline: nil,
                    predictionMode: .fullTournament,
                    createdAt: "", updatedAt: "",
                    brandName: "Acme Co", brandEmoji: "🏢", brandColor: "#3B6EFF", brandAccent: nil
                ),
                userRank: 2, totalEntries: 13, totalPoints: 87,
                formResults: [.exact, .winnerGd, .miss, .exact, .winner],
                deadline: Date().addingTimeInterval(86400),
                unreadBanterCount: 3,
                needsPredictions: false,
                memberCount: 13,
                isAdmin: true,
                levelNumber: 2,
                levelName: "Beginner",
                predictionsCompleted: 72,
                predictionsTotal: 104,
                memberInitials: ["RS", "JD", "MK"],
                hitRate: 0.65, exactCount: 5, totalCompleted: 72
            ))
            DashboardPoolCard(data: PoolCardData(
                pool: Pool(
                    poolId: "2", poolName: "Family Cup 2026",
                    poolCode: "XYZ", description: nil, status: "open",
                    isPrivate: false, maxParticipants: nil, maxEntriesPerUser: 1,
                    tournamentId: "t1", predictionDeadline: nil,
                    predictionMode: .progressive,
                    createdAt: "", updatedAt: "",
                    brandName: nil, brandEmoji: nil, brandColor: nil, brandAccent: nil
                ),
                userRank: 5, totalEntries: 8, totalPoints: 42,
                formResults: [.miss, .winner, .miss],
                deadline: nil,
                unreadBanterCount: 0,
                needsPredictions: true,
                memberCount: 3,
                isAdmin: false,
                levelNumber: 1,
                levelName: "Rookie",
                predictionsCompleted: 36,
                predictionsTotal: 104,
                memberInitials: ["AL", "TW", "SB"],
                hitRate: 0.45, exactCount: 2, totalCompleted: 36
            ))
        }
        .padding(.horizontal, 20)
    }
    .padding(.vertical, 20)
    .background(Color.sp.snow)
}
