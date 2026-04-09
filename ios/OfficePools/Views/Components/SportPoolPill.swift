import SwiftUI

/// Small uppercase pill tag — used for mode badges, status labels, deadline indicators.
struct SportPoolPill: View {
    let text: String
    let foreground: Color
    let background: Color

    var body: some View {
        Text(text)
            .font(SPTypography.caption)
            .textCase(.uppercase)
            .tracking(1.5)
            .padding(.vertical, 4)
            .padding(.horizontal, 10)
            .foregroundStyle(foreground)
            .background(background)
            .clipShape(Capsule())
    }
}

#Preview {
    HStack {
        SportPoolPill(text: "Full Tournament", foreground: Color.sp.primary, background: Color.sp.primaryLight)
        SportPoolPill(text: "Open", foreground: Color.sp.green, background: Color.sp.greenLight)
        SportPoolPill(text: "2d left", foreground: Color.sp.amber, background: Color.sp.amberLight)
    }
    .padding()
}
