import SwiftUI

/// Native iOS-style stat card for the hero section.
struct StatCardView: View {
    let title: String
    let value: String
    let systemImage: String
    let iconColor: Color

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.title2)
                .foregroundStyle(iconColor)

            Text(value)
                .font(.title3.bold().monospacedDigit())
                .foregroundStyle(.primary)

            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .tracking(0.5)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .padding(.horizontal, 8)
        .background {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground))
        }
    }
}

#Preview {
    HStack(spacing: 10) {
        StatCardView(title: "Streak", value: "7", systemImage: "flame.fill", iconColor: .orange)
        StatCardView(title: "Best Rank", value: "#2", systemImage: "trophy.fill", iconColor: .yellow)
        StatCardView(title: "Points", value: "2,425", systemImage: "bolt.fill", iconColor: .blue)
    }
    .padding()
    .background(Color(.systemGroupedBackground))
}
