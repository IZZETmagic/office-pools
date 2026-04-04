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
                        .foregroundStyle(AppColors.primary800)

                    Text(message)
                        .font(.caption)
                        .foregroundStyle(AppColors.primary700)
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
                        .foregroundStyle(AppColors.primary400)
                        .padding(6)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(AppColors.primary50)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(AppColors.primary300.opacity(0.5), lineWidth: 1)
            )
            .padding(.horizontal)
            .transition(.opacity.combined(with: .move(edge: .top)))
        }
    }
}
