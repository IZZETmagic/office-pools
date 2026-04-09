import SwiftUI

/// Shimmer skeleton placeholder for the Activity tab while loading.
struct ActivitySkeletonView: View {
    var body: some View {
        VStack(spacing: 0) {
            // Header skeleton
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    SkeletonBlock(width: 160, height: 28, cornerRadius: 8)
                    SkeletonBlock(width: 140, height: 14, cornerRadius: 6)
                }
                Spacer()
                Circle()
                    .fill(Color.sp.mist)
                    .frame(width: 40, height: 40)
            }
            .padding(.horizontal, 20)
            .padding(.top, 44)
            .padding(.bottom, 12)

            // Activity cards skeleton
            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: 10) {
                    ForEach(0..<6, id: \.self) { _ in
                        skeletonCard
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
            }
        }
        .background(Color.sp.snow)
        .shimmer()
    }

    private var skeletonCard: some View {
        HStack(alignment: .top, spacing: 12) {
            // Unread dot placeholder
            Circle()
                .fill(Color.sp.mist)
                .frame(width: 8, height: 8)
                .padding(.top, 8)

            // Icon circle placeholder
            Circle()
                .fill(Color.sp.mist)
                .frame(width: 36, height: 36)

            // Text content placeholders
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    SkeletonBlock(width: 180, height: 14, cornerRadius: 6)
                    Spacer()
                    SkeletonBlock(width: 40, height: 10, cornerRadius: 4)
                }

                SkeletonBlock(width: 220, height: 12, cornerRadius: 4)

                SkeletonBlock(width: 80, height: 20, cornerRadius: 10)
            }
        }
        .padding(14)
        .background(Color.sp.surface)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
    }
}
