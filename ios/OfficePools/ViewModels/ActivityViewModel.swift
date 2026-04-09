import Foundation

/// View model for the Activity tab — loads computed activity from pool membership data.
@MainActor
@Observable
final class ActivityViewModel {

    // MARK: - State

    var activities: [ActivityItem] = []
    var isLoading = false
    var errorMessage: String?

    // MARK: - Dependencies

    private let activityService = ActivityService()

    // MARK: - Load

    /// Fetch computed activity items from pool membership and entry data.
    func load(userId: String) async {
        isLoading = true
        errorMessage = nil

        do {
            activities = try await activityService.fetchActivity(userId: userId)
        } catch {
            errorMessage = error.localizedDescription
            print("[Activity] Failed to load: \(error)")
        }

        isLoading = false
    }
}
