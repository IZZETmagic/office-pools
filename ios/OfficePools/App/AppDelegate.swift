import UIKit
import UserNotifications

/// Handles push notification lifecycle events.
/// Wired into SwiftUI via @UIApplicationDelegateAdaptor in OfficePoolsApp.
final class AppDelegate: NSObject, UIApplicationDelegate, @unchecked Sendable {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let center = UNUserNotificationCenter.current()
        center.delegate = NotificationDelegate.shared
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
}

// MARK: - Notification Delegate (separate class avoids Sendable issues)

final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    static let shared = NotificationDelegate()

    // Foreground: show banner + sound
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    // Tap handling: use completion handler API instead of async
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        let type = userInfo["type"] as? String
        let poolId = userInfo["pool_id"] as? String

        Task { @MainActor in
            PushNotificationService.shared.handleNotificationTap(type: type, poolId: poolId)
        }

        completionHandler()
    }
}
