import SwiftUI

/// A horizontal-scroll pool card for the Home tab.
struct PoolCardView: View {
    let data: PoolCardData

    private var brandColorValue: Color? {
        guard let hex = data.pool.brandColor else { return nil }
        return Color(hex: UInt(hex.dropFirst(), radix: 16) ?? 0)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Branded accent strip
            if data.pool.hasBranding, let brandColor = brandColorValue {
                HStack(spacing: 4) {
                    Text(data.pool.brandEmoji ?? "")
                        .font(.caption)
                    Text(data.pool.brandName ?? "")
                        .font(.caption2.weight(.bold))
                    Spacer()
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(brandColor)
            }

        VStack(alignment: .leading, spacing: 12) {
            // Pool name + unread badge
            HStack {
                Text(data.pool.poolName)
                    .font(.headline)
                    .lineLimit(1)

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

            // Rank and points
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Rank")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    if let rank = data.userRank {
                        Text("#\(rank) of \(data.totalEntries)")
                            .font(.subheadline.bold().monospacedDigit())
                    } else {
                        Text("--")
                            .font(.subheadline.bold())
                            .foregroundStyle(.secondary)
                    }
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("Points")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text("\(data.totalPoints)")
                        .font(.subheadline.bold().monospacedDigit())
                }

                Spacer()
            }

            // Form dots (last 5 results)
            if !data.formResults.isEmpty {
                HStack(spacing: 4) {
                    Text("Form")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    ForEach(Array(data.formResults.enumerated()), id: \.offset) { _, result in
                        Circle()
                            .fill(formColor(for: result))
                            .frame(width: 8, height: 8)
                    }
                }
            }

            // Deadline or needs predictions
            HStack {
                if data.needsPredictions {
                    Label(
                        data.currentRoundLabel != nil ? "\(data.currentRoundLabel!) needs predictions" : "Needs Predictions",
                        systemImage: "exclamationmark.circle.fill"
                    )
                        .font(.caption2.bold())
                        .foregroundStyle(.orange)
                } else if let deadline = data.deadline {
                    Label(deadlineText(deadline), systemImage: "clock")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(16)

        } // end outer VStack
        .frame(width: 220)
        .background {
            RoundedRectangle(cornerRadius: 16)
                .fill(.background)
                .shadow(color: .black.opacity(0.08), radius: 8, x: 0, y: 2)
        }
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(cardBorderColor, lineWidth: cardBorderWidth)
        }
    }

    private var cardBorderColor: Color {
        if data.pool.hasBranding, let c = brandColorValue { return c }
        return Color(.quaternaryLabel)
    }

    private var cardBorderWidth: CGFloat {
        data.pool.hasBranding ? 1.5 : 1
    }

    // MARK: - Helpers

    private func formColor(for result: FormResult) -> Color {
        switch result {
        case .exact: return Color(red: 0.85, green: 0.65, blue: 0.13) // gold
        case .winnerGd: return .green
        case .winner: return .blue
        case .miss: return .red
        case .placeholder: return Color(.systemGray4)
        }
    }

    private func deadlineText(_ date: Date) -> String {
        let now = Date()
        let interval = date.timeIntervalSince(now)

        if interval < 0 {
            return "Deadline passed"
        } else if interval < 3600 {
            let minutes = Int(interval / 60)
            return "\(minutes)m remaining"
        } else if interval < 86400 {
            let hours = Int(interval / 3600)
            return "\(hours)h remaining"
        } else {
            let days = Int(interval / 86400)
            return "\(days)d remaining"
        }
    }
}

#Preview {
    ScrollView(.horizontal) {
        HStack(spacing: 12) {
            PoolCardView(data: PoolCardData(
                pool: Pool(
                    poolId: "1", poolName: "World Cup 2026 Office Pool",
                    poolCode: "ABC", description: nil, status: "open",
                    isPrivate: false, maxParticipants: nil, maxEntriesPerUser: 1,
                    tournamentId: "t1", predictionDeadline: nil,
                    predictionMode: .fullTournament,
                    createdAt: "", updatedAt: "",
                    brandName: nil, brandEmoji: nil, brandColor: nil, brandAccent: nil
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
                hitRate: 0.65, exactCount: 5, totalCompleted: 72,
                currentRoundLabel: nil
            ))
        }
        .padding()
    }
}
