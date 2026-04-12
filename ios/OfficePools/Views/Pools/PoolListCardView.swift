import SwiftUI

/// Full-width rich pool card for the Pools tab — SP design system.
struct PoolListCardView: View {
    let data: PoolCardData

    // MARK: - Colour helpers

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

    private var modeColor: Color {
        switch data.pool.predictionMode {
        case .fullTournament: return Color(hex: 0x3B6EFF)
        case .progressive: return Color(hex: 0x059669)
        case .bracketPicker: return Color(hex: 0xD97706)
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

    // MARK: - Body

    var body: some View {
        HStack(spacing: 0) {
            // Left accent bar (non-branded only)
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
                // Brand strip (branded pools only)
                if data.pool.hasBranding, let brandColor = brandColorValue {
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
                    .background(brandColor)
                }

                VStack(alignment: .leading, spacing: 14) {
                    // Row 1: Pool name + unread badge
                    HStack(alignment: .top) {
                        Text(data.pool.poolName)
                            .font(SPTypography.cardTitle)
                            .foregroundStyle(Color.sp.ink)
                            .lineLimit(1)

                        Spacer()

                        if data.unreadBanterCount > 0 {
                            Text("\(data.unreadBanterCount)")
                                .font(.caption2.bold())
                                .foregroundStyle(.white)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.sp.red, in: Capsule())
                        }
                    }

                    // Row 2: Badges
                    HStack(spacing: 6) {
                        if data.isAdmin {
                            badgePill("Admin", color: Color.sp.slate)
                        }
                        badgePill(modeName, color: modeColor)

                        Spacer()

                        HStack(spacing: 4) {
                            Image(systemName: "person.2.fill")
                                .font(.system(size: 10))
                            Text("\(data.memberCount)")
                                .font(SPTypography.caption)
                        }
                        .foregroundStyle(Color.sp.slate)
                    }

                    // Row 3: Stats — Rank, Points, Level, Form, Progress ring
                    HStack(spacing: 0) {
                        // Rank
                        statColumn(
                            title: "Rank",
                            value: data.userRank.map { "#\($0)" } ?? "--"
                        )

                        statDivider

                        // Points
                        statColumn(
                            title: "Points",
                            value: "\(data.totalPoints)",
                            valueColor: Color.sp.primary
                        )

                        statDivider

                        // Level
                        VStack(spacing: 3) {
                            Text("Level")
                                .font(.system(size: 10, weight: .medium, design: .rounded))
                                .foregroundStyle(Color.sp.slate)
                            Text("Lv.\(data.levelNumber)")
                                .font(SPTypography.mono(size: 14, weight: .heavy))
                                .foregroundStyle(Color.sp.ink)
                            Text(data.levelName)
                                .font(.system(size: 9, weight: .medium, design: .rounded))
                                .foregroundStyle(Color.sp.slate)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity)

                        statDivider

                        // Form sparkline
                        VStack(spacing: 3) {
                            Text("Form")
                                .font(.system(size: 10, weight: .medium, design: .rounded))
                                .foregroundStyle(Color.sp.slate)
                            formSparkline
                        }
                        .frame(maxWidth: .infinity)

                        statDivider

                        // Progress ring
                        VStack(spacing: 3) {
                            Text("Progress")
                                .font(.system(size: 10, weight: .medium, design: .rounded))
                                .foregroundStyle(Color.sp.slate)
                            progressRing
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .padding(12)
                    .background {
                        RoundedRectangle(cornerRadius: SPDesign.Radius.sm)
                            .fill(Color.sp.snow)
                    }

                    // Row 4: Status + deadline
                    HStack {
                        if data.needsPredictions {
                            HStack(spacing: 6) {
                                Circle()
                                    .fill(Color.sp.amber)
                                    .frame(width: 7, height: 7)
                                    .modifier(PulsingModifier())
                                Text(data.currentRoundLabel != nil ? "\(data.currentRoundLabel!) predictions needed" : "Predictions needed")
                                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                                    .foregroundStyle(Color.sp.amber)
                            }
                        } else {
                            Text(statusText)
                                .font(.system(size: 12, weight: .medium, design: .rounded))
                                .foregroundStyle(Color.sp.slate)
                        }

                        Spacer()

                        if let deadline = data.deadline {
                            deadlineBadge(deadline)
                        }
                    }
                }
                .padding(14)
            }
        }
        .background {
            RoundedRectangle(cornerRadius: SPDesign.Radius.lg)
                .fill(data.pool.hasBranding && brandColorValue != nil
                    ? AnyShapeStyle((brandColorValue ?? Color.sp.surface).opacity(0.03))
                    : AnyShapeStyle(Color.sp.surface))
        }
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(data.pool.poolName), rank \(data.userRank.map { "\($0)" } ?? "none"), \(data.totalPoints) points, \(data.memberCount) members")
    }

    // MARK: - Stat Columns

    private func statColumn(title: String, value: String, valueColor: Color = Color.sp.ink) -> some View {
        VStack(spacing: 3) {
            Text(title)
                .font(.system(size: 10, weight: .medium, design: .rounded))
                .foregroundStyle(Color.sp.slate)
            Text(value)
                .font(SPTypography.mono(size: 14, weight: .heavy))
                .foregroundStyle(valueColor)
        }
        .frame(maxWidth: .infinity)
    }

    private var statDivider: some View {
        Rectangle()
            .fill(Color.sp.mist)
            .frame(width: 0.5, height: 28)
    }

    // MARK: - Badges

    private func badgePill(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold, design: .rounded))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.1))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }

    private var modeName: String {
        switch data.pool.predictionMode {
        case .fullTournament: return "Full Tournament"
        case .progressive: return "Progressive"
        case .bracketPicker: return "Bracket Picker"
        }
    }

    // MARK: - Form Sparkline

    private var formSparkline: some View {
        HStack(alignment: .bottom, spacing: 3) {
            if data.formResults.isEmpty {
                ForEach(0..<5, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: 1.5)
                        .fill(Color.sp.mist)
                        .frame(width: 6, height: 6)
                }
            } else {
                ForEach(Array(data.formResults.enumerated()), id: \.offset) { _, result in
                    RoundedRectangle(cornerRadius: 1.5)
                        .fill(formColor(for: result))
                        .frame(width: 6, height: formBarHeight(for: result))
                }
            }
        }
        .frame(height: 22, alignment: .bottom)
    }

    private func formBarHeight(for result: FormResult) -> CGFloat {
        switch result {
        case .exact:       return 22
        case .winnerGd:    return 16
        case .winner:      return 11
        case .miss:        return 6
        case .placeholder: return 6
        }
    }

    private func formColor(for result: FormResult) -> Color {
        switch result {
        case .exact:       return Color.sp.accent
        case .winnerGd:    return Color.sp.green
        case .winner:      return Color.sp.primary
        case .miss:        return Color.sp.red
        case .placeholder: return Color.sp.mist
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
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .foregroundStyle(Color.sp.ink)
        }
        .frame(width: 26, height: 26)
    }

    // MARK: - Deadline

    private func deadlineBadge(_ date: Date) -> some View {
        let interval = date.timeIntervalSince(Date())
        let (text, color) = deadlineInfo(interval: interval)

        return Text(text)
            .font(.system(size: 11, weight: .semibold, design: .rounded))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.1))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }

    private func deadlineInfo(interval: TimeInterval) -> (String, Color) {
        if interval < 0 {
            return ("Closed", Color.sp.red)
        }
        let days = Int(interval / 86400)
        let hours = Int(interval / 3600) % 24
        if days == 0 && hours == 0 {
            let minutes = max(1, Int(interval / 60))
            return ("\(minutes)m left", Color.sp.red)
        } else if days == 0 {
            return ("\(hours)h left", Color.sp.red)
        } else if days <= 3 {
            return ("\(days)d \(hours)h left", Color.sp.red)
        } else if days <= 7 {
            return ("\(days)d left", Color.sp.amber)
        } else {
            return ("\(days)d left", Color.sp.slate)
        }
    }

    // MARK: - Status

    private var statusText: String {
        if data.pool.status == "completed" {
            return "Pool completed"
        } else if data.pool.status == "archived" {
            return "Pool archived"
        } else {
            return "Entries submitted"
        }
    }
}
