import Foundation

/// Centralized deep-link router for push notifications and external URLs.
/// PushNotificationService writes a pending destination; MainTabView observes and navigates.
@MainActor
@Observable
final class NavigationRouter {
    static let shared = NavigationRouter()

    /// A pending deep link waiting to be consumed by the UI.
    var pendingDeepLink: DeepLink?

    private init() {}

    /// Set a deep link destination (called from notification tap handler).
    func navigate(to link: DeepLink) {
        pendingDeepLink = link
    }

    /// Consume the pending deep link (called by the view that handles navigation).
    func consumeDeepLink() -> DeepLink? {
        let link = pendingDeepLink
        pendingDeepLink = nil
        return link
    }
}

/// Describes a navigation destination for deep linking.
enum DeepLink: Equatable {
    /// Navigate to a specific pool and optionally a specific tab.
    case pool(poolId: String, tab: PoolTab?)
    /// Navigate to the activity/notifications tab.
    case activity
}
