import SwiftUI

struct MatchDetailView: View {
    let match: Match
    let authService: AuthService

    @State private var viewModel: MatchDetailViewModel

    init(match: Match, authService: AuthService) {
        self.match = match
        self.authService = authService
        self._viewModel = State(initialValue: MatchDetailViewModel(match: match))
    }

    private var isLive: Bool { match.status == "live" }
    private var isFinished: Bool { match.isCompleted || match.status == "completed" }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                matchHeader
                matchInfo
                predictionsSection
            }
            .padding(.bottom, 24)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Match #\(match.matchNumber)")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if let userId = authService.appUser?.userId {
                await viewModel.loadPredictions(userId: userId)
            }
        }
    }

    // MARK: - Match Header

    private var matchHeader: some View {
        VStack(spacing: 16) {
            // Teams + Score/Time
            HStack(spacing: 0) {
                // Home team
                VStack(spacing: 8) {
                    flagView(url: match.homeTeam?.flagUrl, size: 48)
                    Text(match.homeDisplayName)
                        .font(.subheadline.weight(.semibold))
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                }
                .frame(maxWidth: .infinity)

                // Center: score or time
                VStack(spacing: 4) {
                    if isLive {
                        HStack(spacing: 6) {
                            Text("\(match.homeScoreFt ?? 0)")
                                .font(.title.weight(.bold).monospacedDigit())
                            Text("-")
                                .font(.title.weight(.bold))
                                .foregroundStyle(.secondary)
                            Text("\(match.awayScoreFt ?? 0)")
                                .font(.title.weight(.bold).monospacedDigit())
                        }
                        HStack(spacing: 4) {
                            Circle()
                                .fill(.red)
                                .frame(width: 6, height: 6)
                                .modifier(PulsingModifier())
                            Text("LIVE")
                                .font(.caption.bold())
                                .foregroundStyle(.red)
                        }
                    } else if isFinished {
                        HStack(spacing: 6) {
                            Text("\(match.homeScoreFt ?? 0)")
                                .font(.title.weight(.bold).monospacedDigit())
                            Text("-")
                                .font(.title.weight(.bold))
                                .foregroundStyle(.secondary)
                            Text("\(match.awayScoreFt ?? 0)")
                                .font(.title.weight(.bold).monospacedDigit())
                        }
                        if let homePso = match.homeScorePso, let awayPso = match.awayScorePso {
                            Text("(\(homePso)-\(awayPso) PSO)")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.purple)
                        }
                        Text("Full Time")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    } else {
                        Text(formattedTime)
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(width: 100)

                // Away team
                VStack(spacing: 8) {
                    flagView(url: match.awayTeam?.flagUrl, size: 48)
                    Text(match.awayDisplayName)
                        .font(.subheadline.weight(.semibold))
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                }
                .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 20)
        }
        .padding(.vertical, 20)
        .frame(maxWidth: .infinity)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
        .padding(.horizontal)
        .padding(.top, 8)
    }

    // MARK: - Match Info

    private var matchInfo: some View {
        VStack(spacing: 0) {
            infoRow(icon: "sportscourt", label: stageLabel)

            Divider().padding(.horizontal, 16)

            infoRow(icon: "calendar", label: formattedDate)

            if let venue = match.venue, !venue.isEmpty {
                Divider().padding(.horizontal, 16)
                infoRow(icon: "mappin.and.ellipse", label: venue)
            }
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
        .padding(.horizontal)
    }

    private func infoRow(icon: String, label: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(width: 24)
            Text(label)
                .font(.subheadline)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Predictions Section

    private var predictionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Your Predictions")
                .font(.headline)
                .padding(.horizontal)

            if viewModel.isLoading {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .padding(.vertical, 20)
            } else if viewModel.predictionInfos.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "questionmark.circle")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                    Text("No predictions found")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
                .background(Color(.systemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(viewModel.predictionInfos.enumerated()), id: \.element.id) { index, info in
                        predictionRow(info: info)

                        if index < viewModel.predictionInfos.count - 1 {
                            Divider().padding(.horizontal, 16)
                        }
                    }
                }
                .background(Color(.systemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
                .padding(.horizontal)
            }
        }
    }

    private func predictionRow(info: MatchPredictionInfo) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(info.poolName)
                    .font(.subheadline.weight(.medium))
                Text(info.entryName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if let pred = info.prediction {
                HStack(spacing: 4) {
                    Text("\(pred.predictedHomeScore)")
                        .font(.subheadline.weight(.bold).monospacedDigit())
                    Text("-")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.secondary)
                    Text("\(pred.predictedAwayScore)")
                        .font(.subheadline.weight(.bold).monospacedDigit())

                    if let homePso = pred.predictedHomePso, let awayPso = pred.predictedAwayPso {
                        Text("(\(homePso)-\(awayPso))")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.purple)
                    }
                }

                // Result badge if match is completed
                if isFinished {
                    resultBadge(for: pred)
                }
            } else {
                Text("No prediction")
                    .font(.caption)
                    .italic()
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Result Badge

    @ViewBuilder
    private func resultBadge(for prediction: Prediction) -> some View {
        let type = resultType(for: prediction)
        Text(type.label)
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(type.color.opacity(0.12))
            .foregroundStyle(type.color)
            .clipShape(RoundedRectangle(cornerRadius: 4))
    }

    private func resultType(for pred: Prediction) -> (label: String, color: Color) {
        guard let homeActual = match.homeScoreFt, let awayActual = match.awayScoreFt else {
            return ("Pending", .orange)
        }

        let predHome = pred.predictedHomeScore
        let predAway = pred.predictedAwayScore

        if predHome == homeActual && predAway == awayActual {
            return ("Exact", .green)
        }

        let actualOutcome = homeActual == awayActual ? 0 : (homeActual > awayActual ? 1 : -1)
        let predOutcome = predHome == predAway ? 0 : (predHome > predAway ? 1 : -1)

        if actualOutcome == predOutcome {
            let actualGD = homeActual - awayActual
            let predGD = predHome - predAway
            if actualGD == predGD {
                return ("Winner+GD", .blue)
            }
            return ("Winner", .blue)
        }

        return ("Miss", .red)
    }

    // MARK: - Helpers

    private var stageLabel: String {
        var label: String
        if let group = match.groupLetter {
            label = "Group \(group)"
        } else {
            switch match.stage {
            case "round_32", "round_of_32": label = "Round of 32"
            case "round_16", "round_of_16": label = "Round of 16"
            case "quarter_final": label = "Quarter Finals"
            case "semi_final": label = "Semi Finals"
            case "third_place": label = "Third Place"
            case "final": label = "Final"
            default: label = match.stage.replacingOccurrences(of: "_", with: " ").capitalized
            }
        }
        return "\(label) · Match #\(match.matchNumber)"
    }

    private var formattedDate: String {
        guard let date = match.parsedDate else { return match.matchDate }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMMM d 'at' h:mm a"
        return formatter.string(from: date)
    }

    private var formattedTime: String {
        guard let date = match.parsedDate else { return "--:--" }
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: date)
    }

    @ViewBuilder
    private func flagView(url: String?, size: CGFloat) -> some View {
        let width = size
        let height = size * 0.67
        if let flagUrl = url, let imageUrl = URL(string: flagUrl) {
            AsyncImage(url: imageUrl) { image in
                image.resizable().scaledToFit()
            } placeholder: {
                Color.clear
            }
            .frame(width: width, height: height)
            .clipShape(RoundedRectangle(cornerRadius: 4))
        } else {
            RoundedRectangle(cornerRadius: 4)
                .fill(Color(.systemGray5))
                .frame(width: width, height: height)
        }
    }
}
