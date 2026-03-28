import SwiftUI
import Supabase

struct BadgePickerSheet: View {
    let analyticsData: AnalyticsResponse?
    let onSelect: (String, MessageType, [String: AnyJSON]?) -> Void
    @Environment(\.dismiss) private var dismiss

    private var earnedBadges: [BadgeInfo] {
        analyticsData?.xp.earnedBadges ?? []
    }

    private var level: Int {
        analyticsData?.xp.currentLevel.level ?? 0
    }

    private var levelName: String {
        analyticsData?.xp.currentLevel.name ?? "Unknown"
    }

    // Sort by rarity: legendary > epic > rare > common
    private var sortedBadges: [BadgeInfo] {
        earnedBadges.sorted { rarityOrder($0.rarity) < rarityOrder($1.rarity) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if earnedBadges.isEmpty {
                    ContentUnavailableView(
                        "No Badges Yet",
                        systemImage: "trophy",
                        description: Text("Keep playing to earn badges!")
                    )
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            // Flex All option
                            Button {
                                let badgeCount = earnedBadges.count
                                let plural = badgeCount != 1 ? "s" : ""
                                let content = "Flexing my badges — Level \(level) \(levelName) with \(badgeCount) badge\(plural)!"

                                let badgeItems: [AnyJSON] = sortedBadges.map { badge in
                                    .object([
                                        "id": .string(badge.id),
                                        "emoji": .string(badgeEmoji(badge.id)),
                                        "name": .string(badge.name),
                                        "tier": .string(badge.rarity),
                                        "rarity": .string(badge.rarity),
                                        "xpBonus": .integer(badge.xpBonus)
                                    ])
                                }

                                let metadata: [String: AnyJSON] = [
                                    "badges": .array(badgeItems),
                                    "level": .integer(level),
                                    "level_name": .string(levelName),
                                    "total_xp": .integer(analyticsData?.xp.totalXp ?? 0)
                                ]

                                onSelect(content, .badgeFlex, metadata)
                                dismiss()
                            } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: "trophy.fill")
                                        .font(.title3)
                                        .foregroundStyle(.purple)
                                        .frame(width: 40, height: 40)
                                        .background(Color.purple.opacity(0.1))
                                        .clipShape(RoundedRectangle(cornerRadius: 10))

                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("Flex All Badges")
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(.primary)
                                        Text("Level \(level) \(levelName) · \(earnedBadges.count) badges")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }

                                    Spacer()

                                    Image(systemName: "chevron.right")
                                        .font(.caption)
                                        .foregroundStyle(.tertiary)
                                }
                                .padding(14)
                                .background(Color(.systemBackground))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
                            }
                            .buttonStyle(.plain)

                            // Divider label
                            HStack {
                                Text("Or flex a specific badge")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Spacer()
                            }
                            .padding(.horizontal, 4)
                            .padding(.top, 4)

                            // Individual badges
                            ForEach(sortedBadges) { badge in
                                Button {
                                    selectBadge(badge)
                                } label: {
                                    badgeRow(badge)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                    }
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Flex Badges")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    // MARK: - Badge Row

    private func badgeRow(_ badge: BadgeInfo) -> some View {
        HStack(spacing: 12) {
            // Badge-specific icon
            Image(systemName: badgeIcon(badge.id))
                .font(.title3)
                .foregroundStyle(rarityColor(badge.rarity))
                .frame(width: 40, height: 40)
                .background(rarityColor(badge.rarity).opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(badge.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)

                    Text(badge.rarity.uppercased())
                        .font(.system(size: 9, weight: .heavy))
                        .foregroundStyle(rarityColor(badge.rarity))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(rarityColor(badge.rarity).opacity(0.12))
                        .clipShape(Capsule())
                }

                Text(badge.condition)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            Spacer()

            Text("+\(badge.xpBonus) XP")
                .font(.caption.weight(.semibold).monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    // MARK: - Actions

    private func selectBadge(_ badge: BadgeInfo) {
        let content = "Flexing \(badge.name) badge — \(badge.rarity)"

        let badgeItem: AnyJSON = .object([
            "id": .string(badge.id),
            "emoji": .string(badgeEmoji(badge.id)),
            "name": .string(badge.name),
            "tier": .string(badge.rarity),
            "rarity": .string(badge.rarity),
            "xpBonus": .integer(badge.xpBonus)
        ])

        let metadata: [String: AnyJSON] = [
            "badges": .array([badgeItem]),
            "level": .integer(level),
            "level_name": .string(levelName),
            "total_xp": .integer(analyticsData?.xp.totalXp ?? 0)
        ]

        onSelect(content, .badgeFlex, metadata)
        dismiss()
    }

    // MARK: - Helpers

    private func rarityOrder(_ rarity: String) -> Int {
        switch rarity.lowercased() {
        case "legendary": return 0
        case "epic": return 1
        case "rare": return 2
        case "common": return 3
        default: return 4
        }
    }

    private func rarityColor(_ rarity: String) -> Color {
        switch rarity {
        case "Common": return .gray
        case "Uncommon": return .green
        case "Rare": return .blue
        case "Very Rare": return .purple
        case "Legendary": return .yellow
        default: return .gray
        }
    }

    private func badgeIcon(_ id: String) -> String {
        switch id {
        case "sharpshooter": return "scope"
        case "oracle": return "eye.fill"
        case "dark_horse": return "hare.fill"
        case "ice_breaker": return "snowflake"
        case "on_fire": return "flame.fill"
        case "top_dog": return "crown.fill"
        case "globe_trotter": return "globe"
        case "lightning_rod": return "bolt.fill"
        case "stadium_regular": return "building.columns.fill"
        case "showtime": return "sparkles"
        case "grand_finale": return "trophy.fill"
        case "legend": return "star.fill"
        default: return "star.fill"
        }
    }

    private func badgeEmoji(_ id: String) -> String {
        switch id {
        case "sharpshooter": return "🎯"
        case "oracle": return "🔮"
        case "dark_horse": return "🐴"
        case "ice_breaker": return "🧊"
        case "on_fire": return "🔥"
        case "top_dog": return "👑"
        case "globe_trotter": return "🌍"
        case "lightning_rod": return "⚡"
        case "stadium_regular": return "🏟️"
        case "showtime": return "🎪"
        case "grand_finale": return "🏆"
        case "legend": return "⭐"
        default: return "🏅"
        }
    }
}
