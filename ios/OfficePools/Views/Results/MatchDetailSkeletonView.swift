import SwiftUI

/// Skeleton loading view that mirrors the MatchDetailView layout with shimmer animation — SP design system.
struct MatchDetailSkeletonView: View {
    var isGroupMatch: Bool = false

    var body: some View {
        VStack(spacing: 16) {
            // MARK: - Match Info skeleton (stage, date, venue)
            matchInfoSkeleton

            // MARK: - Group Standings skeleton (group matches only)
            if isGroupMatch {
                groupStandingsSkeleton
            }

            // MARK: - Prediction Stats skeleton
            predictionStatsSkeleton

            // MARK: - Your Predictions skeleton (2 pool groups)
            predictionsSkeleton
        }
        .shimmer()
    }

    // Mirrors matchInfo: 3 info rows with icon + text
    private var matchInfoSkeleton: some View {
        VStack(spacing: 0) {
            skeletonInfoRow
            divider
            skeletonInfoRow
            divider
            skeletonInfoRow
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
        .padding(.horizontal, 20)
    }

    private var skeletonInfoRow: some View {
        HStack(spacing: 12) {
            SkeletonBlock(width: 18, height: 18, cornerRadius: 4)
                .frame(width: 24)
            SkeletonBlock(width: 140, height: 14, cornerRadius: 6)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var divider: some View {
        Rectangle()
            .fill(Color.sp.mist.opacity(0.5))
            .frame(height: 0.5)
            .padding(.horizontal, 14)
    }

    // Mirrors groupStandingsSection: header + 4-row table
    private var groupStandingsSkeleton: some View {
        VStack(alignment: .leading, spacing: 8) {
            SkeletonBlock(width: 160, height: 16, cornerRadius: 6)
                .padding(.horizontal, 20)

            VStack(spacing: 0) {
                // Header row
                HStack(spacing: 0) {
                    SkeletonBlock(width: 16, height: 10, cornerRadius: 3).frame(width: 24)
                    SkeletonBlock(width: 60, height: 10, cornerRadius: 3)
                    Spacer()
                    SkeletonBlock(width: 16, height: 10, cornerRadius: 3).frame(width: 24)
                    SkeletonBlock(width: 20, height: 10, cornerRadius: 3).frame(width: 32)
                    SkeletonBlock(width: 20, height: 10, cornerRadius: 3).frame(width: 32)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 6)

                divider

                // 4 team rows
                ForEach(0..<4, id: \.self) { index in
                    HStack(spacing: 0) {
                        SkeletonBlock(width: 12, height: 12, cornerRadius: 3).frame(width: 24)
                        SkeletonBlock(width: CGFloat.random(in: 60...90), height: 12, cornerRadius: 4)
                        Spacer()
                        SkeletonBlock(width: 12, height: 12, cornerRadius: 3).frame(width: 24)
                        SkeletonBlock(width: 16, height: 12, cornerRadius: 3).frame(width: 32)
                        SkeletonBlock(width: 16, height: 12, cornerRadius: 3).frame(width: 32)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 8)

                    if index < 3 {
                        divider
                    }
                }
            }
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
            .padding(.horizontal, 20)
        }
    }

    // Mirrors predictionStatsSection: header + distribution card + top scores card
    private var predictionStatsSkeleton: some View {
        VStack(alignment: .leading, spacing: 12) {
            // "How Others Predicted" header
            SkeletonBlock(width: 170, height: 16, cornerRadius: 6)
                .padding(.horizontal, 20)

            // Distribution card
            VStack(spacing: 12) {
                HStack {
                    SkeletonBlock(width: 100, height: 12, cornerRadius: 4)
                    Spacer()
                }

                // Bar
                SkeletonBlock(height: 8, cornerRadius: 4)

                // Three result labels
                HStack {
                    VStack(spacing: 4) {
                        SkeletonBlock(width: 36, height: 20, cornerRadius: 4)
                        SkeletonBlock(width: 50, height: 10, cornerRadius: 3)
                    }
                    Spacer()
                    VStack(spacing: 4) {
                        SkeletonBlock(width: 36, height: 20, cornerRadius: 4)
                        SkeletonBlock(width: 30, height: 10, cornerRadius: 3)
                    }
                    Spacer()
                    VStack(spacing: 4) {
                        SkeletonBlock(width: 36, height: 20, cornerRadius: 4)
                        SkeletonBlock(width: 50, height: 10, cornerRadius: 3)
                    }
                }
            }
            .padding(16)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
            .padding(.horizontal, 20)

            // Top scores card
            VStack(alignment: .leading, spacing: 10) {
                SkeletonBlock(width: 160, height: 14, cornerRadius: 6)

                ForEach(0..<3, id: \.self) { _ in
                    HStack {
                        SkeletonBlock(width: 40, height: 14, cornerRadius: 4)
                        SkeletonBlock(height: 6, cornerRadius: 3)
                        SkeletonBlock(width: 24, height: 12, cornerRadius: 3)
                        SkeletonBlock(width: 30, height: 10, cornerRadius: 3)
                    }
                }
            }
            .padding(16)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
            .padding(.horizontal, 20)
        }
    }

    // Mirrors predictionsSection: header + 2 pool cards with entries
    private var predictionsSkeleton: some View {
        VStack(alignment: .leading, spacing: 12) {
            // "Your Predictions" header
            SkeletonBlock(width: 140, height: 16, cornerRadius: 6)
                .padding(.horizontal, 20)

            // Pool card with 1 entry
            skeletonPoolCard(entryCount: 1)

            // Pool card with 2 entries
            skeletonPoolCard(entryCount: 2)
        }
    }

    private func skeletonPoolCard(entryCount: Int) -> some View {
        VStack(spacing: 0) {
            // Pool name header
            HStack {
                SkeletonBlock(width: 120, height: 14, cornerRadius: 6)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 10)

            Rectangle()
                .fill(Color.sp.mist)
                .frame(height: 0.5)
                .padding(.horizontal, 14)

            // Entry rows
            ForEach(0..<entryCount, id: \.self) { index in
                skeletonEntryRow

                if index < entryCount - 1 {
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
        .padding(.horizontal, 20)
    }

    private var skeletonEntryRow: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Top line: entry name + badge + points
            HStack {
                SkeletonBlock(width: 80, height: 14, cornerRadius: 6)
                Spacer()
                SkeletonBlock(width: 50, height: 18, cornerRadius: 9)
                SkeletonBlock(width: 44, height: 12, cornerRadius: 4)
            }

            // Bottom line: score
            HStack {
                Spacer()
                SkeletonBlock(width: 60, height: 16, cornerRadius: 4)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
}
