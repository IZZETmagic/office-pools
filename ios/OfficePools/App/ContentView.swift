import SwiftUI

/// Root view — shows login or the main tab bar based on auth state.
struct ContentView: View {
    @Bindable var authService: AuthService

    var body: some View {
        Group {
            if authService.isLoading {
                // Splash / loading state while checking session
                VStack(spacing: 16) {
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 56))
                        .foregroundStyle(AppColors.primary500)
                    ProgressView()
                }
            } else if authService.isAuthenticated {
                MainTabView(authService: authService)
            } else {
                LoginView(viewModel: AuthViewModel(authService: authService))
            }
        }
        .animation(.easeInOut, value: authService.isAuthenticated)
    }
}
