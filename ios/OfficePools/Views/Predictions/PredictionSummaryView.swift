import SwiftUI

/// Summary review before final submission of predictions.
/// Shows all predictions grouped by stage, highlights incomplete ones, and provides a submit button.
struct PredictionSummaryView: View {
    @Bindable var viewModel: PredictionEditViewModel
    let entry: Entry
    @Environment(\.dismiss) private var dismiss
    @State private var showConfirmation = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                List {
                    // Progress section
                    Section {
                        HStack {
                            Image(systemName: viewModel.isComplete ? "checkmark.circle.fill" : "circle.dashed")
                                .foregroundStyle(viewModel.isComplete ? .green : .orange)
                                .font(.title3)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(viewModel.progressText)
                                    .font(.headline)
                                if !viewModel.isComplete {
                                    Text("\(viewModel.incompletePredictions.count) predictions still needed")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                        }
                    }

                    // Predictions by stage
                    ForEach(viewModel.matchesByStage, id: \.stage) { group in
                        Section(header: Text(group.stage)) {
                            ForEach(group.matches) { match in
                                summaryRow(match: match)
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)

                // Submit button
                VStack(spacing: 8) {
                    if let error = viewModel.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }

                    Button {
                        showConfirmation = true
                    } label: {
                        HStack {
                            if viewModel.isSubmitting {
                                ProgressView()
                                    .controlSize(.small)
                                    .tint(.white)
                            }
                            Text("Submit Predictions")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(viewModel.isComplete ? Color.accentColor : Color.gray)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .disabled(!viewModel.isComplete || viewModel.isSubmitting)
                    .padding(.horizontal)

                    if !viewModel.isComplete {
                        Text("Complete all predictions to submit")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 12)
                .background(.bar)
            }
            .navigationTitle("Review Predictions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Back") { dismiss() }
                }
            }
            .alert("Submit Predictions?", isPresented: $showConfirmation) {
                Button("Cancel", role: .cancel) { }
                Button("Submit", role: .destructive) {
                    Task {
                        await viewModel.submitPredictions(entryId: entry.entryId)
                        if viewModel.submitSuccess {
                            dismiss()
                        }
                    }
                }
            } message: {
                Text("Once submitted, you cannot change your predictions. Make sure you're happy with all \(viewModel.totalCount) predictions.")
            }
        }
    }

    // MARK: - Summary Row

    private func summaryRow(match: Match) -> some View {
        let pred = viewModel.predictions[match.matchId]
        let isFilled = pred?.homeScore != nil && pred?.awayScore != nil
        let needsPso = viewModel.isKnockoutMatch(match) && pred?.homeScore == pred?.awayScore && isFilled
        let hasPso = pred?.homePso != nil && pred?.awayPso != nil && pred?.homePso != pred?.awayPso
        let isIncomplete = !isFilled || (needsPso && !hasPso)

        return HStack {
            Text(match.homeDisplayName)
                .font(.subheadline)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            if isFilled {
                VStack(spacing: 1) {
                    Text("\(pred!.homeScore!) - \(pred!.awayScore!)")
                        .font(.headline.monospacedDigit())
                    if needsPso && hasPso {
                        Text("(\(pred!.homePso!)-\(pred!.awayPso!) PSO)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal, 8)
            } else {
                Text("? - ?")
                    .font(.headline.monospacedDigit())
                    .foregroundStyle(.red)
                    .padding(.horizontal, 8)
            }

            Text(match.awayDisplayName)
                .font(.subheadline)
                .frame(maxWidth: .infinity, alignment: .leading)
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            Image(systemName: isIncomplete ? "exclamationmark.circle.fill" : "checkmark.circle.fill")
                .font(.caption)
                .foregroundStyle(isIncomplete ? .red : .green)
                .frame(width: 20)
        }
        .padding(.vertical, 2)
    }
}
