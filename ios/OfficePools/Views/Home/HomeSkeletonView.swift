import SwiftUI

/// Shimmer skeleton placeholder that mirrors the real dashboard layout.
struct HomeSkeletonView: View {
    var body: some View {
        VStack(spacing: 0) {
            // Header skeleton
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    SkeletonBlock(width: 140, height: 28, cornerRadius: 8)
                    SkeletonBlock(width: 180, height: 14, cornerRadius: 6)
                }
                Spacer()
                Circle()
                    .fill(Color(.systemGray5))
                    .frame(width: 40, height: 40)
            }
            .padding(.horizontal, 20)
            .padding(.top, 44)
            .padding(.bottom, 12)

            ScrollView(showsIndicators: false) {
                VStack(spacing: 24) {
                    // Stats row skeleton
                    HStack(spacing: 10) {
                        ForEach(0..<3, id: \.self) { _ in
                            statSkeleton
                        }
                    }
                    .padding(.horizontal, 20)

                    // Countdown/dark card skeleton
                    SkeletonBlock(height: 160, cornerRadius: CGFloat(SPDesign.Radius.lg))
                        .padding(.horizontal, 20)

                    // Pool cards skeleton
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            SkeletonBlock(width: 100, height: 18, cornerRadius: 6)
                            Spacer()
                        }
                        .padding(.horizontal, 20)

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                ForEach(0..<3, id: \.self) { _ in
                                    poolCardSkeleton
                                }
                            }
                            .padding(.horizontal, 20)
                        }
                    }

                    // Upcoming matches skeleton
                    VStack(alignment: .leading, spacing: 12) {
                        SkeletonBlock(width: 160, height: 18, cornerRadius: 6)
                            .padding(.horizontal, 20)

                        VStack(spacing: 8) {
                            ForEach(0..<3, id: \.self) { _ in
                                matchCardSkeleton
                            }
                        }
                        .padding(.horizontal, 20)
                    }
                }
                .padding(.top, 20)
                .padding(.bottom, 32)
            }
        }
        .background(Color.sp.snow)
        .shimmer()
    }

    // MARK: - Skeleton Pieces

    private var statSkeleton: some View {
        VStack(spacing: 8) {
            Circle()
                .fill(Color(.systemGray5))
                .frame(width: 20, height: 20)
            SkeletonBlock(width: 40, height: 20, cornerRadius: 6)
            SkeletonBlock(width: 50, height: 10, cornerRadius: 4)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background {
            RoundedRectangle(cornerRadius: SPDesign.Radius.md)
                .fill(Color.sp.surface)
        }
    }

    private var poolCardSkeleton: some View {
        VStack(alignment: .leading, spacing: 10) {
            SkeletonBlock(width: 60, height: 28, cornerRadius: 6)
            SkeletonBlock(width: 120, height: 14, cornerRadius: 6)
            Spacer()
            SkeletonBlock(width: 80, height: 10, cornerRadius: 4)
        }
        .padding(14)
        .frame(width: 220, height: 180)
        .background {
            RoundedRectangle(cornerRadius: SPDesign.Radius.lg)
                .fill(Color.sp.surface)
        }
    }

    private var matchCardSkeleton: some View {
        HStack {
            HStack(spacing: 10) {
                SkeletonBlock(width: 28, height: 20, cornerRadius: 4)
                SkeletonBlock(width: 36, height: 14, cornerRadius: 4)
            }
            Spacer()
            SkeletonBlock(width: 20, height: 14, cornerRadius: 4)
            Spacer()
            HStack(spacing: 10) {
                SkeletonBlock(width: 36, height: 14, cornerRadius: 4)
                SkeletonBlock(width: 28, height: 20, cornerRadius: 4)
            }
        }
        .padding(14)
        .background {
            RoundedRectangle(cornerRadius: SPDesign.Radius.md)
                .fill(Color.sp.surface)
        }
    }
}

#Preview {
    HomeSkeletonView()
}
