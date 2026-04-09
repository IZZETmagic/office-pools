import SwiftUI

/// A dismissable coaching tip styled as a referee's whistle call.
/// Uses @AppStorage so each tip (by key) is only shown once.
///
/// Usage:
///   RefereeTipCard(key: "score_input_tip", message: "Tap a score to cycle through values. Long press to type manually.")
///
struct RefereeTipCard: View {
    /// Unique key for persisting dismissal state.
    let key: String
    /// The tip message to display.
    let message: String

    @AppStorage private var dismissed: Bool

    init(key: String, message: String) {
        self.key = key
        self.message = message
        self._dismissed = AppStorage(wrappedValue: false, "tip_dismissed_\(key)")
    }

    var body: some View {
        if !dismissed {
            HStack(alignment: .top, spacing: 10) {
                Text("🟨")
                    .font(.title3)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Referee's Tip")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.sp.ink)

                    Text(message)
                        .font(.caption)
                        .foregroundStyle(Color.sp.primary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)

                Button {
                    withAnimation(.easeOut(duration: 0.2)) {
                        dismissed = true
                    }
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Color.sp.primary)
                        .padding(6)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.sp.primaryLight)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(Color.sp.silver, lineWidth: 1)
            )
            .padding(.horizontal)
            .transition(.opacity.combined(with: .move(edge: .top)))
        }
    }
}
