import Foundation
import UserNotifications
import UIKit

/// Manages push notification permissions, token registration, and deep linking.
@MainActor
@Observable
final class PushNotificationService {
    static let shared = PushNotificationService()

    private let apiService = APIService()

    /// Current push authorization status
    var isAuthorized = false

    /// The current device token (hex string), if registered
    private(set) var deviceToken: String?

    private init() {}

    // MARK: - Permission Request

    /// Request notification permission and register for remote notifications if granted.
    /// Returns true if permission was granted.
    @discardableResult
    func requestPermission() async -> Bool {
        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .badge, .sound])
            isAuthorized = granted
            if granted {
                UIApplication.shared.registerForRemoteNotifications()
            }
            return granted
        } catch {
            print("[Push] Permission request error: \(error)")
            return false
        }
    }

    /// Check current authorization status without prompting.
    func checkAuthorizationStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        isAuthorized = settings.authorizationStatus == .authorized
    }

    // MARK: - Token Management

    /// Called by AppDelegate when APNs registration succeeds.
    func didRegisterToken(_ token: String) async {
        deviceToken = token

        // Determine environment: debug builds use sandbox APNs
        #if DEBUG
        let environment = "development"
        #else
        let environment = "production"
        #endif

        do {
            try await apiService.registerPushToken(token: token, environment: environment)
            print("[Push] Token registered with server")
        } catch {
            print("[Push] Failed to register token with server: \(error)")
        }
    }

    /// Unregister the current device token (call on sign out).
    func unregisterToken() async {
        guard let token = deviceToken else { return }
        do {
            try await apiService.unregisterPushToken(token: token)
            print("[Push] Token unregistered from server")
        } catch {
            print("[Push] Failed to unregister token: \(error)")
        }
        deviceToken = nil
    }

    // MARK: - Notification Tap Handling

    /// Handle deep linking when user taps a notification.
    func handleNotificationTap(type: String?, poolId: String?) {
        guard let type else { return }

        switch type {
        case "community":
            // Navigate to the pool's banter chat
            if let poolId {
                print("[Push] Deep link → pool \(poolId) banter tab")
                NavigationRouter.shared.navigate(to: .pool(poolId: poolId, tab: .banter))
            }
        case "pool_activity", "predictions":
            if let poolId {
                print("[Push] Deep link → pool \(poolId) predictions tab")
                NavigationRouter.shared.navigate(to: .pool(poolId: poolId, tab: .predictions))
            }
        case "match_results":
            if let poolId {
                print("[Push] Deep link → pool \(poolId) leaderboard tab")
                NavigationRouter.shared.navigate(to: .pool(poolId: poolId, tab: .leaderboard))
            }
        case "leaderboard":
            if let poolId {
                print("[Push] Deep link → pool \(poolId) leaderboard tab")
                NavigationRouter.shared.navigate(to: .pool(poolId: poolId, tab: .leaderboard))
            }
        case "admin":
            if let poolId {
                print("[Push] Deep link → pool \(poolId) settings tab")
                NavigationRouter.shared.navigate(to: .pool(poolId: poolId, tab: .settings))
            }
        default:
            print("[Push] Unknown notification type: \(type), poolId: \(poolId ?? "nil")")
            // Default: navigate to pool leaderboard if poolId present
            if let poolId {
                NavigationRouter.shared.navigate(to: .pool(poolId: poolId, tab: nil))
            }
        }
    }
}
