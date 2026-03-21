import SwiftUI

/// Activity tab — shows recent activity, notifications, and updates across all pools.
struct ActivityView: View {
    let authService: AuthService

    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "Coming Soon",
                systemImage: "bell.badge",
                description: Text("Notifications and activity feed will appear here.")
            )
            .navigationTitle("Activity")
        }
    }
}
