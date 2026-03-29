import SwiftUI

/// Horizontal scrollable bar showing all 7 wizard stages as tappable pills.
/// Each pill displays the stage label, completion count, and color-coded status.
struct StagePillsBar: View {
    let stages: [WizardStage]
    @Binding var currentStage: WizardStage
    let viewModel: PredictionEditViewModel

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(stages, id: \.self) { stage in
                        pillButton(for: stage)
                            .id(stage)
                    }
                }
                .padding(.horizontal)
            }
            .onChange(of: currentStage) { _, newStage in
                withAnimation {
                    proxy.scrollTo(newStage, anchor: .center)
                }
            }
        }
        .padding(.vertical, 8)
        .background(.bar)
    }

    // MARK: - Pill Button

    private func pillButton(for stage: WizardStage) -> some View {
        Button {
            currentStage = stage
        } label: {
            VStack(spacing: 2) {
                Text(pillLabel(for: stage))
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)

                if stage != .summary {
                    let counts = viewModel.stageCompletionCount(stage)
                    Text("\(counts.completed)/\(counts.total)")
                        .font(.caption.monospacedDigit())
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(pillColor(for: stage))
            .foregroundStyle(stage == currentStage ? .white : .primary)
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .strokeBorder(stage == currentStage ? Color.clear : Color(.systemGray4), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Pill Label

    private func pillLabel(for stage: WizardStage) -> String {
        switch stage {
        case .groupStage: return "Groups"
        case .roundOf32: return "R32"
        case .roundOf16: return "R16"
        case .quarterFinals: return "QF"
        case .semiFinals: return "SF"
        case .finals: return "Finals"
        case .summary: return "Summary"
        }
    }

    // MARK: - Pill Color

    private func pillColor(for stage: WizardStage) -> Color {
        if stage == currentStage {
            return AppColors.primary500
        }
        if stage == .summary {
            return viewModel.isComplete ? AppColors.success500.opacity(0.2) : Color(.systemGray5)
        }
        let counts = viewModel.stageCompletionCount(stage)
        if counts.completed == counts.total && counts.total > 0 {
            return AppColors.success500.opacity(0.2)
        } else if counts.completed > 0 {
            return AppColors.warning400.opacity(0.2)
        } else {
            return Color(.systemGray5)
        }
    }
}
