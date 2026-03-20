import SwiftUI

struct PredictionsTabView: View {
    @Bindable var viewModel: PredictionsViewModel
    let matches: [Match]
    let entry: Entry?

    var body: some View {
        Group {
            if let entry {
                if entry.hasSubmittedPredictions {
                    submittedView(entry: entry)
                } else {
                    predictionEditor(entry: entry)
                }
            } else {
                ContentUnavailableView(
                    "No Entry",
                    systemImage: "doc.badge.plus",
                    description: Text("Create an entry to start making predictions.")
                )
            }
        }
        .task {
            if let entryId = entry?.entryId {
                await viewModel.loadPredictions(entryId: entryId)
            }
        }
    }

    // MARK: - Submitted View

    private func submittedView(entry: Entry) -> some View {
        List {
            Section {
                HStack {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(.green)
                    Text("Predictions submitted")
                        .font(.subheadline.weight(.medium))
                    Spacer()
                    Text("\(entry.totalPoints) pts")
                        .font(.headline.monospacedDigit())
                }
            }

            ForEach(matches) { match in
                if let pred = viewModel.existingPredictions.first(where: { $0.matchId == match.matchId }) {
                    SubmittedPredictionRow(match: match, prediction: pred)
                }
            }
        }
        .listStyle(.plain)
    }

    // MARK: - Prediction Editor

    private func predictionEditor(entry: Entry) -> some View {
        VStack(spacing: 0) {
            List {
                ForEach(matches) { match in
                    PredictionInputRow(
                        match: match,
                        prediction: Binding(
                            get: { viewModel.predictions[match.matchId] },
                            set: { input in
                                if let input {
                                    viewModel.predictions[match.matchId] = input
                                }
                            }
                        ),
                        onUpdate: { home, away in
                            viewModel.updatePrediction(matchId: match.matchId, homeScore: home, awayScore: away)
                        }
                    )
                }
            }
            .listStyle(.plain)

            // Action bar
            HStack {
                Button {
                    Task { await viewModel.saveDraft(entryId: entry.entryId) }
                } label: {
                    HStack {
                        if viewModel.isSaving {
                            ProgressView()
                                .controlSize(.small)
                        }
                        Text("Save Draft")
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(.fill.tertiary)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .disabled(viewModel.isSaving)

                Button {
                    Task { await viewModel.submit(entryId: entry.entryId) }
                } label: {
                    HStack {
                        if viewModel.isSubmitting {
                            ProgressView()
                                .controlSize(.small)
                        }
                        Text("Submit")
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(.accent)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .font(.headline)
                }
                .disabled(viewModel.isSubmitting)
            }
            .padding()
            .background(.bar)
        }
    }
}

// MARK: - Prediction Input Row

struct PredictionInputRow: View {
    let match: Match
    @Binding var prediction: PredictionInput?
    let onUpdate: (Int?, Int?) -> Void

    @State private var homeText = ""
    @State private var awayText = ""

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text(stageLabel)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.secondary)
                Spacer()
            }

            HStack {
                Text(match.homeDisplayName)
                    .font(.subheadline)
                    .frame(maxWidth: .infinity, alignment: .trailing)

                HStack(spacing: 8) {
                    TextField("", text: $homeText)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.center)
                        .frame(width: 40)
                        .padding(8)
                        .background(.fill.tertiary)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .onChange(of: homeText) {
                            onUpdate(Int(homeText), Int(awayText))
                        }

                    Text("-")
                        .foregroundStyle(.secondary)

                    TextField("", text: $awayText)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.center)
                        .frame(width: 40)
                        .padding(8)
                        .background(.fill.tertiary)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .onChange(of: awayText) {
                            onUpdate(Int(homeText), Int(awayText))
                        }
                }

                Text(match.awayDisplayName)
                    .font(.subheadline)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.vertical, 4)
        .onAppear {
            if let pred = prediction {
                homeText = pred.homeScore.map(String.init) ?? ""
                awayText = pred.awayScore.map(String.init) ?? ""
            }
        }
    }

    private var stageLabel: String {
        if let group = match.groupLetter {
            return "Group \(group)"
        }
        return match.stage.replacingOccurrences(of: "_", with: " ").capitalized
    }
}

// MARK: - Submitted Prediction Row

struct SubmittedPredictionRow: View {
    let match: Match
    let prediction: Prediction

    var body: some View {
        HStack {
            Text(match.homeDisplayName)
                .font(.subheadline)
                .frame(maxWidth: .infinity, alignment: .trailing)

            Text("\(prediction.predictedHomeScore) - \(prediction.predictedAwayScore)")
                .font(.headline.monospacedDigit())
                .padding(.horizontal, 12)

            Text(match.awayDisplayName)
                .font(.subheadline)
                .frame(maxWidth: .infinity, alignment: .leading)

            if match.isCompleted {
                pointsBadge
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private var pointsBadge: some View {
        if let homeActual = match.homeScoreFt, let awayActual = match.awayScoreFt {
            let isExact = prediction.predictedHomeScore == homeActual && prediction.predictedAwayScore == awayActual
            Image(systemName: isExact ? "checkmark.circle.fill" : "xmark.circle")
                .foregroundStyle(isExact ? .green : .red)
        }
    }
}
