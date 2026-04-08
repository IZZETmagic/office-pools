import SwiftUI

/// Standalone Results tab — wraps ResultsTabView with SP header, data loading, and profile menu.
struct ResultsContainerView: View {
    let authService: AuthService

    @State private var viewModel = ResultsViewModel()
    @State private var showingProfile = false
    @State private var scrollOffset: CGFloat = 0
    @State private var sectionsAppeared = false

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.matches.isEmpty {
                    resultsSkeletonView
                        .transition(.opacity)
                } else if let error = viewModel.errorMessage, viewModel.matches.isEmpty {
                    errorState(error)
                        .transition(.opacity)
                } else {
                    mainContent
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.3), value: viewModel.isLoading)
            .navigationBarHidden(true)
            .task {
                if let userId = authService.appUser?.userId {
                    await viewModel.loadMatches(userId: userId)
                    await viewModel.subscribeToMatchUpdates()
                    triggerEntranceAnimations()
                }
            }
            .onDisappear {
                Task { await viewModel.unsubscribeFromMatchUpdates() }
            }
            .refreshable {
                if let userId = authService.appUser?.userId {
                    await viewModel.loadMatches(userId: userId)
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
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

    // MARK: - Scroll Collapse

    private let collapseThreshold: CGFloat = 50

    private var collapseProgress: CGFloat {
        min(1, max(0, scrollOffset / collapseThreshold))
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4 * (1 - collapseProgress)) {
                    HStack(spacing: 0) {
                        Text("Match")
                            .font(SPTypography.pageTitle)
                            .foregroundStyle(Color.sp.ink)
                        Text("Centre")
                            .font(SPTypography.pageTitle)
                            .foregroundStyle(Color.sp.primary)
                    }

                    Text("Where predictions meet reality")
                        .font(SPTypography.body)
                        .foregroundStyle(Color.sp.slate)
                        .opacity(1 - collapseProgress)
                        .frame(maxHeight: collapseProgress < 1 ? nil : 0, alignment: .top)
                        .clipped()
                }

                Spacer()

                Button {
                    showingProfile = true
                } label: {
                    Image(systemName: "person.crop.circle")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Color.sp.ink)
                        .frame(width: 40, height: 40)
                        .background(.ultraThinMaterial)
                        .clipShape(Circle())
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 44 - (12 * collapseProgress))
            .padding(.bottom, 12 - (4 * collapseProgress))
            .background(Color.sp.snow)
        }
        .animation(.easeOut(duration: 0.15), value: collapseProgress)
    }

    // MARK: - Main Content

    private var mainContent: some View {
        VStack(spacing: 0) {
            headerSection

            ResultsTabView(matches: viewModel.matches)
                .entranceAnimation(sectionsAppeared, delay: 0.05)
        }
        .background(Color.sp.snow)
    }

    // MARK: - Animations

    private func triggerEntranceAnimations() {
        guard !sectionsAppeared else { return }
        withAnimation(.easeOut(duration: 0.45)) {
            sectionsAppeared = true
        }
    }

    // MARK: - Error State

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 0) {
            headerSection
            Spacer()
            VStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 40))
                    .foregroundStyle(Color.sp.mist)
                Text("Unable to Load")
                    .font(SPTypography.cardTitle)
                    .foregroundStyle(Color.sp.ink)
                Text(message)
                    .font(SPTypography.body)
                    .foregroundStyle(Color.sp.slate)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
                Button("Try Again") {
                    Task {
                        if let userId = authService.appUser?.userId {
                            await viewModel.loadMatches(userId: userId)
                        }
                    }
                }
                .font(.system(size: 14, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
                .padding(.horizontal, 24)
                .padding(.vertical, 10)
                .background(Color.sp.primary, in: Capsule())
            }
            Spacer()
        }
        .background(Color.sp.snow)
    }

    // MARK: - Skeleton Loading

    private var resultsSkeletonView: some View {
        VStack(spacing: 0) {
            // Header skeleton
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    SkeletonBlock(width: 180, height: 28, cornerRadius: 8)
                    SkeletonBlock(width: 200, height: 14, cornerRadius: 6)
                }
                Spacer()
                Circle()
                    .fill(Color.sp.mist)
                    .frame(width: 40, height: 40)
            }
            .padding(.horizontal, 20)
            .padding(.top, 44)
            .padding(.bottom, 12)

            // Filter bar skeleton
            HStack(spacing: 6) {
                ForEach(0..<4, id: \.self) { _ in
                    SkeletonBlock(width: 60, height: 32, cornerRadius: 16)
                }
                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 8)

            // Match day cards skeleton
            ScrollView(showsIndicators: false) {
                VStack(spacing: 12) {
                    ForEach(0..<3, id: \.self) { _ in
                        matchDaySkeleton
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
            }
        }
        .background(Color.sp.snow)
        .shimmer()
    }

    private var matchDaySkeleton: some View {
        VStack(spacing: 0) {
            // Day header
            SkeletonBlock(width: 120, height: 14, cornerRadius: 6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.top, 14)
                .padding(.bottom, 10)

            Rectangle()
                .fill(Color.sp.mist)
                .frame(height: 0.5)
                .padding(.horizontal, 14)

            // Match rows
            ForEach(0..<3, id: \.self) { index in
                HStack {
                    HStack(spacing: 8) {
                        SkeletonBlock(width: 50, height: 14, cornerRadius: 4)
                        SkeletonBlock(width: 26, height: 18, cornerRadius: 3)
                    }
                    Spacer()
                    SkeletonBlock(width: 40, height: 14, cornerRadius: 4)
                    Spacer()
                    HStack(spacing: 8) {
                        SkeletonBlock(width: 26, height: 18, cornerRadius: 3)
                        SkeletonBlock(width: 50, height: 14, cornerRadius: 4)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)

                if index < 2 {
                    Rectangle()
                        .fill(Color.sp.mist.opacity(0.5))
                        .frame(height: 0.5)
                        .padding(.horizontal, 14)
                }
            }

            Spacer().frame(height: 4)
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
    }
}
