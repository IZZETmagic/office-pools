import SwiftUI

/// Root view — shows splash during preload, login if unauthenticated, or the main tab bar.
struct ContentView: View {
    @Bindable var authService: AuthService
    @Bindable var dataStore: AppDataStore

    /// Controls the crossfade from splash to main content.
    @State private var showSplash = true
    @AppStorage("sp_color_scheme") private var colorScheme: String = "system"

    var body: some View {
        Group {
            if authService.isLoading {
                // Auth session still resolving
                SplashView()
            } else if authService.isAuthenticated {
                if showSplash {
                    // Authenticated but data still preloading
                    SplashView()
                        .task {
                            if let userId = authService.appUser?.userId {
                                await dataStore.preload(userId: userId)
                            }
                            withAnimation(.easeInOut(duration: 0.4)) {
                                showSplash = false
                            }
                        }
                } else {
                    MainTabView(authService: authService)
                        .environment(dataStore)
                        .transition(.opacity)
                }
            } else {
                LoginView(viewModel: AuthViewModel(authService: authService))
            }
        }
        .animation(.easeInOut, value: authService.isAuthenticated)
        .preferredColorScheme(resolvedColorScheme)
        .onChange(of: authService.isAuthenticated) { _, isAuth in
            // Reset splash when user logs in so preload runs
            if isAuth {
                showSplash = true
            }
        }
    }

    private var resolvedColorScheme: ColorScheme? {
        switch colorScheme {
        case "light": return .light
        case "dark": return .dark
        default: return nil // system
        }
    }
}
