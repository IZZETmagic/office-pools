import SwiftUI

/// FIFA World Cup 2026–branded countdown hero with dark background and subtle brand color accents.
struct CountdownHero: View {
    let tournamentName: String
    let daysRemaining: Int

    // World Cup 2026 brand colors
    private let wcPurple    = Color(hex: 0x4B2D8E)
    private let wcRed       = Color(hex: 0xDC0032)
    private let wcGreen     = Color(hex: 0x00B140)
    private let wcMagenta   = Color(hex: 0xE4007C)
    private let wcTurquoise = Color(hex: 0x00A3AD)
    private let wcYellow    = Color(hex: 0xFFD100)

    var body: some View {
        ZStack {
            // Dark base
            LinearGradient(
                colors: [Color(hex: 0x0A0A12), Color(hex: 0x12101E)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            // Subtle brand color glows
            Circle()
                .fill(wcPurple.opacity(0.35))
                .frame(width: 180, height: 180)
                .blur(radius: 60)
                .offset(x: -120, y: -50)

            Circle()
                .fill(wcRed.opacity(0.25))
                .frame(width: 150, height: 150)
                .blur(radius: 50)
                .offset(x: 100, y: -30)

            Circle()
                .fill(wcTurquoise.opacity(0.2))
                .frame(width: 120, height: 120)
                .blur(radius: 45)
                .offset(x: 130, y: 60)

            Circle()
                .fill(wcGreen.opacity(0.15))
                .frame(width: 100, height: 100)
                .blur(radius: 40)
                .offset(x: -80, y: 70)

            Circle()
                .fill(wcMagenta.opacity(0.12))
                .frame(width: 90, height: 90)
                .blur(radius: 35)
                .offset(x: 20, y: -70)

            // Content
            VStack(spacing: 8) {
                Text("FIFA WORLD CUP")
                    .font(SPTypography.caption)
                    .textCase(.uppercase)
                    .tracking(2)
                    .foregroundStyle(wcYellow)

                Text("\(daysRemaining)")
                    .font(SPTypography.mono(size: 56, weight: .bold))
                    .foregroundStyle(.white)

                Text("DAYS TO KICKOFF")
                    .font(SPTypography.caption)
                    .textCase(.uppercase)
                    .tracking(1.5)
                    .foregroundStyle(.white.opacity(0.7))
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 180)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
    }
}

#Preview {
    CountdownHero(tournamentName: "FIFA World Cup 2026", daysRemaining: 65)
        .padding(.horizontal, 20)
}
