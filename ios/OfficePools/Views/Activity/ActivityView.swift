import SwiftUI

/// Activity tab — shows recent activity, notifications, and updates across all pools.
struct ActivityView: View {
    let authService: AuthService

    @State private var viewModel = ActivityViewModel()
    @State private var showingProfile = false
    @State private var scrollOffset: CGFloat = 0
    @State private var sectionsAppeared = false

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.activities.isEmpty {
                    ActivitySkeletonView()
                        .transition(.opacity)
                } else if let error = viewModel.errorMessage, viewModel.activities.isEmpty {
                    errorState(error)
                        .transition(.opacity)
                } else if viewModel.activities.isEmpty {
                    emptyState
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
                    await viewModel.load(userId: userId)
                    triggerEntranceAnimations()
                }
            }
            .refreshable {
                if let userId = authService.appUser?.userId {
                    await viewModel.load(userId: userId)
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }
            }
            .navigationDestination(isPresented: $showingProfile) {
                ProfileView(authService: authService)
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
                        Text("Your")
                            .font(SPTypography.pageTitle)
                            .foregroundStyle(Color.sp.ink)
                        Text("Feed")
                            .font(SPTypography.pageTitle)
                            .foregroundStyle(Color.sp.primary)
                    }

                    Text("Don't miss a beat")
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

            ScrollView {
                LazyVStack(spacing: 10) {
                    ForEach(viewModel.activities) { item in
                        ActivityCardView(item: item)
                            .padding(.horizontal, 20)
                    }

                }
                .padding(.top, 8)
                .padding(.bottom, 16)
                .entranceAnimation(sectionsAppeared, delay: 0.05)
            }
            .background(Color.sp.snow)
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

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 0) {
            headerSection
            Spacer()
            VStack(spacing: 12) {
                Image(systemName: "bell.slash")
                    .font(.system(size: 40))
                    .foregroundStyle(Color.sp.mist)
                Text("No Activity Yet")
                    .font(SPTypography.cardTitle)
                    .foregroundStyle(Color.sp.ink)
                Text("Your feed will light up as you play \u{2014} predictions, rank changes, badges, and more.")
                    .font(SPTypography.body)
                    .foregroundStyle(Color.sp.slate)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }
            Spacer()
        }
        .background(Color.sp.snow)
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
                            await viewModel.load(userId: userId)
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
}
