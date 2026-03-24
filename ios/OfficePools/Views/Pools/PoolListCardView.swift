import SwiftUI

/// Full-width rich pool card for the Pools tab listing.
struct PoolListCardView: View {
    let data: PoolCardData

    var body: some View {
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
                        .background(Color.red, in: Capsule())
                }
            }

            // Row 2: Badges — admin, mode, status, member count
            HStack(spacing: 6) {
                if data.isAdmin {
                    badgePill("Admin", color: .purple)
                }

                badgePill(modeName, color: .blue)
                badgePill(data.pool.status.capitalized, color: statusColor)

                Spacer()

                Label("\(data.memberCount)", systemImage: "person.2.fill")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            // Row 3: Stats grid
            HStack(spacing: 16) {
                // Left-aligned stats
                statColumnFixed(title: "Points", value: "\(data.totalPoints)", color: .blue)

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

                // Right-aligned form dots
                VStack(spacing: 4) {
                    Text("Form")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    HStack(spacing: 4) {
                        if data.formResults.isEmpty {
                            ForEach(0..<5, id: \.self) { _ in
                                Circle()
                                    .fill(Color(.systemGray4))
                                    .frame(width: 8, height: 8)
                            }
                        } else {
                            ForEach(Array(data.formResults.enumerated()), id: \.offset) { _, result in
                                Circle()
                                    .fill(formColor(for: result))
                                    .frame(width: 8, height: 8)
                            }
                        }
                    }
                }
            }
            .padding(12)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 8))

            // Row 4: Status text + deadline
            HStack {
                Text(statusText)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()

                if let deadline = data.deadline {
                    deadlineBadge(deadline)
                }
            }
        }
        .padding(.top, 16)
        .padding(.bottom, 16)
        .padding(.trailing, 16)
        .padding(.leading, data.needsPredictions ? 20 : 16)
        .background {
            ZStack(alignment: .leading) {
                // Orange behind (only visible as left border)
                if data.needsPredictions {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.orange)
                }
                // White card on top, inset from left
                RoundedRectangle(cornerRadius: data.needsPredictions ? 8 : 12)
                    .fill(Color(.systemBackground))
                    .padding(.leading, data.needsPredictions ? 4 : 0)
            }
        }
        .contentShape(RoundedRectangle(cornerRadius: 12))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
        .compositingGroup()
    }

    // MARK: - Subviews

    private func statColumn(title: String, value: String, color: Color = .primary) -> some View {
        VStack(spacing: 4) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline.bold().monospacedDigit())
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity)
    }

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
        case "active", "open": return .green
        case "completed": return .blue
        case "archived": return .secondary
        case "closed": return .orange
        default: return .secondary
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
            return ("Closed", .red)
        }

        let days = Int(interval / 86400)
        let hours = Int(interval / 3600) % 24

        if days == 0 && hours == 0 {
            let minutes = max(1, Int(interval / 60))
            return ("\(minutes)m left", .red)
        } else if days == 0 {
            return ("\(hours)h left", .red)
        } else if days <= 3 {
            return ("\(days)d \(hours)h left", .red)
        } else if days <= 7 {
            return ("\(days)d left", .orange)
        } else {
            return ("\(days)d left", .secondary)
        }
    }

    private func formColor(for result: FormResult) -> Color {
        switch result {
        case .exact: return Color(red: 0.85, green: 0.65, blue: 0.13) // gold
        case .winnerGd: return .green
        case .winner: return .blue
        case .miss: return .red
        case .placeholder: return Color(.systemGray4)
        }
    }
}
