import SwiftUI

/// Root tab bar navigation — the main app shell after login.
struct MainTabView: View {
    let authService: AuthService

    @State private var selectedTab: AppTab = .home

    var body: some View {
        TabView(selection: $selectedTab) {
            Tab("Home", systemImage: "house.fill", value: .home) {
                HomeView(authService: authService)
            }

            Tab("Pools", systemImage: "trophy.fill", value: .pools) {
                PoolsView(authService: authService)
            }

            Tab("Results", systemImage: "sportscourt.fill", value: .results) {
                ResultsContainerView(authService: authService)
            }

            Tab("Activity", systemImage: "bell.fill", value: .activity) {
                ActivityView(authService: authService)
            }
        }
    }
}

enum AppTab: String, Hashable {
    case home
    case pools
    case results
    case activity
}
