import Foundation
import Supabase

/// Computes activity feed items from pool membership, entry, and pool data.
/// Mirrors the web dashboard's on-the-fly activity synthesis (app/dashboard/page.tsx).
@MainActor
final class ActivityService {
    private let supabase = SupabaseService.shared.client

    // MARK: - Response Models

    /// Lightweight model for the activity query join.
    private struct ActivityMembership: Codable {
        let poolId: String
        let joinedAt: String
        let pools: ActivityPool
        let entries: [ActivityEntry]

        enum CodingKeys: String, CodingKey {
            case poolId = "pool_id"
            case joinedAt = "joined_at"
            case pools
            case entries = "pool_entries"
        }
    }

    private struct ActivityPool: Codable {
        let poolId: String
        let poolName: String
        let predictionDeadline: String?

        enum CodingKeys: String, CodingKey {
            case poolId = "pool_id"
            case poolName = "pool_name"
            case predictionDeadline = "prediction_deadline"
        }
    }

    private struct ActivityEntry: Codable {
        let entryId: String
        let entryName: String
        let entryNumber: Int
        let hasSubmittedPredictions: Bool
        let predictionsSubmittedAt: String?
        let autoSubmitted: Bool
        let currentRank: Int?
        let previousRank: Int?
        let lastRankUpdate: String?
        let createdAt: String

        enum CodingKeys: String, CodingKey {
            case entryId = "entry_id"
            case entryName = "entry_name"
            case entryNumber = "entry_number"
            case hasSubmittedPredictions = "has_submitted_predictions"
            case predictionsSubmittedAt = "predictions_submitted_at"
            case autoSubmitted = "auto_submitted"
            case currentRank = "current_rank"
            case previousRank = "previous_rank"
            case lastRankUpdate = "last_rank_update"
            case createdAt = "created_at"
        }
    }

    // MARK: - Fetch Activity

    /// Compute activity items from the user's pool memberships, entries, and pool data.
    func fetchActivity(userId: String) async throws -> [ActivityItem] {
        let memberships: [ActivityMembership] = try await supabase
            .from("pool_members")
            .select("""
                pool_id, joined_at,
                pools(pool_id, pool_name, prediction_deadline),
                pool_entries(
                    entry_id, entry_name, entry_number,
                    has_submitted_predictions, predictions_submitted_at,
                    auto_submitted, current_rank, previous_rank,
                    last_rank_update, created_at
                )
            """)
            .eq("user_id", value: userId)
            .execute()
            .value

        var items: [ActivityItem] = []
        let now = Date()
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        for membership in memberships {
            let pool = membership.pools
            let poolName = pool.poolName
            let poolId = pool.poolId

            // 1. JOINED event
            items.append(ActivityItem.synthesized(
                activityType: .poolJoined,
                title: "Joined \(poolName)",
                body: "You're in! Time to make your predictions.",
                icon: "person.badge.plus",
                colorKey: "primary",
                poolId: poolId,
                createdAt: membership.joinedAt,
                metadata: ["pool_name": .string(poolName)]
            ))

            // 2. SUBMITTED / AUTO_SUBMITTED events (per entry)
            for entry in membership.entries {
                if let submittedAt = entry.predictionsSubmittedAt {
                    if entry.autoSubmitted {
                        items.append(ActivityItem.synthesized(
                            activityType: .predictionSubmitted,
                            title: "Predictions auto-submitted",
                            body: "Your draft predictions for \(entry.entryName) were automatically submitted at the deadline.",
                            icon: "paperplane.circle.fill",
                            colorKey: "warning",
                            poolId: poolId,
                            createdAt: submittedAt,
                            metadata: [
                                "pool_name": .string(poolName),
                                "entry_name": .string(entry.entryName),
                            ]
                        ))
                    } else {
                        items.append(ActivityItem.synthesized(
                            activityType: .predictionSubmitted,
                            title: "Predictions submitted",
                            body: "\(entry.entryName) predictions locked in for \(poolName).",
                            icon: "paperplane.circle.fill",
                            colorKey: "success",
                            poolId: poolId,
                            createdAt: submittedAt,
                            metadata: [
                                "pool_name": .string(poolName),
                                "entry_name": .string(entry.entryName),
                            ]
                        ))
                    }
                }
            }

            // 3. ENTRY_CREATED events (only additional entries, not the auto-created first one)
            for entry in membership.entries where entry.entryNumber > 1 {
                items.append(ActivityItem.synthesized(
                    activityType: .poolJoined,
                    title: "New entry created",
                    body: "\(entry.entryName) added to \(poolName).",
                    icon: "plus.circle.fill",
                    colorKey: "primary",
                    poolId: poolId,
                    createdAt: entry.createdAt,
                    metadata: ["pool_name": .string(poolName)]
                ))
            }

            // 4. DEADLINE_PASSED event
            if let deadlineStr = pool.predictionDeadline,
               let deadlineDate = isoFormatter.date(from: deadlineStr),
               deadlineDate < now {
                items.append(ActivityItem.synthesized(
                    activityType: .deadlineAlert,
                    title: "Prediction deadline passed",
                    body: "The prediction window for \(poolName) has closed.",
                    icon: "clock.badge.exclamationmark.fill",
                    colorKey: "warning",
                    poolId: poolId,
                    createdAt: deadlineStr,
                    metadata: [
                        "pool_name": .string(poolName),
                        "deadline": .string(deadlineStr),
                    ]
                ))
            }

            // 5. RANK MOVEMENT events (per entry with rank change)
            for entry in membership.entries {
                if let currentRank = entry.currentRank,
                   let previousRank = entry.previousRank,
                   let rankUpdate = entry.lastRankUpdate,
                   currentRank != previousRank {
                    let delta = previousRank - currentRank // positive = moved up
                    if delta > 0 {
                        items.append(ActivityItem.synthesized(
                            activityType: .rankChange,
                            title: "Moved up to #\(currentRank)",
                            body: "\(entry.entryName) climbed \(delta) spot\(delta == 1 ? "" : "s") in \(poolName).",
                            icon: "arrow.up.circle.fill",
                            colorKey: "success",
                            poolId: poolId,
                            createdAt: rankUpdate,
                            metadata: [
                                "pool_name": .string(poolName),
                                "old_rank": .integer(previousRank),
                                "new_rank": .integer(currentRank),
                                "delta": .integer(delta),
                            ]
                        ))
                    } else {
                        items.append(ActivityItem.synthesized(
                            activityType: .rankChange,
                            title: "Dropped to #\(currentRank)",
                            body: "\(entry.entryName) fell \(abs(delta)) spot\(abs(delta) == 1 ? "" : "s") in \(poolName).",
                            icon: "arrow.down.circle.fill",
                            colorKey: "error",
                            poolId: poolId,
                            createdAt: rankUpdate,
                            metadata: [
                                "pool_name": .string(poolName),
                                "old_rank": .integer(previousRank),
                                "new_rank": .integer(currentRank),
                                "delta": .integer(delta),
                            ]
                        ))
                    }
                }
            }
        }

        // Sort newest first
        items.sort { $0.createdAt > $1.createdAt }

        return items
    }
}
