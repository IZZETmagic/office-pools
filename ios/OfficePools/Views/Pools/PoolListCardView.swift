import SwiftUI

/// Full-width rich pool card for the Pools tab listing.
struct PoolListCardView: View {
    let data: PoolCardData

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Gradient accent strip across the top
            modeGradient
                .frame(height: 4)

            VStack(alignment: .leading, spacing: 12) {
                // Row 1: Pool name + unread banter badge
                HStack {
                    Text(data.pool.poolName)
                        .font(.headline)
                        .lineLimit(1)
                        .foregroundStyle(.primary)

                    Spacer()

                    if data.unreadBanterCount > 0 {
                        Text("\(data.unreadBanterCount)")
                            .font(.caption2.bold())
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(AppColors.error500, in: Capsule())
                    }
                }

                // Badges — admin, mode, status, member count
                HStack(spacing: 6) {
                    if data.isAdmin {
                        badgePill("Admin", color: AppColors.neutral600)
                    }

                    badgePill(modeName, color: modePrimaryColor)
                    badgePill(data.pool.status.capitalized, color: statusColor)

                    Spacer()

                    Label("\(data.memberCount)", systemImage: "person.2.fill")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                // Row 2: Stats grid with tinted background
                HStack(spacing: 16) {
                    statColumnFixed(title: "Points", value: "\(data.totalPoints)", color: AppColors.primary500)

                    statDivider

                    statColumnFixed(title: "Rank", value: data.userRank != nil ? "#\(data.userRank!)" : "--")

                    statDivider

                    VStack(spacing: 4) {
                        Text("Level")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text("Lv.\(data.levelNumber)")
                            .font(.subheadline.bold().monospacedDigit())
                        Text(data.levelName)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }

                    Spacer()

                    // Form sparkline bars
                    formSparkline
                }
                .padding(12)
                .background(modeBackgroundTint)
                .clipShape(RoundedRectangle(cornerRadius: 8))

                // Row 3: Status text + deadline
                HStack {
                    if data.needsPredictions {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(AppColors.warning500)
                                .frame(width: 8, height: 8)
                                .modifier(PulseEffect())
                            Text(statusText)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(AppColors.warning500)
                        }
                    } else {
                        Text(statusText)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    if let deadline = data.deadline {
                        deadlineBadge(deadline)
                    }
                }
            }
            .padding(.top, 14)
            .padding(.bottom, 16)
            .padding(.horizontal, 16)
        }
        .background(Color(.systemBackground))
        .contentShape(RoundedRectangle(cornerRadius: 12))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.06), radius: 6, y: 3)
        .compositingGroup()
    }

    // MARK: - Gradient Accent Strip

    private var modeGradient: some View {
        let colors: [Color] = {
            switch data.pool.predictionMode {
            case .fullTournament:
                return [AppColors.primary600, AppColors.primary800]
            case .progressive:
                return [AppColors.warning500, AppColors.warning700]
            case .bracketPicker:
                return [AppColors.success500, AppColors.success700]
            }
        }()
        return LinearGradient(colors: colors, startPoint: .leading, endPoint: .trailing)
    }

    /// Subtle background tint for the stats row that matches the mode gradient.
    private var modeBackgroundTint: some View {
        let color: Color = {
            switch data.pool.predictionMode {
            case .fullTournament: return AppColors.primary500
            case .progressive: return AppColors.warning500
            case .bracketPicker: return AppColors.success500
            }
        }()
        return RoundedRectangle(cornerRadius: 8)
            .fill(color.opacity(0.06))
    }

    private var modePrimaryColor: Color {
        switch data.pool.predictionMode {
        case .fullTournament: return AppColors.primary700
        case .progressive: return AppColors.warning600
        case .bracketPicker: return AppColors.success600
        }
    }

    // MARK: - Form Sparkline

    private var formSparkline: some View {
        VStack(spacing: 4) {
            Text("Form")
                .font(.caption2)
                .foregroundStyle(.secondary)
            HStack(alignment: .bottom, spacing: 3) {
                if data.formResults.isEmpty {
                    ForEach(0..<5, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 1.5)
                            .fill(Color(.systemGray4))
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
    }

    /// Bar height based on prediction accuracy — exact is tallest, miss is shortest.
    private func formBarHeight(for result: FormResult) -> CGFloat {
        switch result {
        case .exact:       return 22
        case .winnerGd:    return 16
        case .winner:      return 11
        case .miss:        return 6
        case .placeholder: return 6
        }
    }

    // MARK: - Subviews

    private func statColumnFixed(title: String, value: String, color: Color = .primary) -> some View {
        VStack(spacing: 4) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline.bold().monospacedDigit())
                .foregroundStyle(color)
        }
    }

    private var statDivider: some View {
        Rectangle()
            .fill(Color(.separator))
            .frame(width: 0.5, height: 30)
    }

    private func badgePill(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption2.weight(.medium))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.12))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }

    private func deadlineBadge(_ date: Date) -> some View {
        let now = Date()
        let interval = date.timeIntervalSince(now)
        let (text, color) = deadlineInfo(interval: interval)

        return Text(text)
            .font(.caption2.weight(.medium))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.12))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }

    // MARK: - Helpers

    private var modeName: String {
        switch data.pool.predictionMode {
        case .fullTournament: return "Full Tournament"
        case .progressive: return "Progressive"
        case .bracketPicker: return "Bracket Picker"
        }
    }

    private var statusColor: Color {
        switch data.pool.status {
        case "active", "open": return AppColors.success600
        case "completed": return AppColors.primary700
        case "archived": return AppColors.neutral500
        case "closed": return AppColors.warning600
        default: return AppColors.neutral500
        }
    }

    private var statusText: String {
        if data.needsPredictions {
            return "Predictions needed"
        } else if data.pool.status == "completed" {
            return "Pool completed"
        } else if data.pool.status == "archived" {
            return "Pool archived"
        } else {
            return "Entries submitted"
        }
    }

    private func deadlineInfo(interval: TimeInterval) -> (String, Color) {
        if interval < 0 {
            return ("Closed", AppColors.error600)
        }

        let days = Int(interval / 86400)
        let hours = Int(interval / 3600) % 24

        if days == 0 && hours == 0 {
            let minutes = max(1, Int(interval / 60))
            return ("\(minutes)m left", AppColors.error600)
        } else if days == 0 {
            return ("\(hours)h left", AppColors.error600)
        } else if days <= 3 {
            return ("\(days)d \(hours)h left", AppColors.error600)
        } else if days <= 7 {
            return ("\(days)d left", AppColors.warning600)
        } else {
            return ("\(days)d left", AppColors.neutral500)
        }
    }

    private func formColor(for result: FormResult) -> Color {
        switch result {
        case .exact: return AppColors.tierExact
        case .winnerGd: return AppColors.tierWinnerGd
        case .winner: return AppColors.tierWinner
        case .miss: return AppColors.error500
        case .placeholder: return AppColors.neutral300
        }
    }
}

// MARK: - Pulse Animation

private struct PulseEffect: ViewModifier {
    @State private var isPulsing = false

    func body(content: Content) -> some View {
        content
            .opacity(isPulsing ? 0.3 : 1.0)
            .animation(
                .easeInOut(duration: 1.0).repeatForever(autoreverses: true),
                value: isPulsing
            )
            .onAppear { isPulsing = true }
    }
}
