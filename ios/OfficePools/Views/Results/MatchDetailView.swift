import SwiftUI

struct MatchDetailView: View {
    let initialMatch: Match
    let authService: AuthService

    @State private var viewModel: MatchDetailViewModel

    init(match: Match, authService: AuthService) {
        self.initialMatch = match
        self.authService = authService
        self._viewModel = State(initialValue: MatchDetailViewModel(match: match))
    }

    @State private var headerHeight: CGFloat = 140

    /// Use viewModel.match for live-updating data
    private var match: Match { viewModel.match }
    private var isLive: Bool { match.status == "live" }
    private var isFinished: Bool { match.isCompleted || match.status == "completed" }

    var body: some View {
        ZStack(alignment: .top) {
            // MARK: - Scrollable Content (behind header)
            ScrollView {
                VStack(spacing: 20) {
                    matchInfo
                    if let stats = viewModel.matchStats, stats.totalPredictions > 0 {
                        predictionStatsSection(stats)
                    }
                    predictionsSection
                }
                .padding(.top, headerHeight + 20)
                .padding(.bottom, 24)
            }
            .background(Color(.systemGroupedBackground))

            // MARK: - Fixed Header (floats on top with glass)
            matchHeader
        }
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if let userId = authService.appUser?.userId {
                await viewModel.loadPredictions(userId: userId)
                await viewModel.subscribeToMatchUpdates()
            }
        }
        .onDisappear {
            Task { await viewModel.unsubscribeFromMatchUpdates() }
        }
    }

    // MARK: - Match Header (Fixed)

    private var matchHeader: some View {
        VStack(spacing: 12) {
            // Teams + Score/Time
            HStack(spacing: 0) {
                // Home team
                VStack(spacing: 6) {
                    flagView(url: match.homeTeam?.flagUrl, size: 56)
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
                        Text(formattedShortDate)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(width: 100)

                // Away team
                VStack(spacing: 6) {
                    flagView(url: match.awayTeam?.flagUrl, size: 56)
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
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
        .shadow(color: .black.opacity(0.06), radius: 4, y: 2)
        .overlay(
            GeometryReader { geo in
                Color.clear
                    .onAppear { headerHeight = geo.size.height }
                    .onChange(of: geo.size.height) { _, newHeight in
                        headerHeight = newHeight
                    }
            }
        )
    }

    // MARK: - Match Info

    private var matchInfo: some View {
        VStack(spacing: 0) {
            infoRow(icon: "sportscourt", label: stageLabel)

            infoRow(icon: "calendar", label: formattedDate)

            if let venue = match.venue, !venue.isEmpty {
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

    // MARK: - Prediction Stats Section

    private func predictionStatsSection(_ stats: MatchStatsResponse) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("How Others Predicted")
                .font(.headline)
                .padding(.horizontal)

            // Result distribution bar
            resultDistributionCard(stats)

            // Top predicted scores
            if !stats.topScores.isEmpty {
                topScoresCard(stats)
            }

            // Accuracy stats (only if match is completed)
            if stats.exactCorrectPct != nil || stats.resultCorrectPct != nil {
                accuracyCard(stats)
            }
        }
    }

    private func resultDistributionCard(_ stats: MatchStatsResponse) -> some View {
        VStack(spacing: 12) {
            // Total predictions count
            HStack {
                Text("\(stats.totalPredictions) predictions")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
            }

            // Three-segment bar
            resultBar(stats)

            // Labels
            HStack {
                resultLabel(
                    match.homeTeam?.countryName ?? stats.homeTeam ?? "Home",
                    pct: stats.homeWinPct,
                    color: .blue
                )
                Spacer()
                resultLabel("Draw", pct: stats.drawPct, color: .gray)
                Spacer()
                resultLabel(
                    match.awayTeam?.countryName ?? stats.awayTeam ?? "Away",
                    pct: stats.awayWinPct,
                    color: .red
                )
            }
        }
        .padding(16)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
        .padding(.horizontal, 16)
    }

    private func resultBar(_ stats: MatchStatsResponse) -> some View {
        GeometryReader { geo in
            let width = geo.size.width
            let homeW = width * stats.homeWinPct
            let drawW = width * stats.drawPct
            let awayW = width * stats.awayWinPct

            HStack(spacing: 2) {
                if stats.homeWinPct > 0 {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.blue)
                        .frame(width: max(homeW, 4))
                }
                if stats.drawPct > 0 {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.gray.opacity(0.5))
                        .frame(width: max(drawW, 4))
                }
                if stats.awayWinPct > 0 {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.red)
                        .frame(width: max(awayW, 4))
                }
            }
        }
        .frame(height: 8)
    }

    private func resultLabel(_ team: String, pct: Double, color: Color) -> some View {
        VStack(spacing: 2) {
            Text("\(Int(pct * 100))%")
                .font(.system(.title3, design: .rounded, weight: .bold))
                .foregroundStyle(color)
            Text(team)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }

    private func topScoresCard(_ stats: MatchStatsResponse) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Most Predicted Scores")
                .font(.subheadline.weight(.semibold))

            ForEach(stats.topScores.prefix(5)) { score in
                HStack {
                    Text("\(score.home) - \(score.away)")
                        .font(.subheadline.weight(.medium).monospacedDigit())

                    GeometryReader { geo in
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Color.blue.opacity(0.2))
                            .frame(width: geo.size.width * score.pct)
                    }
                    .frame(height: 6)

                    Text("\(score.count)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                        .frame(width: 30, alignment: .trailing)

                    Text("(\(Int(score.pct * 100))%)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .frame(width: 36, alignment: .trailing)
                }
            }
        }
        .padding(16)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
        .padding(.horizontal, 16)
    }

    private func accuracyCard(_ stats: MatchStatsResponse) -> some View {
        HStack(spacing: 16) {
            if let exactPct = stats.exactCorrectPct {
                accuracyStat("Exact Score", pct: exactPct, color: .green)
            }
            if let resultPct = stats.resultCorrectPct {
                accuracyStat("Correct Result", pct: resultPct, color: .blue)
            }
        }
        .padding(16)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
        .padding(.horizontal, 16)
    }

    private func accuracyStat(_ label: String, pct: Double, color: Color) -> some View {
        VStack(spacing: 4) {
            Text("\(Int(pct * 100))%")
                .font(.system(.title2, design: .rounded, weight: .bold))
                .foregroundStyle(color)
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Predictions Section

    /// Group prediction infos by pool name, preserving order.
    private var groupedPredictions: [(poolName: String, entries: [MatchPredictionInfo])] {
        var order: [String] = []
        var grouped: [String: [MatchPredictionInfo]] = [:]
        for info in viewModel.predictionInfos {
            if grouped[info.poolName] == nil {
                order.append(info.poolName)
            }
            grouped[info.poolName, default: []].append(info)
        }
        return order.map { (poolName: $0, entries: grouped[$0]!) }
    }

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
                ForEach(groupedPredictions, id: \.poolName) { group in
                    VStack(spacing: 0) {
                        // Pool name header
                        HStack {
                            Text(group.poolName)
                                .font(.subheadline.weight(.semibold))
                            Spacer()
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)

                        Divider().padding(.horizontal, 16)

                        // Entry rows
                        ForEach(Array(group.entries.enumerated()), id: \.element.id) { index, info in
                            predictionRow(info: info)

                            if index < group.entries.count - 1 {
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
    }

    private var isKnockout: Bool {
        match.groupLetter == nil
    }

    private func predictionRow(info: MatchPredictionInfo) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            // Top line: entry name, then badge + points right-aligned
            HStack {
                Text(info.entryName)
                    .font(.subheadline.weight(.medium))

                Spacer()

                if (isFinished || isLive), let pred = info.prediction {
                    resultBadge(for: pred)

                    if let pts = info.matchPoints {
                        Text("+\(pts) pts")
                            .font(.caption.weight(.semibold).monospacedDigit())
                            .foregroundStyle(pts > 0 ? .green : .secondary)
                    }
                }
            }

            // Bottom line: teams and score, right-aligned
            if let pred = info.prediction {
                HStack(spacing: 4) {
                    Spacer()

                    if isKnockout {
                        Text(match.homeDisplayName)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }

                    Text("\(pred.predictedHomeScore)")
                        .font(.subheadline.weight(.bold).monospacedDigit())
                    Text("-")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.tertiary)
                    Text("\(pred.predictedAwayScore)")
                        .font(.subheadline.weight(.bold).monospacedDigit())

                    if isKnockout {
                        Text(match.awayDisplayName)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }

                    if let homePso = pred.predictedHomePso, let awayPso = pred.predictedAwayPso {
                        Text("(\(homePso)-\(awayPso) PSO)")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.purple)
                    }
                }
            } else {
                HStack {
                    Spacer()
                    Text("No prediction")
                        .font(.caption)
                        .italic()
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
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

    private var formattedShortDate: String {
        guard let date = match.parsedDate else { return "" }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
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
