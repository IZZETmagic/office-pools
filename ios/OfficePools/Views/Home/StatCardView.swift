import SwiftUI

/// Stat card for the Home dashboard — compact, SP-styled.
struct StatCardView: View {
    let title: String
    let value: String
    let systemImage: String
    let gradient: [Color]

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(
                    LinearGradient(
                        colors: gradient,
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            Text(value)
                .font(SPTypography.mono(size: 20, weight: .heavy))
                .foregroundStyle(Color.sp.ink)

            Text(title)
                .font(.system(size: 10, weight: .bold, design: .rounded))
                .foregroundStyle(Color.sp.slate)
                .textCase(.uppercase)
                .tracking(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .padding(.horizontal, 6)
        .background {
            RoundedRectangle(cornerRadius: SPDesign.Radius.md)
                .fill(Color.sp.surface)
        }
    }
}

#Preview {
    HStack(spacing: 10) {
        StatCardView(
            title: "Streak", value: "7",
            systemImage: "flame.fill",
            gradient: [Color(hex: 0xF97316), Color(hex: 0xEF4444)]
        )
        StatCardView(
            title: "Best Rank", value: "#2",
            systemImage: "trophy.fill",
            gradient: [Color(hex: 0xFBBF24), Color(hex: 0xD97706)]
        )
        StatCardView(
            title: "Points", value: "2,425",
            systemImage: "bolt.fill",
            gradient: [Color(hex: 0x667EEA), Color(hex: 0x3B6EFF)]
        )
    }
    .padding(.horizontal, 20)
    .padding(.vertical, 20)
    .background(Color.sp.snow)
}
