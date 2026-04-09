import SwiftUI

/// Amber-tinted action banner for empty states and "needs attention" prompts.
struct ActionBanner: View {
    let icon: String
    let title: String
    let subtitle: String
    let ctaLabel: String
    let action: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            Text(icon)
                .font(.title2)
                .frame(width: 44, height: 44)
                .background(Color.sp.amber.opacity(0.2))
                .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(SPTypography.cardTitle)
                    .foregroundStyle(Color.sp.ink)
                Text(subtitle)
                    .font(SPTypography.body)
                    .foregroundStyle(Color.sp.slate)
            }

            Spacer()

            Button(action: action) {
                Text(ctaLabel)
                    .font(SPTypography.cardTitle)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Color.sp.ink)
                    .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
            }
        }
        .padding(16)
        .background(Color.sp.accentLight)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
    }
}

#Preview {
    ActionBanner(
        icon: "🏆",
        title: "No pools yet",
        subtitle: "Join or create a pool to get started",
        ctaLabel: "Join"
    ) {}
    .padding()
}
