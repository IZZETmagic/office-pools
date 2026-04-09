import Foundation
import Supabase
import Auth

/// View model for the Profile page — fetches pool memberships, leaderboard stats,
/// and handles profile editing, password change, and account deletion.
@MainActor
@Observable
final class ProfileViewModel {
    private let supabase = SupabaseService.shared.client
    private let poolService = PoolService()
    private let apiService = APIService()

    // MARK: - Data

    var poolStats: [PoolStat] = []
    var isLoading = true
    var error: String?

    // Aggregated stats (memoized)
    var totalPoints: Int = 0
    var totalPredictions: Int = 0

    // Profile editing
    var isEditingProfile = false
    var editUsername = ""
    var editFullName = ""
    var editEmail = ""
    var profileSaving = false
    var profileError: String?
    var usernameStatus: UsernameStatus = .idle

    // Password
    var showPasswordSheet = false
    var newPassword = ""
    var confirmPassword = ""
    var passwordLoading = false
    var passwordError: String?
    var passwordSuccess = false

    // Appearance
    // Stored externally via @AppStorage in the view; VM just exposes the options.

    // Email notifications
    var notificationPrefs: [String: Bool] = [
        "POOL_ACTIVITY": true,
        "PREDICTIONS": true,
        "MATCH_RESULTS": true,
        "LEADERBOARD": true,
        "ADMIN": true,
        "COMMUNITY": true,
    ]
    var notifLoading = true
    var notifUpdating: String?

    static let notifOptions: [(key: String, label: String, desc: String)] = [
        ("POOL_ACTIVITY", "Pool Activity", "Join/leave pool, invitations"),
        ("PREDICTIONS", "Predictions", "Deadline reminders, confirmations"),
        ("MATCH_RESULTS", "Match Results", "Results and points earned"),
        ("LEADERBOARD", "Leaderboard Updates", "Rank changes, weekly standings"),
        ("ADMIN", "Admin Notifications", "Settings changed, member removed"),
        ("COMMUNITY", "Community & Mentions", "@mentions in pool chat"),
    ]

    // Delete account
    var showDeleteConfirmation = false
    var deleteConfirmText = ""
    var deleteLoading = false
    var deleteError: String?

    enum UsernameStatus {
        case idle, checking, available, taken
    }

    // MARK: - Pool stat model

    struct PoolStat: Identifiable {
        let poolId: String
        let poolName: String
        let rank: Int?
        let memberCount: Int
        let totalPoints: Int
        let predictionCount: Int
        let hitRate: Double?
        let exactCount: Int?
        let totalCompleted: Int?

        var id: String { poolId }

        var accuracy: Int? {
            guard let rate = hitRate else { return nil }
            return Int(rate * 100)
        }
    }

    // MARK: - Load Data

    /// Derive profile stats from pre-loaded AppDataStore pool cards — zero API calls.
    func loadFromStore(_ dataStore: AppDataStore) {
        isLoading = true
        error = nil

        poolStats = dataStore.poolCards.map { card in
            PoolStat(
                poolId: card.pool.poolId,
                poolName: card.pool.poolName,
                rank: card.userRank,
                memberCount: card.totalEntries,
                totalPoints: card.totalPoints,
                predictionCount: card.totalCompleted ?? card.predictionsCompleted,
                hitRate: card.hitRate,
                exactCount: card.exactCount,
                totalCompleted: card.totalCompleted
            )
        }

        totalPoints = poolStats.reduce(0) { $0 + $1.totalPoints }
        totalPredictions = poolStats.reduce(0) { $0 + $1.predictionCount }

        isLoading = false
    }

    // MARK: - Profile Editing

    func startEditing(user: AppUser) {
        editUsername = user.username
        editFullName = user.fullName
        editEmail = user.email
        profileError = nil
        usernameStatus = .idle
        isEditingProfile = true
    }

    func cancelEditing(user: AppUser) {
        editUsername = user.username
        editFullName = user.fullName
        editEmail = user.email
        profileError = nil
        usernameStatus = .idle
        isEditingProfile = false
    }

    func checkUsername(current: String) async {
        let trimmed = editUsername.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed != current, trimmed.count >= 3 else {
            usernameStatus = .idle
            return
        }
        usernameStatus = .checking

        do {
            let existing: [AppUser] = try await supabase
                .from("users")
                .select()
                .eq("username", value: trimmed)
                .execute()
                .value
            usernameStatus = existing.isEmpty ? .available : .taken
        } catch {
            usernameStatus = .idle
        }
    }

    func saveProfile(userId: String) async -> Bool {
        profileError = nil
        let username = editUsername.trimmingCharacters(in: .whitespacesAndNewlines)

        guard username.count >= 3, username.count <= 20 else {
            profileError = "Username must be 3-20 characters."
            return false
        }
        guard username.range(of: "^[a-zA-Z0-9_]+$", options: .regularExpression) != nil else {
            profileError = "Username can only contain letters, numbers, and underscores."
            return false
        }
        if usernameStatus == .taken {
            profileError = "That username is already taken."
            return false
        }

        profileSaving = true
        do {
            struct ProfileUpdate: Codable {
                let username: String
                let fullName: String?
                enum CodingKeys: String, CodingKey {
                    case username
                    case fullName = "full_name"
                }
            }

            try await supabase
                .from("users")
                .update(ProfileUpdate(
                    username: username,
                    fullName: editFullName.isEmpty ? nil : editFullName
                ))
                .eq("user_id", value: userId)
                .execute()

            // If email changed, update auth
            if editEmail != "" {
                // Email change requires Supabase auth update
                try await supabase.auth.update(user: UserAttributes(email: editEmail))
            }

            isEditingProfile = false
            profileSaving = false
            return true
        } catch {
            profileError = error.localizedDescription
            profileSaving = false
            return false
        }
    }

    // MARK: - Password Change

    func changePassword() async -> Bool {
        passwordError = nil

        guard newPassword.count >= 8 else {
            passwordError = "Password must be at least 8 characters."
            return false
        }
        guard newPassword == confirmPassword else {
            passwordError = "Passwords do not match."
            return false
        }

        passwordLoading = true
        do {
            try await supabase.auth.update(user: UserAttributes(password: newPassword))
            passwordSuccess = true
            passwordLoading = false
            // Reset after brief delay
            try? await Task.sleep(for: .seconds(1.5))
            newPassword = ""
            confirmPassword = ""
            showPasswordSheet = false
            passwordSuccess = false
            return true
        } catch {
            passwordError = error.localizedDescription
            passwordLoading = false
            return false
        }
    }

    // MARK: - Notification Preferences

    func loadNotificationPrefs() async {
        notifLoading = true
        do {
            let response: NotifPrefsResponse = try await apiService.fetchNotificationPrefs()
            notificationPrefs = response.preferences
        } catch {
            // Silently fall back to defaults
        }
        notifLoading = false
    }

    func toggleNotification(key: String) async {
        let newValue = !(notificationPrefs[key] ?? true)
        notifUpdating = key
        // Optimistic update
        notificationPrefs[key] = newValue
        do {
            try await apiService.updateNotificationPref(topicKey: key, enabled: newValue)
        } catch {
            // Revert on failure
            notificationPrefs[key] = !newValue
        }
        notifUpdating = nil
    }

    private struct NotifPrefsResponse: Decodable {
        let preferences: [String: Bool]
    }

    // MARK: - Delete Account

    func deleteAccount() async -> Bool {
        deleteLoading = true
        deleteError = nil

        do {
            guard let session = try? await supabase.auth.session else {
                deleteError = "Not authenticated."
                deleteLoading = false
                return false
            }

            guard let url = URL(string: "\(Config.apiBaseURL)/api/account/delete") else {
                deleteError = "Invalid URL."
                deleteLoading = false
                return false
            }

            var request = URLRequest(url: url)
            request.httpMethod = "DELETE"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  (200...299).contains(httpResponse.statusCode) else {
                let body = String(data: data, encoding: .utf8) ?? "Unknown error"
                deleteError = "Failed to delete account: \(body)"
                deleteLoading = false
                return false
            }

            deleteLoading = false
            return true
        } catch {
            deleteError = error.localizedDescription
            deleteLoading = false
            return false
        }
    }
}
