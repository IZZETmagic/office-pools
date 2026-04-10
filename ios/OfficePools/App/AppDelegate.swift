import UIKit
import UserNotifications

/// Handles push notification lifecycle events.
/// Wired into SwiftUI via @UIApplicationDelegateAdaptor in OfficePoolsApp.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    // MARK: - Token Registration

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        print("[Push] Registered device token: \(token.prefix(16))...")
        Task { @MainActor in
            await PushNotificationService.shared.didRegisterToken(token)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("[Push] Failed to register: \(error.localizedDescription)")
    }

    // MARK: - Foreground Notifications

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        // Show banner + sound even when app is in foreground
        return [.banner, .sound, .badge]
    }

    // MARK: - Notification Tap Handling

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        // Extract values on this isolation context to avoid sending [AnyHashable: Any] across boundaries
        let userInfo = response.notification.request.content.userInfo
        let type = userInfo["type"] as? String
        let poolId = userInfo["pool_id"] as? String
        await MainActor.run {
            PushNotificationService.shared.handleNotificationTap(type: type, poolId: poolId)
        }
    }
}
