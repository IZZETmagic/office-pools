import SwiftUI

/// A single activity feed card with type-specific icon, color, and layout — SP design system.
struct ActivityCardView: View {
    let item: ActivityItem

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Unread indicator
            Circle()
                .fill(item.isRead ? Color.clear : Color.sp.primary)
                .frame(width: 8, height: 8)
                .padding(.top, 10)

            // Icon circle
            iconCircle

            // Content
            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .top) {
                    Text(item.title)
                        .font(.system(size: 14, weight: item.isRead ? .medium : .semibold, design: .rounded))
                        .foregroundStyle(Color.sp.ink)
                        .lineLimit(2)

                    Spacer(minLength: 4)

                    Text(relativeTime)
                        .font(.system(size: 10, weight: .medium, design: .rounded))
                        .foregroundStyle(Color.sp.slate)
                }

                if let body = item.body, !body.isEmpty {
                    Text(body)
                        .font(.system(size: 12, weight: .regular, design: .rounded))
                        .foregroundStyle(Color.sp.slate)
                        .lineLimit(2)
                }

                // Type-specific detail row
                detailRow

                // Pool name chip
                if let poolName = item.poolName {
                    poolChip(poolName)
                }
            }
        }
        .padding(14)
        .background(Color.sp.surface)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
    }

    // MARK: - Icon Circle

    private var iconCircle: some View {
        ZStack {
            Circle()
                .fill(iconBackgroundColor)
                .frame(width: 38, height: 38)

            if iconIsEmoji {
                Text(resolvedIcon)
                    .font(.system(size: 16))
            } else {
                Image(systemName: resolvedIcon)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(iconForegroundColor)
            }
        }
    }

    // MARK: - Detail Row (type-specific extras)

    @ViewBuilder
    private var detailRow: some View {
        switch item.parsedMetadata {
        case .rankChange(let meta):
            rankChangeDetail(meta)
        case .predictionResult(let meta):
            predictionResultDetail(meta)
        case .streakMilestone(let meta):
            streakDetail(meta)
        case .badgeEarned(let meta):
            badgeDetail(meta)
        case .levelUp(let meta):
            levelUpDetail(meta)
        case .matchdayMvp(let meta):
            mvpDetail(meta)
        case .predictionSubmitted(let meta):
            predictionSubmittedDetail(meta)
        default:
            EmptyView()
        }
    }

    // MARK: - Rank Change Detail

    private func rankChangeDetail(_ meta: RankChangeMeta) -> some View {
        HStack(spacing: 6) {
            if meta.delta > 0 {
                Image(systemName: "arrow.up")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Color.sp.green)
                Text("\(meta.delta) position\(meta.delta == 1 ? "" : "s")")
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.sp.green)
            } else if meta.delta < 0 {
                Image(systemName: "arrow.down")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Color.sp.red)
                Text("\(abs(meta.delta)) position\(abs(meta.delta) == 1 ? "" : "s")")
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.sp.red)
            }

            Text("#\(meta.oldRank)")
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .foregroundStyle(Color.sp.slate)
                .strikethrough()

            Image(systemName: "arrow.right")
                .font(.system(size: 8))
                .foregroundStyle(Color.sp.mist)

            Text("#\(meta.newRank)")
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundStyle(Color.sp.ink)
        }
    }

    // MARK: - Prediction Result Detail

    private func predictionResultDetail(_ meta: PredictionResultMeta) -> some View {
        HStack(spacing: 6) {
            Text("\(meta.homeTeam) \(meta.score) \(meta.awayTeam)")
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundStyle(Color.sp.ink)

            outcomeChip(meta.outcome)
        }
    }

    // MARK: - Streak Detail

    private func streakDetail(_ meta: StreakMilestoneMeta) -> some View {
        HStack(spacing: 4) {
            ForEach(0..<meta.streakLength, id: \.self) { _ in
                Image(systemName: meta.streakType == "hot" ? "flame.fill" : "snowflake")
                    .font(.system(size: 10))
                    .foregroundStyle(meta.streakType == "hot" ? Color.sp.amber : Color.sp.primary)
            }
        }
    }

    // MARK: - Badge Detail

    private func badgeDetail(_ meta: BadgeEarnedMeta) -> some View {
        HStack(spacing: 6) {
            Text(meta.badgeEmoji)
                .font(.system(size: 12))
            Text(meta.badgeName)
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundStyle(Color.sp.ink)
            Text(meta.rarity)
                .font(.system(size: 10, weight: .bold, design: .rounded))
                .foregroundStyle(rarityColor(meta.rarity))
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(rarityColor(meta.rarity).opacity(0.12), in: Capsule())
        }
    }

    // MARK: - Level Up Detail

    private func levelUpDetail(_ meta: LevelUpMeta) -> some View {
        HStack(spacing: 6) {
            Text("Level \(meta.newLevel)")
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .foregroundStyle(levelColor(meta.newLevel))
            Text(meta.levelName)
                .font(.system(size: 12, weight: .medium, design: .rounded))
                .foregroundStyle(Color.sp.slate)
        }
    }

    // MARK: - Prediction Submitted Detail

    private func predictionSubmittedDetail(_ meta: PredictionSubmittedMeta) -> some View {
        HStack(spacing: 6) {
            if let entryName = meta.entryName {
                Text(entryName)
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(Color.sp.ink)
            }
            if let count = meta.matchCount {
                Text("\(count) matches")
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.sp.slate)
            }
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 12))
                .foregroundStyle(Color.sp.green)
        }
    }

    // MARK: - MVP Detail

    private func mvpDetail(_ meta: MatchdayMvpMeta) -> some View {
        HStack(spacing: 4) {
            Text("\(meta.matchPoints) pts")
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .foregroundStyle(Color.sp.accent)
            Text("Match \(meta.matchNumber)")
                .font(.system(size: 12, weight: .medium, design: .rounded))
                .foregroundStyle(Color.sp.slate)
        }
    }

    // MARK: - Outcome Chip

    private func outcomeChip(_ outcome: String) -> some View {
        let (label, color): (String, Color) = switch outcome {
        case "exact":     ("Exact", Color.sp.accent)
        case "winner_gd": ("Winner + GD", Color.sp.green)
        case "winner":    ("Winner", Color.sp.primary)
        default:          ("Miss", Color.sp.slate)
        }

        return Text(label)
            .font(.system(size: 10, weight: .bold, design: .rounded))
            .foregroundStyle(color)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(color.opacity(0.12), in: Capsule())
    }

    // MARK: - Pool Chip

    private func poolChip(_ name: String) -> some View {
        Text(name)
            .font(.system(size: 10, weight: .semibold, design: .rounded))
            .foregroundStyle(Color.sp.slate)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Color.sp.snow, in: Capsule())
    }

    // MARK: - Icon Resolution

    /// Resolved SF Symbol or emoji based on activity type and metadata context.
    private var resolvedIcon: String {
        switch item.activityType {
        case .mention:
            return "at.circle.fill"
        case .rankChange:
            if let meta = item.parsedMetadata, case .rankChange(let m) = meta {
                return m.delta > 0 ? "arrow.up.circle.fill" : "arrow.down.circle.fill"
            }
            return "arrow.up.arrow.down.circle.fill"
        case .deadlineAlert:
            return "clock.badge.exclamationmark.fill"
        case .poolJoined:
            return "person.badge.plus"
        case .levelUp:
            return "star.circle.fill"
        case .streakMilestone:
            if let meta = item.parsedMetadata, case .streakMilestone(let m) = meta {
                return m.streakType == "hot" ? "flame.fill" : "snowflake"
            }
            return "flame.fill"
        case .badgeEarned:
            if let meta = item.parsedMetadata, case .badgeEarned(let m) = meta {
                return m.badgeEmoji
            }
            return "trophy.circle.fill"
        case .predictionResult:
            if let meta = item.parsedMetadata, case .predictionResult(let m) = meta {
                return m.outcome == "miss" ? "xmark.circle.fill" : "checkmark.circle.fill"
            }
            return "checkmark.circle.fill"
        case .matchdayMvp:
            return "crown.fill"
        case .predictionSubmitted:
            return "paperplane.circle.fill"
        case .welcome:
            return "hand.wave.fill"
        }
    }

    /// Whether the resolved icon is an emoji (not an SF Symbol).
    private var iconIsEmoji: Bool {
        let icon = resolvedIcon
        return !icon.contains(".") && icon.unicodeScalars.first.map { $0.value > 0xFF } ?? false
    }

    // MARK: - Color Resolution

    private var resolvedColorKey: String {
        switch item.activityType {
        case .mention:     return "primary"
        case .rankChange:
            if let meta = item.parsedMetadata, case .rankChange(let m) = meta {
                return m.delta > 0 ? "success" : "error"
            }
            return "primary"
        case .deadlineAlert:    return "warning"
        case .poolJoined:       return "primary"
        case .levelUp:          return "accent"
        case .streakMilestone:
            if let meta = item.parsedMetadata, case .streakMilestone(let m) = meta {
                return m.streakType == "hot" ? "warning" : "primary"
            }
            return "warning"
        case .badgeEarned:      return "accent"
        case .predictionResult:
            if let meta = item.parsedMetadata, case .predictionResult(let m) = meta {
                switch m.outcome {
                case "exact": return "accent"
                case "miss":  return "error"
                default:      return "success"
                }
            }
            return "success"
        case .matchdayMvp:          return "accent"
        case .predictionSubmitted:  return "success"
        case .welcome:              return "primary"
        }
    }

    private var iconBackgroundColor: Color {
        switch resolvedColorKey {
        case "primary": return Color.sp.primaryLight
        case "success": return Color.sp.greenLight
        case "warning": return Color.sp.amberLight
        case "error":   return Color.sp.redLight
        case "accent":  return Color.sp.accentLight
        default:        return Color.sp.mist
        }
    }

    private var iconForegroundColor: Color {
        switch resolvedColorKey {
        case "primary": return Color.sp.primary
        case "success": return Color.sp.green
        case "warning": return Color.sp.amber
        case "error":   return Color.sp.red
        case "accent":  return Color.sp.accent
        default:        return Color.sp.slate
        }
    }

    // MARK: - Semantic Color Helpers

    private func rarityColor(_ rarity: String) -> Color {
        switch rarity {
        case "Common":    return Color.sp.slate
        case "Uncommon":  return Color.sp.green
        case "Rare":      return Color.sp.primary
        case "Very Rare": return Color(hex: 0x6D28D9) // purple
        case "Legendary": return Color.sp.accent
        default:          return Color.sp.slate
        }
    }

    private func levelColor(_ level: Int) -> Color {
        switch level {
        case 10:    return Color.sp.accent
        case 8...9: return Color.sp.amber
        case 6...7: return Color.sp.primary
        case 4...5: return Color(hex: 0x60A5FA) // lighter blue
        default:    return Color.sp.green
        }
    }

    // MARK: - Relative Time

    private var relativeTime: String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        guard let date = formatter.date(from: item.createdAt) else {
            formatter.formatOptions = [.withInternetDateTime]
            guard let date = formatter.date(from: item.createdAt) else { return "" }
            return relativeString(from: date)
        }
        return relativeString(from: date)
    }

    private func relativeString(from date: Date) -> String {
        let now = Date()
        let interval = now.timeIntervalSince(date)

        if interval < 60 { return "just now" }
        if interval < 3600 { return "\(Int(interval / 60))m ago" }
        if interval < 86400 { return "\(Int(interval / 3600))h ago" }
        if interval < 604800 { return "\(Int(interval / 86400))d ago" }

        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "MMM d"
        return dateFormatter.string(from: date)
    }
}
