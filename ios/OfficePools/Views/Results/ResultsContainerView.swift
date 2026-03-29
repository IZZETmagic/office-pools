import SwiftUI

/// Standalone Results tab — wraps ResultsTabView with its own data loading, header, and profile menu.
struct ResultsContainerView: View {
    let authService: AuthService

    @State private var viewModel = ResultsViewModel()
    @State private var showingProfile = false

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.matches.isEmpty {
                    ProgressView("Loading matches...")
                } else if let error = viewModel.errorMessage, viewModel.matches.isEmpty {
                    ContentUnavailableView(
                        "Error",
                        systemImage: "exclamationmark.triangle",
                        description: Text(error)
                    )
                } else {
                    ResultsTabView(matches: viewModel.matches)
                }
            }
            .navigationTitle("Results")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    profileMenu
                }
            }
            .task {
                if let userId = authService.appUser?.userId {
                    await viewModel.loadMatches(userId: userId)
                    await viewModel.subscribeToMatchUpdates()
                }
            }
            .onDisappear {
                Task { await viewModel.unsubscribeFromMatchUpdates() }
            }
            .refreshable {
                if let userId = authService.appUser?.userId {
                    await viewModel.loadMatches(userId: userId)
                }
            }
            .navigationDestination(isPresented: $showingProfile) {
                ProfileView(authService: authService)
            }
            .navigationDestination(for: Match.self) { match in
                MatchDetailView(match: match, authService: authService)
            }
        }
    }

    // MARK: - Profile Menu

    private var profileMenu: some View {
        Menu {
            Button {
                showingProfile = true
            } label: {
                Label("Profile", systemImage: "person")
            }

            Divider()

            Button(role: .destructive) {
                Task { try? await authService.signOut() }
            } label: {
                Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
            }
        } label: {
            Image(systemName: "person.circle")
                .font(.title3)
        }
    }
}
