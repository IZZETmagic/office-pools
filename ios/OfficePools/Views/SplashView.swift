import SwiftUI

/// Branded splash screen shown while app data preloads.
/// Matches the SportPool design system: midnight background, brand blue accent, rounded typography.
struct SplashView: View {
    @State private var logoScale: CGFloat = 0.8
    @State private var logoOpacity: CGFloat = 0
    @State private var bobOffset: CGFloat = 0
    @State private var dotPhase: Int = 0
    @State private var dotDirection: Int = 1

    private let timer = Timer.publish(every: 0.4, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            // Background gradient matching the app's dark hero style
            LinearGradient(
                colors: [Color.sp.midnight, Color(hex: 0x111827)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                // App icon / trophy
                Image(systemName: "trophy.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color.sp.accent, Color(hex: 0xF0D060)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .scaleEffect(logoScale)
                    .offset(y: bobOffset)
                    .opacity(logoOpacity)

                // App name — two-tone matching header style
                HStack(spacing: 0) {
                    Text("Sport")
                        .foregroundStyle(.white)
                    Text("Pool")
                        .foregroundStyle(Color.sp.primary)
                }
                .font(.system(size: 36, weight: .heavy, design: .rounded))
                .opacity(logoOpacity)

                Spacer()

                // Loading dots
                HStack(spacing: 6) {
                    ForEach(0..<3, id: \.self) { index in
                        Circle()
                            .fill(Color.sp.primary.opacity(dotPhase == index ? 1.0 : 0.3))
                            .frame(width: 8, height: 8)
                            .scaleEffect(dotPhase == index ? 1.2 : 1.0)
                    }
                }
                .animation(.easeInOut(duration: 0.3), value: dotPhase)
                .padding(.bottom, 60)
            }
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.5)) {
                logoScale = 1.0
                logoOpacity = 1.0
            }
            // Start gentle bobbing after the entrance animation
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                    bobOffset = -8
                }
            }
        }
        .onReceive(timer) { _ in
            if dotPhase == 2 { dotDirection = -1 }
            else if dotPhase == 0 { dotDirection = 1 }
            dotPhase += dotDirection
        }
    }
}

#Preview {
    SplashView()
}
