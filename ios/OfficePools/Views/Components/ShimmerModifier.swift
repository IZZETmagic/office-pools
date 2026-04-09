import SwiftUI

/// A shimmer animation modifier that sweeps a highlight across the view.
struct ShimmerModifier: ViewModifier {
    @State private var phase: CGFloat = -1
    private let highlight = Color.adaptive(light: 0xFFFFFF, dark: 0xFFFFFF, opacity: 0.4)

    func body(content: Content) -> some View {
        content
            .overlay(
                LinearGradient(
                    stops: [
                        .init(color: .clear, location: max(0, phase - 0.3)),
                        .init(color: highlight, location: phase),
                        .init(color: .clear, location: min(1, phase + 0.3)),
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .blendMode(.screen)
            )
            .onAppear {
                withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) {
                    phase = 2
                }
            }
    }
}

extension View {
    func shimmer() -> some View {
        modifier(ShimmerModifier())
    }
}

/// A rounded rectangle placeholder block for skeleton layouts.
struct SkeletonBlock: View {
    var width: CGFloat? = nil
    var height: CGFloat = 14
    var cornerRadius: CGFloat = 6

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius)
            .fill(Color.sp.mist)
            .frame(width: width, height: height)
    }
}
